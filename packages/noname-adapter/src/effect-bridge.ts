import {
  type Card,
  type Effect,
  type GameState,
  HeadlessGame,
  type PlayerState,
} from "@sgs/headless-engine";
import { NonameInteractionHost } from "./interaction-host.js";

export interface NonameEffectBridgeSnapshot {
  version: 1;
  applied: boolean;
  effects: Effect[];
  logs: string[];
  storage: Record<string, Record<string, unknown>>;
}

export interface NonameEffectBridgeOptions {
  state: GameState;
  selfId: string;
  sourceId?: string;
  selectedId?: string;
  interactionHost?: NonameInteractionHost;
  checkpoint?: NonameEffectBridgeSnapshot;
}

class NonameEffectHandle {
  private readonly metadata: Record<string, unknown> = {};

  set(key: string, value: unknown) {
    this.metadata[key] = value;
    return this;
  }
}

/**
 * Presents authoritative structured state through a deliberately bounded
 * subset of Noname's player API. Mutating calls are converted to declarative
 * effects; they never mutate the real game until apply() performs one atomic
 * authoritative commit.
 */
export class NonameEffectBridge {
  private readonly shadow: GameState;
  private readonly pendingEffects: Effect[];
  private readonly runtimeLogs: string[];
  private readonly storage = new Map<string, Record<string, unknown>>();
  private readonly proxies = new Map<string, Record<string, any>>();
  private readonly selfId: string;
  private readonly sourceId: string;
  private readonly selectedId?: string;
  private readonly interactionHost?: NonameInteractionHost;
  private applied: boolean;

  constructor(options: NonameEffectBridgeOptions) {
    this.shadow = structuredClone(options.state);
    this.selfId = options.selfId;
    this.sourceId = options.sourceId ?? options.selfId;
    this.selectedId = options.selectedId;
    this.interactionHost = options.interactionHost;
    this.requirePlayer(this.selfId);
    this.requirePlayer(this.sourceId);
    if (this.selectedId) this.requirePlayer(this.selectedId);

    const checkpoint = options.checkpoint;
    if (checkpoint && checkpoint.version !== 1)
      throw new Error("Unsupported Noname effect bridge checkpoint version");
    this.pendingEffects = structuredClone(checkpoint?.effects ?? []);
    this.runtimeLogs = [...(checkpoint?.logs ?? [])];
    this.applied = checkpoint?.applied ?? false;
    for (const [playerId, value] of Object.entries(checkpoint?.storage ?? {})) {
      this.requirePlayer(playerId);
      this.storage.set(playerId, structuredClone(value));
    }
  }

