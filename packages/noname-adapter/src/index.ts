import { createHash } from "node:crypto";
import {
  HeadlessGame,
  type ContentPackage,
  type GameCommand as EngineCommand,
  type GameLog,
} from "@sgs/headless-engine";

export * from "./compat-realm.js";
export * from "./compatibility-audit.js";
export * from "./interaction-host.js";
export * from "./isolated-mod-worker.js";

export interface GameCommand {
  playerId: string;
  requestId: string;
  action:
    | "useCard"
    | "respond"
    | "chooseCard"
    | "chooseSuit"
    | "arrangeCards"
    | "activateSkill"
    | "discardCards"
    | "endTurn";
  payload: {
    cardId?: string;
    targetId?: string;
    cardIds?: string[];
    skillId?: string;
    targetIds?: string[];
    suit?: "spade" | "heart" | "club" | "diamond";
    optionId?: string;
    numberValue?: number;
    topIds?: string[];
    bottomIds?: string[];
  };
}
export interface GameEvent {
  sequence: number;
  type: string;
  publicPayload: unknown;
  privatePayloads?: Record<string, unknown>;
}
export interface AuthoritativeGameRuntime {
  create(options: {
    seed: string;
    players: Array<{ id: string; name: string }>;
    packages?: ContentPackage[];
  }): Promise<void>;
  dispatch(command: GameCommand): Promise<GameEvent[]>;
  viewFor(playerId: string): Promise<unknown>;
  snapshot(): Promise<Uint8Array>;
  restore(snapshot: Uint8Array): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * 无名杀兼容边界的服务端实现。
 *
 * 上游武将包先转换为 ContentPackage，再进入无 DOM 引擎；浏览器端无权
 * 直接创建或恢复该实例。未来的上游字段映射只需修改本包。
 */
export class NonameCompatibleRuntime implements AuthoritativeGameRuntime {
  private game?: HeadlessGame;
  private packages: ContentPackage[] = [];
  async create(options: {
    seed: string;
    players: Array<{ id: string; name: string }>;
    packages?: ContentPackage[];
  }) {
    this.packages = structuredClone(options.packages ?? []);
    this.game = HeadlessGame.create({
      seed: seedNumber(options.seed),
      players: options.players,
      packages: this.packages,
    });
  }
  async dispatch(command: GameCommand) {
    const engineCommand: EngineCommand =
      command.action === "useCard"
        ? {
            type: "useCard",
            playerId: command.playerId,
            cardId: required(command.payload.cardId, "cardId"),
            targetId: command.payload.targetId,
            targetIds: command.payload.targetIds,
          }
        : command.action === "respond"
          ? {
              type: "respond",
              playerId: command.playerId,
              cardId: command.payload.cardId,
            }
          : command.action === "chooseCard"
            ? {
                type: "chooseCard",
                playerId: command.playerId,
                cardId: required(command.payload.cardId, "cardId"),
              }
            : command.action === "chooseSuit"
              ? {
                  type: "chooseSuit",
                  playerId: command.playerId,
                  suit: required(command.payload.suit, "suit") as
                    "spade" | "heart" | "club" | "diamond",
                }
              : command.action === "arrangeCards"
                ? {
                    type: "arrangeCards",
                    playerId: command.playerId,
                    topIds: command.payload.topIds ?? [],
                    bottomIds: command.payload.bottomIds ?? [],
                  }
                : command.action === "activateSkill"
                  ? {
                      type: "activateSkill",
                      playerId: command.playerId,
                      skillId: required(command.payload.skillId, "skillId"),
                      cardIds: command.payload.cardIds,
                      targetIds: command.payload.targetIds,
                      optionId: command.payload.optionId,
                      numberValue: command.payload.numberValue,
                      suit: command.payload.suit,
                    }
                  : command.action === "discardCards"
                    ? {
                        type: "discardCards",
                        playerId: command.playerId,
                        cardIds: command.payload.cardIds ?? [],
                      }
                    : { type: "endTurn", playerId: command.playerId };
    return this.requireGame().dispatch(engineCommand).map(toEvent);
  }
  async viewFor(playerId: string) {
    return this.requireGame().viewFor(playerId);
  }
  async snapshot() {
    return new TextEncoder().encode(this.requireGame().snapshot());
  }
  async restore(snapshot: Uint8Array) {
    this.game = HeadlessGame.restore(
      new TextDecoder().decode(snapshot),
      this.packages,
    );
  }
  async dispose() {
    this.game = undefined;
    this.packages = [];
  }
  private requireGame() {
    if (!this.game) throw new Error("规则运行时尚未创建");
    return this.game;
  }
}

function seedNumber(seed: string) {
  return createHash("sha256").update(seed).digest().readUInt32LE(0);
}
function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} 不能为空`);
  return value;
}
function toEvent(log: GameLog): GameEvent {
  return { sequence: log.sequence, type: log.type, publicPayload: log };
}
