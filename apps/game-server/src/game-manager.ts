import { randomInt, randomUUID } from "node:crypto";
import {
  HeadlessGame,
  chooseAiCommand,
  type GameCommand,
} from "@sgs/headless-engine";
import type {
  ExtensionPackageDto,
  GameView,
  ReplayDto,
  RoomState,
} from "@sgs/protocol";
import {
  NonameCompatRoomRuntime,
  type NonameCompatHookRecord,
  type NonameCompatPendingChoice,
} from "./noname-compat-room.js";

interface RunningGame {
  game: HeadlessGame;
  compat: NonameCompatRoomRuntime;
  config: {
    seed: number;
    players: Array<{ id: string; name: string }>;
    packages: ExtensionPackageDto[];
    modeId?: string;
    generalSelection?: boolean;
    compatSeed: string;
  };
  commands: RecordedCommand[];
  replayId: string;
  roomName: string;
  createdAt: string;
  updatedAt: number;
}
interface CompatChoiceCommand {
  type: "compatChoice";
  playerId: string;
  response: {
    requestId: string;
    cardIds?: string[];
    targetIds?: string[];
    optionId?: string;
    numberValue?: number;
    suit?: "spade" | "heart" | "club" | "diamond";
  };
}
type RecordedCommand = GameCommand | CompatChoiceCommand;
export class GameManager {
  private games = new Map<string, RunningGame>();
  private replays: ReplayDto[] = [];
  has(roomId: string) {
    return this.games.has(roomId);
  }
  async start(room: RoomState, packages: ExtensionPackageDto[]) {
    const seed = randomInt(1, 0x7fffffff);
    const config = {
      seed,
      players: room.players.map(({ id, name }) => ({ id, name })),
      packages,
      modeId: room.modeId,
      generalSelection: true,
      compatSeed: `${room.id}:${seed}`,
    };
    const game = HeadlessGame.create(config);
    const compat = new NonameCompatRoomRuntime(packages, config.compatSeed);
    await compat.run("roomStart", game);
    const running: RunningGame = {
      game,
      compat,
      config,
      commands: [],
      replayId: randomUUID(),
      roomName: room.name,
      createdAt: new Date().toISOString(),
      updatedAt: Date.now(),
    };
    this.games.set(room.id, running);
    this.saveReplay(running);
  }
  async action(
    roomId: string,
    playerId: string,
    action:
      | { action: "chooseGeneral"; generalId: string }
      | {
          action: "useCard";
          cardId: string;
          targetId?: string;
          targetIds?: string[];
        }
      | { action: "respond"; cardId?: string }
      | { action: "chooseCard"; cardId: string }
      | { action: "chooseSuit"; suit: "spade" | "heart" | "club" | "diamond" }
      | { action: "arrangeCards"; topIds: string[]; bottomIds: string[] }
      | {
          action: "activateSkill";
          skillId: string;
          cardIds?: string[];
          targetIds?: string[];
        }
      | {
          action: "modChoice";
          requestId: string;
          cardIds?: string[];
          targetIds?: string[];
          optionId?: string;
          numberValue?: number;
          suit?: "spade" | "heart" | "club" | "diamond";
        }
      | { action: "discardCards"; cardIds: string[] }
      | { action: "endTurn" },
  ) {
    const running = this.require(roomId);
    if (action.action === "modChoice") {
      await this.applyCompatChoice(running, playerId, action);
      return;
    }
    if (running.compat.pendingChoice())
      throw new Error("高级 Mod 正在等待玩家选择");
    const command: GameCommand =
      action.action === "chooseGeneral"
        ? {
            type: "chooseGeneral",
            playerId,
            generalId: action.generalId,
          }
        : action.action === "useCard"
          ? {
              type: "useCard",
              playerId,
              cardId: action.cardId,
              targetId: action.targetId,
              targetIds: action.targetIds,
            }
          : action.action === "respond"
            ? { type: "respond", playerId, cardId: action.cardId }
            : action.action === "chooseCard"
              ? { type: "chooseCard", playerId, cardId: action.cardId }
              : action.action === "chooseSuit"
                ? { type: "chooseSuit", playerId, suit: action.suit }
                : action.action === "arrangeCards"
                  ? {
                      type: "arrangeCards",
                      playerId,
                      topIds: action.topIds,
                      bottomIds: action.bottomIds,
                    }
                  : action.action === "activateSkill"
                    ? {
                        type: "activateSkill",
                        playerId,
                        skillId: action.skillId,
                        cardIds: action.cardIds,
                        targetIds: action.targetIds,
                      }
                    : action.action === "discardCards"
                      ? {
                          type: "discardCards",
                          playerId,
                          cardIds: action.cardIds,
                        }
                      : { type: "endTurn", playerId };
    await this.applyCommand(running, command);
  }
  async automate(roomId: string) {
    const running = this.require(roomId);
    if (running.game.state.status === "finished") return false;
    const compatPending = running.compat.pendingChoice();
    if (compatPending) {
      await this.applyCompatChoice(
        running,
        compatPending.playerId,
        aiChoice(compatPending, running.game),
      );
      return true;
    }
    const command = chooseAiCommand(running.game);
    await this.applyCommand(running, command);
    return true;
  }
  automationDue(
    room: RoomState,
    now = Date.now(),
    onlineMs = 90_000,
    offlineMs = 5_000,
  ) {
    const running = this.require(room.id);
    if (running.game.state.status === "finished") return false;
    const compatPending = running.compat.pendingChoice();
    const pending = running.game.state.pending;
    const expected =
      compatPending?.playerId ??
      (pending?.kind === "dying"
        ? pending.responders[pending.responderIndex]
        : (pending?.playerId ?? running.game.state.currentPlayerId));
    const offline =
      room.players.find((player) => player.id === expected)?.status ===
      "offline";
    return now - running.updatedAt >= (offline ? offlineMs : onlineMs);
  }
  view(roomId: string, playerId: string) {
    const running = this.require(roomId);
    const view = running.game.viewFor(playerId) as GameView;
    const pending = running.compat.pendingChoice();
    if (!pending) return view;
    view.pending =
      pending.playerId === playerId
        ? { kind: "modChoice", ...pending }
        : undefined;
    return view;
  }
  listReplays() {
    return structuredClone(this.replays);
  }
  replay(id: string, step?: number) {
    const running = [...this.games.values()].find(
      (candidate) => candidate.replayId === id,
    );
    if (!running) throw new Error("回放不存在");
    const count = Math.max(
      0,
      Math.min(step ?? running.commands.length, running.commands.length),
    );
    const game = HeadlessGame.create(running.config);
    const compat = new NonameCompatRoomRuntime(
      running.config.packages,
      running.config.compatSeed,
    );
    const hooks = running.compat.snapshot().records;
    hooks
      .filter(
        (record) =>
          record.hook === "roomStart" && record.commandIndex === undefined,
      )
      .forEach((record) => compat.replay(record, game));
    running.commands.slice(0, count).forEach((command, commandIndex) => {
      if (command.type !== "compatChoice") game.dispatch(command);
      hooks
        .filter((record) => record.commandIndex === commandIndex)
        .forEach((record) => compat.replay(record, game));
    });
    return {
      id,
      step: count,
      total: running.commands.length,
      view: game.viewFor() as GameView,
    };
  }
  private require(roomId: string) {
    const game = this.games.get(roomId);
    if (!game) throw new Error("对局尚未创建");
    return game;
  }
  private async applyCommand(running: RunningGame, command: GameCommand) {
    const gameBefore = running.game.snapshot();
    const compatBefore = running.compat.snapshot();
    const commandIndex = running.commands.length;
    try {
      const events = running.game.dispatch(command);
      await running.compat.run(
        "afterCommand",
        running.game,
        commandIndex,
        hookContext(command, events),
      );
      running.commands.push(command);
      running.updatedAt = Date.now();
      this.saveReplay(running);
    } catch (error) {
      running.game = HeadlessGame.restore(gameBefore, running.config.packages);
      running.compat = NonameCompatRoomRuntime.restore(
        running.config.packages,
        running.config.compatSeed,
        compatBefore,
      );
      throw error;
    }
  }
  private async applyCompatChoice(
    running: RunningGame,
    playerId: string,
    response: CompatChoiceCommand["response"] & {
      action?: "modChoice";
    },
  ) {
    const gameBefore = running.game.snapshot();
    const compatBefore = running.compat.snapshot();
    const commandIndex = running.commands.length;
    const { action: _, ...choice } = response;
    try {
      await running.compat.respond(
        running.game,
        playerId,
        choice,
        commandIndex,
      );
      running.commands.push({
        type: "compatChoice",
        playerId,
        response: structuredClone(choice),
      });
      running.updatedAt = Date.now();
      this.saveReplay(running);
    } catch (error) {
      running.game = HeadlessGame.restore(gameBefore, running.config.packages);
      running.compat = NonameCompatRoomRuntime.restore(
        running.config.packages,
        running.config.compatSeed,
        compatBefore,
      );
      throw error;
    }
  }
  private saveReplay(running: RunningGame) {
    const replay: ReplayDto = {
      id: running.replayId,
      roomName: running.roomName,
      createdAt: running.createdAt,
      seed: running.config.seed,
      players: running.config.players,
      commands: structuredClone(running.commands),
      finalSequence: running.game.state.sequence,
      compatHooks: running.compat.snapshot()
        .records as NonameCompatHookRecord[],
    };
    const index = this.replays.findIndex((item) => item.id === replay.id);
    if (index < 0) this.replays.unshift(replay);
    else this.replays[index] = replay;
  }
}

