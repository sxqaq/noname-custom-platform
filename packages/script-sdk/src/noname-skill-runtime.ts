import type {
  NonameCompatPermissionDto,
  NonameCompatRuntimeDto,
} from "@sgs/protocol";

const PINNED_NONAME_COMMIT = "632d2d3c8da2893466a8c440a18861c9ed49813d";

export type NonameTriggerName =
  | "phaseDrawBegin2"
  | "damageBegin1"
  | "damageBegin2"
  | "damageBegin3"
  | "damageBegin4"
  | "damageSource"
  | "damageEnd"
  | "useCard"
  | "useCard1"
  | "useCard2"
  | "useCardToTarget"
  | "useCardToPlayered"
  | "useCardToTargeted";

type OneOrMany<T> = T | T[];

export interface NonameSkillTrigger {
  player?: OneOrMany<NonameTriggerName>;
  source?: OneOrMany<NonameTriggerName>;
  target?: OneOrMany<NonameTriggerName>;
  global?: OneOrMany<NonameTriggerName>;
}

export interface NonameCompatCollection<T> extends Array<T> {
  add(value: T): this;
  addArray(values: T[]): this;
  remove(value: T): T;
  removeArray(values: T[]): this;
}

export interface NonameCompatCard {
  id?: string;
  name: string;
  suit?: string;
  number?: number;
  type?: string;
  subtype?: string;
}

export interface NonameCompatPlayer {
  id: string;
  playerid: string;
  name: string;
  group?: string;
  sex?: string;
  hp: number;
  maxHp: number;
  storage: Record<string, unknown>;
  getCards(position?: string, filter?: unknown): NonameCompatCard[];
  countCards(position?: string, filter?: unknown): number;
  hasCard(filter?: unknown, position?: string): boolean;
  hasCards(position?: string): boolean;
  hasSkill(skillId: string): boolean;
  countMark(mark: string): number;
  isDamaged(): boolean;
  isHealthy(): boolean;
  isIn(): boolean;
  draw(count?: number): unknown;
  recover(amount?: number): unknown;
  damage(amount?: number): unknown;
  loseHp(amount?: number): unknown;
  addMark(mark: string, count?: number): unknown;
  removeMark(mark: string, count?: number): unknown;
  addSkill(skillId: string): unknown;
  addTempSkill(skillId: string): unknown;
  removeSkill(skillId: string): unknown;
  logSkill(skillId: string, target?: NonameCompatPlayer): unknown;
}

export interface NonameCompatEvent {
  id: string;
  name: NonameTriggerName;
  player?: NonameCompatPlayer;
  source?: NonameCompatPlayer;
  target?: NonameCompatPlayer;
  card?: NonameCompatCard;
  num?: number;
  numFixed?: boolean;
  targetIndex?: number;
  targets: NonameCompatCollection<NonameCompatPlayer>;
  directHit: NonameCompatCollection<NonameCompatPlayer>;
  excluded: NonameCompatCollection<NonameCompatPlayer>;
  set(key: string, value: unknown): this;
  cancel(): this;
  untrigger(): this;
  changeToZero(): this;
}

export interface NonameCompatGame {
  players: NonameCompatPlayer[];
  filterPlayer(
    filter?: (player: NonameCompatPlayer) => boolean,
  ): NonameCompatPlayer[];
  countPlayer(filter?: (player: NonameCompatPlayer) => boolean): number;
  hasPlayer(filter: (player: NonameCompatPlayer) => boolean): boolean;
  log(...items: unknown[]): void;
}

export interface NonameCompatGet {
  name(card: NonameCompatCard): string | undefined;
  suit(card: NonameCompatCard): string | undefined;
  number(card: NonameCompatCard): number | undefined;
  color(card: NonameCompatCard): "red" | "black";
  type(card: NonameCompatCard): string | undefined;
  type2(card: NonameCompatCard): string | undefined;
  translation(value: unknown): string;
}

declare global {
  /** Available only inside content/filter passed to defineNonameSkillRuntime. */
  const game: NonameCompatGame;
  /** Available only inside content/filter passed to defineNonameSkillRuntime. */
  const get: NonameCompatGet;
}

export interface NonameCompatSkillDefinition {
  id: string;
  trigger: NonameSkillTrigger | OneOrMany<NonameTriggerName>;
  forced?: boolean;
  filter?: (event: NonameCompatEvent, player: NonameCompatPlayer) => boolean;
  content: (
    event: NonameCompatEvent,
    trigger: NonameCompatEvent,
    player: NonameCompatPlayer,
  ) => unknown;
}