  player(playerId: string): Record<string, any> {
    const cached = this.proxies.get(playerId);
    if (cached) return cached;
    const state = this.requirePlayer(playerId);
    const bridge = this;
    const base: Record<string, any> = {
      id: state.id,
      playerid: state.id,
      name: state.name,
      group: state.general.faction,
      sex: state.general.gender,
      get storage() {
        return bridge.playerStorage(playerId);
      },
      get hp() {
        return bridge.requirePlayer(playerId).hp;
      },
      get maxHp() {
        return bridge.requirePlayer(playerId).maxHp;
      },
      getCards(position?: unknown, filter?: unknown) {
        return bridge.cards(playerId, position, filter);
      },
      countCards(position?: unknown, filter?: unknown) {
        return bridge.cards(playerId, position, filter).length;
      },
      hasCard(filter?: unknown, position?: unknown) {
        return bridge.cards(playerId, position, filter).length > 0;
      },
      hasCards(position?: unknown) {
        return bridge.cards(playerId, position).length > 0;
      },
      getEquip(slotOrName?: unknown) {
        return bridge
          .equipment(playerId)
          .find((card) =>
            typeof slotOrName === "number"
              ? equipmentSlotNumber(card) === slotOrName
              : slotOrName === undefined ||
                card.name === slotOrName ||
                card.subtype === slotOrName,
          );
      },
      getEquips(name?: unknown) {
        return bridge
          .equipment(playerId)
          .filter((card) => name === undefined || card.name === name);
      },
      countMark(mark: string) {
        return bridge.requirePlayer(playerId).marks[mark] ?? 0;
      },
      hasMark(mark: string) {
        return (bridge.requirePlayer(playerId).marks[mark] ?? 0) > 0;
      },
      hasSkill(skillId: string) {
        return bridge.skills(playerId).includes(skillId);
      },
      getSkills() {
        return bridge.skills(playerId);
      },
      getStorage(key: string) {
        return bridge.playerStorage(playerId)[key] ?? [];
      },
      setStorage(key: string, value: unknown) {
        bridge.playerStorage(playerId)[key] = structuredClone(value);
        return value;
      },
      markAuto(key: string, values: unknown) {
        const current = bridge.playerStorage(playerId)[key];
        const list = Array.isArray(current) ? current : [];
        const additions = Array.isArray(values) ? values : [values];
        const next = [...list];
        for (const item of additions) {
          if (!next.some((existing) => sameValue(existing, item)))
            next.push(item);
        }
        bridge.playerStorage(playerId)[key] = next;
        return base;
      },
      unmarkAuto(key: string, values: unknown) {
        const removals = Array.isArray(values) ? values : [values];
        const current = bridge.playerStorage(playerId)[key];
        bridge.playerStorage(playerId)[key] = Array.isArray(current)
          ? current.filter(
              (item) => !removals.some((removal) => sameValue(removal, item)),
            )
          : [];
        return base;
      },
      getHp() {
        return bridge.requirePlayer(playerId).hp;
      },
      getDamagedHp() {
        const player = bridge.requirePlayer(playerId);
        return Math.max(0, player.maxHp - player.hp);
      },
      isDamaged() {
        const player = bridge.requirePlayer(playerId);
        return player.hp < player.maxHp;
      },
      isHealthy() {
        const player = bridge.requirePlayer(playerId);
        return player.hp >= player.maxHp;
      },
      isIn() {
        return bridge.requirePlayer(playerId).alive;
      },
      getNext() {
        return bridge.player(bridge.adjacentPlayer(playerId, 1).id);
      },
      getPrevious() {
        return bridge.player(bridge.adjacentPlayer(playerId, -1).id);
      },
      draw(count?: unknown) {
        return bridge.emit(playerId, {
          type: "draw",
          count: boundedCount(count, 1),
        });
      },
      drawTo(total: unknown) {
        const target = boundedCount(total, 0);
        const count = Math.max(
          0,
          target - bridge.requirePlayer(playerId).hand.length,
        );
        return bridge.emit(playerId, { type: "draw", count });
      },
      recover(amount?: unknown) {
        return bridge.emit(playerId, {
          type: "recover",
          amount: boundedCount(amount, 1),
        });
      },
      recoverTo(total: unknown) {
        const player = bridge.requirePlayer(playerId);
        const amount = Math.max(
          0,
          Math.min(player.maxHp, boundedCount(total, player.maxHp)) - player.hp,
        );
        return bridge.emit(playerId, { type: "recover", amount });
      },
      damage(...args: unknown[]) {
        return bridge.emit(playerId, {
          type: "damage",
          amount: numericArgument(args, 1),
        });
      },
      loseHp(amount?: unknown) {
        return bridge.emit(playerId, {
          type: "loseHp",
          amount: boundedCount(amount, 1),
        });
      },
      loseMaxHp(amount?: unknown) {
        return bridge.emit(playerId, {
          type: "changeMaxHp",
          value: -boundedCount(amount, 1),
        });
      },
      gainMaxHp(amount?: unknown) {
        return bridge.emit(playerId, {
          type: "changeMaxHp",
          value: boundedCount(amount, 1),
        });
      },
      addMark(mark: string, count?: unknown) {
        return bridge.emit(playerId, {
          type: "addMark",
          mark,
          count: boundedCount(count, 1),
        });
      },
      removeMark(mark: string, count?: unknown) {
        return bridge.emit(playerId, {
          type: "removeMark",
          mark,
          count: boundedCount(count, 1),
        });
      },
      addSkill(skillId: string) {
        return bridge.grantSkills(playerId, [skillId], "game");
      },
      addSkills(skillIds: string | string[]) {
        return bridge.grantSkills(
          playerId,
          Array.isArray(skillIds) ? skillIds : [skillIds],
          "game",
        );
      },
      addTempSkill(skillId: string, expiry?: unknown) {
        assertTurnExpiry(expiry);
        return bridge.grantSkills(playerId, [skillId], "turn");
      },
      removeSkill(skillId: string) {
        return bridge.removeSkills(playerId, [skillId]);
      },
      removeSkills(skillIds: string | string[]) {
        return bridge.removeSkills(
          playerId,
          Array.isArray(skillIds) ? skillIds : [skillIds],
        );
      },
      awakenSkill(skillId: string) {
        return bridge.emit(playerId, {
          type: "addMark",
          mark: `awakened.${skillId}`,
          count: 1,
        });
      },
      skip(phase: string) {
        return bridge.emit(playerId, {
          type: "skipPhase",
          phase: normalizePhase(phase),
        });
      },
      logSkill(skillId: string, target?: unknown) {
        bridge.log(
          `${state.name} uses ${skillId}${playerLabel(target) ? ` on ${playerLabel(target)}` : ""}`,
        );
        return base;
      },
      markSkill(skillId: string) {
        bridge.log(`${state.name} marks ${skillId}`);
        return base;
      },
      unmarkSkill(skillId: string) {
        bridge.log(`${state.name} unmarks ${skillId}`);
        return base;
      },
      line(target: unknown) {
        bridge.log(`${state.name} targets ${playerLabel(target) ?? "unknown"}`);
        return base;
      },
      popup(message: unknown) {
        bridge.log(`${state.name}: ${String(message ?? "")}`);
        return base;
      },
      chat(message: unknown) {
        bridge.log(`${state.name}: ${String(message ?? "")}`);
        return base;
      },
    };
    const proxy = this.interactionHost
      ? this.interactionHost.player(playerId, base)
      : base;
    this.proxies.set(playerId, proxy);
    return proxy;
  }