function hookContext(
  command: GameCommand,
  events: ReturnType<HeadlessGame["dispatch"]>,
) {
  const selectedPlayerId =
    "targetId" in command
      ? command.targetId
      : "targetIds" in command
        ? command.targetIds?.[0]
        : undefined;
  return {
    command,
    events,
    actorPlayerId: command.playerId,
    selectedPlayerId,
  };
}

function aiChoice(pending: NonameCompatPendingChoice, game: HeadlessGame) {
  const selection = pending.selection;
  const self = game.state.players.find(
    (player) => player.id === pending.playerId,
  )!;
  const targets = game.state.players.filter((player) => {
    if (!player.alive) return false;
    if (selection.kind !== "target") return false;
    if (selection.targetFilter === "self") return player.id === self.id;
    if (selection.targetFilter === "other") return player.id !== self.id;
    if (selection.targetFilter === "wounded") return player.hp < player.maxHp;
    return true;
  });
  const cards =
    selection.kind === "card"
      ? [
          ...(selection.cardZone === "hand" || selection.cardZone === "own"
            ? self.hand.map((card) => card.id)
            : []),
          ...(selection.cardZone === "own"
            ? Object.values(self.equipment).map((card) => card.id)
            : []),
        ]
      : [];
  return {
    action: "modChoice" as const,
    requestId: pending.requestId,
    targetIds:
      selection.kind === "target"
        ? targets.slice(0, selection.min).map((player) => player.id)
        : undefined,
    cardIds:
      selection.kind === "card" ? cards.slice(0, selection.min) : undefined,
    optionId:
      selection.kind === "option" ? selection.options?.[0]?.id : undefined,
    numberValue: selection.kind === "number" ? selection.min : undefined,
    suit: selection.kind === "suit" ? selection.suits?.[0] : undefined,
  };
}