/**
 * Packages synchronous Noname-style trigger skills into the isolated advanced
 * runtime. Player mutations become declarative effects and trigger mutations
 * become authoritative rule-event patches; author code never receives the
 * real room state.
 */
export function defineNonameSkillRuntime(
  definitions: NonameCompatSkillDefinition[],
  options: {
    permissions?: NonameCompatPermissionDto[];
    upstreamCommit?: string;
    timeoutMs?: number;
    memoryMb?: number;
  } = {},
): NonameCompatRuntimeDto {
  if (!Array.isArray(definitions) || !definitions.length)
    throw new Error("At least one Noname-compatible skill is required");
  const ids = new Set<string>();
  const skills = definitions.map((definition) => {
    if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(definition.id))
      throw new Error(`Invalid Noname-compatible skill ID: ${definition.id}`);
    if (ids.has(definition.id))
      throw new Error(`Duplicate Noname-compatible skill ID: ${definition.id}`);
    ids.add(definition.id);
    if (typeof definition.content !== "function")
      throw new Error(`Skill ${definition.id} requires a content function`);
    return {
      id: definition.id,
      trigger: normalizeTrigger(definition.trigger),
      forced: definition.forced === true,
      filter: definition.filter ? functionSource(definition.filter) : undefined,
      content: functionSource(definition.content),
    };
  });
  const source = createRuntimeSource(skills);
  return {
    kind: "noname-compat",
    apiVersion: "noname-compat/v1",
    upstreamCommit: options.upstreamCommit ?? PINNED_NONAME_COMMIT,
    source,
    permissions: [
      ...new Set<NonameCompatPermissionDto>([
        "game-state",
        ...(options.permissions ?? []),
      ]),
    ],
    limits: {
      timeoutMs: options.timeoutMs ?? 500,
      memoryMb: options.memoryMb ?? 32,
    },
  };
}

function normalizeTrigger(
  trigger: NonameCompatSkillDefinition["trigger"],
): Record<string, NonameTriggerName[]> {
  if (typeof trigger === "string" || Array.isArray(trigger))
    return { player: normalizeTriggerNames(trigger) };
  if (!trigger || typeof trigger !== "object")
    throw new Error("Noname-compatible skill trigger must be declared");
  const result: Record<string, NonameTriggerName[]> = {};
  for (const role of ["player", "source", "target", "global"] as const) {
    if (trigger[role] !== undefined)
      result[role] = normalizeTriggerNames(trigger[role]);
  }
  if (!Object.keys(result).length)
    throw new Error("Noname-compatible skill trigger cannot be empty");
  return result;
}

function normalizeTriggerNames(
  value: OneOrMany<NonameTriggerName>,
): NonameTriggerName[] {
  const names = Array.isArray(value) ? value : [value];
  if (!names.length || names.some((name) => typeof name !== "string"))
    throw new Error(
      "Noname-compatible trigger names must be non-empty strings",
    );
  return [...new Set(names)];
}

function functionSource(value: Function) {
  let source = Function.prototype.toString.call(value).trim();
  if (/\[native code\]/.test(source))
    throw new Error("Native functions cannot be used as Noname skills");
  if (!source.includes("=>") && !/^\s*(?:async\s+)?function\b/.test(source)) {
    source = source.startsWith("async ")
      ? `async function ${source.slice(6)}`
      : `function ${source}`;
  }
  if (/^async\s+/.test(source) && !/\bawait\b/.test(source))
    source = source.replace(/^async\s+/, "");
  return source;
}