  effects() {
    return structuredClone(this.pendingEffects);
  }

  logs() {
    return [...this.runtimeLogs];
  }

  snapshot(): NonameEffectBridgeSnapshot {
    return {
      version: 1,
      applied: this.applied,
      effects: this.effects(),
      logs: this.logs(),
      storage: Object.fromEntries(
        [...this.storage].map(([id, value]) => [id, structuredClone(value)]),
      ),
    };
  }

  apply(game: HeadlessGame, hookId = "noname-effect-bridge") {
    if (this.applied)
      throw new Error("Noname effect bridge batch has already been applied");
    const events = game.applyExternalEffects(
      this.effects(),
      this.sourceId,
      this.selectedId,
      hookId,
      this.selfId,
    );
    this.applied = true;
    return events;
  }

  private emit(
    playerId: string,
    effect: Omit<Effect, "target" | "targetPlayerId">,
  ) {
    if (this.pendingEffects.length >= 256)
      throw new Error(
        "Noname skill emitted more than 256 authoritative effects",
      );
    const recorded: Effect = {
      ...effect,
      ...this.effectTarget(playerId),
    } as Effect;
    this.pendingEffects.push(recorded);
    this.project(recorded, playerId);
    return new NonameEffectHandle();
  }

  private effectTarget(
    playerId: string,
  ): Pick<Effect, "target" | "targetPlayerId"> {
    if (playerId === this.selfId) return { target: "self" };
    if (playerId === this.sourceId) return { target: "source" };
    if (playerId === this.selectedId) return { target: "selected" };
    return { target: "selected", targetPlayerId: playerId };
  }

  private project(effect: Effect, playerId: string) {
    const player = this.requirePlayer(playerId);
    if (effect.type === "draw") {
      for (let index = 0; index < (effect.count ?? 1); index++) {
        const card = this.shadow.deck.shift();
        if (card) player.hand.push(card);
      }
    } else if (effect.type === "recover") {
      player.hp = Math.min(player.maxHp, player.hp + (effect.amount ?? 1));
    } else if (effect.type === "damage" || effect.type === "loseHp") {
      player.hp -= effect.amount ?? 1;
    } else if (effect.type === "changeMaxHp") {
      player.maxHp = Math.max(1, player.maxHp + (effect.value ?? 0));
      player.hp = Math.min(player.hp, player.maxHp);
    } else if (effect.type === "addMark") {
      const mark = effect.mark ?? "mark";
      player.marks[mark] = (player.marks[mark] ?? 0) + (effect.count ?? 1);
    } else if (effect.type === "removeMark") {
      const mark = effect.mark ?? "mark";
      player.marks[mark] = Math.max(
        0,
        (player.marks[mark] ?? 0) - (effect.count ?? 1),
      );
      if (!player.marks[mark]) delete player.marks[mark];
    } else if (effect.type === "grantSkill" && effect.skillId) {
      player.grantedSkills[effect.skillId] = effect.duration ?? "turn";
    } else if (effect.type === "removeSkill" && effect.skillId) {
      delete player.grantedSkills[effect.skillId];
    }
  }

  private grantSkills(
    playerId: string,
    skillIds: string[],
    duration: "turn" | "game",
  ) {
    const handles = skillIds.map((skillId) =>
      this.emit(playerId, {
        type: "grantSkill",
        skillId,
        duration,
      }),
    );
    return handles.at(-1) ?? new NonameEffectHandle();
  }

  private removeSkills(playerId: string, skillIds: string[]) {
    const handles = skillIds.map((skillId) =>
      this.emit(playerId, { type: "removeSkill", skillId }),
    );
    return handles.at(-1) ?? new NonameEffectHandle();
  }