function createRuntimeSource(
  skills: Array<{
    id: string;
    trigger: Record<string, NonameTriggerName[]>;
    forced: boolean;
    filter?: string;
    content: string;
  }>,
) {
  const declarations = skills
    .map(
      (skill) =>
        `{id:${JSON.stringify(skill.id)},trigger:${JSON.stringify(skill.trigger)},forced:${skill.forced},filter:${skill.filter ? `(${skill.filter})` : "undefined"},content:(${skill.content})}`,
    )
    .join(",");
  return `(input) => {
    const skills = [${declarations}];
    if (input.hook !== "ruleEvent" || !input.context || !input.context.ruleEvent) return { state: input.state };
    const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const state = input.state && typeof input.state === "object" && !Array.isArray(input.state) ? clone(input.state) : {};
    state.storage = state.storage && typeof state.storage === "object" ? state.storage : {};
    const effects = [];
    const logs = [];
    const raw = clone(input.context.ruleEvent);
    const players = Array.isArray(input.game && input.game.players) ? input.game.players : [];
    const byId = new Map(players.map((player) => [player.id, player]));
    const cardColor = (card) => card && (card.suit === "heart" || card.suit === "diamond") ? "red" : "black";
    const cardsOf = (rawPlayer, position) => {
      const zones = new Set(String(position || "h"));
      return [
        ...(zones.has("h") && Array.isArray(rawPlayer.hand) ? rawPlayer.hand : []),
        ...(zones.has("e") && rawPlayer.equipment ? Object.values(rawPlayer.equipment) : []),
        ...(zones.has("j") && Array.isArray(rawPlayer.judgment) ? rawPlayer.judgment : []),
      ];
    };
    const matchesCard = (card, filter) => {
      if (filter == null) return true;
      if (typeof filter === "function") return Boolean(filter(card));
      if (typeof filter === "string") return card.name === filter;
      if (typeof filter !== "object") return false;
      return Object.entries(filter).every(([key, value]) => key === "color" ? cardColor(card) === value : card[key] === value);
    };
    const bounded = (value, fallback) => {
      const number = typeof value === "number" ? value : fallback;
      if (!Number.isInteger(number) || number < 0 || number > 20) throw new Error("Noname effect count must be an integer from 0 to 20");
      return number;
    };
    const emit = (playerId, effect) => {
      if (effects.length >= 256) throw new Error("Noname skills emitted more than 256 effects");
      effects.push({...effect, target:"selected", targetPlayerId:playerId});
      const projected = byId.get(playerId);
      if (projected) {
        if (effect.type === "recover") projected.hp = Math.min(projected.maxHp, projected.hp + effect.amount);
        else if (effect.type === "damage" || effect.type === "loseHp") projected.hp -= effect.amount;
        else if (effect.type === "addMark") { projected.marks = projected.marks || {}; projected.marks[effect.mark] = (projected.marks[effect.mark] || 0) + effect.count; }
        else if (effect.type === "removeMark") { projected.marks = projected.marks || {}; projected.marks[effect.mark] = Math.max(0, (projected.marks[effect.mark] || 0) - effect.count); }
        else if (effect.type === "grantSkill") { projected.grantedSkills = projected.grantedSkills || {}; projected.grantedSkills[effect.skillId] = effect.duration; }
        else if (effect.type === "removeSkill" && projected.grantedSkills) delete projected.grantedSkills[effect.skillId];
      }
      return { set() { return this; } };
    };
    const proxyCache = new Map();
    const playerProxy = (playerId) => {
      if (!playerId) return undefined;
      if (proxyCache.has(playerId)) return proxyCache.get(playerId);
      const value = byId.get(playerId);
      if (!value) return undefined;
      const storage = state.storage[playerId] || (state.storage[playerId] = {});
      const proxy = {
        id:value.id, playerid:value.id, name:value.name,
        group:value.general && value.general.faction, sex:value.general && value.general.gender,
        hp:value.hp, maxHp:value.maxHp, storage,
        getCards(position, filter) { return cardsOf(value, position).filter((card) => matchesCard(card, filter)); },
        countCards(position, filter) { return this.getCards(position, filter).length; },
        hasCard(filter, position) { return this.getCards(position, filter).length > 0; },
        hasCards(position) { return this.getCards(position).length > 0; },
        hasSkill(skillId) { return Boolean((value.general && value.general.skills || []).includes(skillId) || value.grantedSkills && value.grantedSkills[skillId]); },
        countMark(mark) { return value.marks && value.marks[mark] || 0; },
        isDamaged() { return value.hp < value.maxHp; }, isHealthy() { return value.hp >= value.maxHp; }, isIn() { return value.alive !== false; },
        draw(count) { return emit(value.id, {type:"draw", count:bounded(count, 1)}); },
        recover(amount) { return emit(value.id, {type:"recover", amount:bounded(amount, 1)}); },
        damage(amount) { return emit(value.id, {type:"damage", amount:bounded(amount, 1)}); },
        loseHp(amount) { return emit(value.id, {type:"loseHp", amount:bounded(amount, 1)}); },
        addMark(mark, count) { return emit(value.id, {type:"addMark", mark, count:bounded(count, 1)}); },
        removeMark(mark, count) { return emit(value.id, {type:"removeMark", mark, count:bounded(count, 1)}); },
        addSkill(skillId) { return emit(value.id, {type:"grantSkill", skillId, duration:"game"}); },
        addTempSkill(skillId) { return emit(value.id, {type:"grantSkill", skillId, duration:"turn"}); },
        removeSkill(skillId) { return emit(value.id, {type:"removeSkill", skillId}); },
        logSkill(skillId, target) { if (logs.length < 32) logs.push(value.name + " uses " + skillId + (target ? " on " + target.name : "")); return proxy; },
      };
      proxyCache.set(playerId, proxy);
      return proxy;
    };
    const samePlayer = (left, right) => left && right && left.id === right.id;
    const collection = (ids) => {
      const values = (Array.isArray(ids) ? ids : []).map(playerProxy).filter(Boolean);
      Object.defineProperties(values, {
        add:{value(value) { if (!this.some((item) => samePlayer(item, value))) this.push(value); return this; }},
        addArray:{value(items) { for (const item of items) this.add(item); return this; }},
        remove:{value(value) { const index = this.findIndex((item) => samePlayer(item, value)); if (index >= 0) this.splice(index, 1); return value; }},
        removeArray:{value(items) { for (const item of items) this.remove(item); return this; }},
      });
      return values;
    };
    const eventData = raw.data || {};
    const trigger = {
      ...eventData, id:raw.id, name:raw.name,
      player:playerProxy(raw.playerId), source:playerProxy(eventData.sourceId),
      target:playerProxy(eventData.targetId || (eventData.targetIds || [])[0]),
      card:eventData.card || (eventData.cardName ? {id:eventData.cardId, name:eventData.cardName} : undefined),
      targets:collection(eventData.targetIds), directHit:collection(eventData.directHitTargetIds), excluded:collection(eventData.excludedTargetIds),
      set(key, value) { this[key] = value; return this; },
      cancel() { this.cancelled = true; return this; }, untrigger() { this.cancelled = true; return this; },
      changeToZero() { this.num = 0; return this; },
      getParent() { return undefined; }, getTrigger() { return this; },
    };
    const game = {
      players:players.map((item) => playerProxy(item.id)),
      filterPlayer(filter) { return this.players.filter((item) => !filter || filter(item)); },
      countPlayer(filter) { return this.filterPlayer(filter).length; },
      hasPlayer(filter) { return this.players.some(filter); },
      log(...items) { if (logs.length < 32) logs.push(items.map((item) => item && item.name || String(item)).join(" ").slice(0, 200)); },
    };
    const get = {
      name(card) { return card && card.name; }, suit(card) { return card && card.suit; }, number(card) { return card && (card.number || card.rank); },
      color:cardColor, type(card) { return card && card.type; }, type2(card) { return card && card.type; },
      translation(value) { return value && value.name || String(value == null ? "" : value); },
    };
    const eventNames = (value) => Array.isArray(value) ? value : [];
    const roleMatches = (skill, owner) => {
      if (eventNames(skill.trigger.global).includes(raw.name)) return true;
      if (eventNames(skill.trigger.player).includes(raw.name) && owner.id === raw.playerId) return true;
      if (eventNames(skill.trigger.source).includes(raw.name) && owner.id === eventData.sourceId) return true;
      if (eventNames(skill.trigger.target).includes(raw.name) && (owner.id === eventData.targetId || (eventData.targetIds || []).includes(owner.id))) return true;
      return false;
    };
    for (const skill of skills) for (const rawOwner of players) {
      const owned = Boolean((rawOwner.general && rawOwner.general.skills || []).includes(skill.id) || rawOwner.grantedSkills && rawOwner.grantedSkills[skill.id]);
      if (!owned) continue;
      const player = playerProxy(rawOwner.id);
      if (!roleMatches(skill, player)) continue;
      if (skill.filter && !skill.filter(trigger, player)) continue;
      const event = {name:skill.id, player, getTrigger() { return trigger; }, getParent() { return trigger; }, set(key, value) { this[key] = value; return this; }};
      const result = skill.content(event, trigger, player);
      if (result && typeof result.then === "function") throw new Error("Async Noname skill content requires the host interaction protocol");
    }
    const ids = (items) => items.map((item) => item.id);
    const patch = {
      ...(trigger.num === undefined ? {} : {num:trigger.num}),
      ...(trigger.numFixed === undefined ? {} : {numFixed:trigger.numFixed}),
      ...(trigger.targetIndex === undefined ? {} : {targetIndex:trigger.targetIndex}),
      ...(trigger.card && trigger.card.name ? {cardName:trigger.card.name} : {}),
      targetIds:ids(trigger.targets), directHitTargetIds:ids(trigger.directHit), excludedTargetIds:ids(trigger.excluded),
    };
    return {state, effects, logs, ruleEvent:{cancelled:trigger.cancelled === true, data:patch}};
  }`;
}