  private cards(playerId: string, position?: unknown, filter?: unknown) {
    if (typeof position !== "string") {
      filter = position ?? filter;
      position = "h";
    }
    const player = this.requirePlayer(playerId);
    const zones = new Set(String(position || "h"));
    const cards = [
      ...(zones.has("h") ? player.hand : []),
      ...(zones.has("e") ? this.equipment(playerId) : []),
      ...(zones.has("j") ? player.judgment : []),
    ];
    return cards.filter((card) => matchesCard(card, filter));
  }

  private equipment(playerId: string) {
    return Object.values(this.requirePlayer(playerId).equipment);
  }

  private skills(playerId: string) {
    const player = this.requirePlayer(playerId);
    return [
      ...new Set([
        ...player.general.skills,
        ...Object.keys(player.grantedSkills),
      ]),
    ];
  }

  private playerStorage(playerId: string) {
    let value = this.storage.get(playerId);
    if (!value) {
      value = {};
      this.storage.set(playerId, value);
    }
    return value;
  }

  private adjacentPlayer(playerId: string, direction: 1 | -1) {
    const players = this.shadow.players;
    let index = players.findIndex((player) => player.id === playerId);
    for (let offset = 0; offset < players.length; offset++) {
      index = (index + direction + players.length) % players.length;
      if (players[index].alive) return players[index];
    }
    return this.requirePlayer(playerId);
  }

  private requirePlayer(playerId: string): PlayerState {
    const player = this.shadow.players.find((item) => item.id === playerId);
    if (!player) throw new Error(`Unknown authoritative player: ${playerId}`);
    return player;
  }

  private log(message: string) {
    if (message.length > 200) message = message.slice(0, 200);
    if (this.runtimeLogs.length >= 32)
      throw new Error("Noname skill emitted more than 32 runtime logs");
    this.runtimeLogs.push(message);
  }
}

function boundedCount(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : fallback;
  if (!Number.isInteger(number) || number < 0 || number > 20)
    throw new Error("Noname numeric effect must be an integer from 0 to 20");
  return number;
}

function numericArgument(values: unknown[], fallback: number) {
  return boundedCount(
    values.find((value) => typeof value === "number"),
    fallback,
  );
}

function matchesCard(card: Card, filter: unknown) {
  if (filter === undefined || filter === null) return true;
  if (typeof filter === "function") return Boolean(filter(card));
  if (typeof filter === "string") return card.name === filter;
  if (typeof filter !== "object") return false;
  return Object.entries(filter as Record<string, unknown>).every(
    ([key, value]) => {
      if (key === "color")
        return (
          value ===
          (card.suit === "heart" || card.suit === "diamond" ? "red" : "black")
        );
      return (card as unknown as Record<string, unknown>)[key] === value;
    },
  );
}

function equipmentSlotNumber(card: Card) {
  return card.subtype === "weapon"
    ? 1
    : card.subtype === "armor"
      ? 2
      : card.subtype === "defensiveHorse"
        ? 3
        : card.subtype === "offensiveHorse"
          ? 4
          : 0;
}

function normalizePhase(phase: string): NonNullable<Effect["phase"]> {
  const mapped: Record<string, NonNullable<Effect["phase"]>> = {
    phaseJudge: "judge",
    phaseDraw: "draw",
    phaseUse: "play",
    phaseDiscard: "discard",
    phaseJieshu: "end",
    judge: "judge",
    draw: "draw",
    play: "play",
    discard: "discard",
    end: "end",
  };
  const result = mapped[phase];
  if (!result) throw new Error(`Unsupported Noname phase: ${phase}`);
  return result;
}

function assertTurnExpiry(expiry: unknown) {
  if (expiry === undefined) return;
  const values =
    typeof expiry === "string"
      ? [expiry]
      : Array.isArray(expiry)
        ? expiry
        : expiry && typeof expiry === "object"
          ? Object.values(expiry as Record<string, unknown>).flat()
          : [];
  const supported = new Set([
    "phaseAfter",
    "phaseJieshuBegin",
    "phaseJieshuEnd",
    "phaseEnd",
  ]);
  if (!values.length || values.some((value) => !supported.has(String(value))))
    throw new Error(
      `Unsupported Noname temporary-skill expiry: ${JSON.stringify(expiry)}`,
    );
}

function playerLabel(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const player = value as { id?: unknown; playerid?: unknown; name?: unknown };
  return String(player.name ?? player.id ?? player.playerid ?? "") || undefined;
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
