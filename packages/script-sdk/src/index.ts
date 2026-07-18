import type {
  CardDefinitionDto,
  DeckDefinitionDto,
  EffectDto,
  ExtensionPackageDto,
  GeneralDto,
  ModeDefinitionDto,
  NonameCompatPermissionDto,
  NonameCompatRuntimeDto,
  RuleConditionDto,
  RuleSubjectDto,
  RuleValueDto,
  SkillSelectionDto,
  SkillDto,
  SkillModifierDto,
} from "@sgs/protocol";

export const NONAME_COMPAT_UPSTREAM_COMMIT =
  "632d2d3c8da2893466a8c440a18861c9ed49813d";

type RuntimeRuleEventBase<Name extends string, Data> = Readonly<{
  id: string;
  name: Name;
  playerId: string;
  data: Readonly<Data & Record<string, unknown>>;
}>;

export type RuntimeRuleEvent =
  | RuntimeRuleEventBase<"phaseDrawBegin2", { num: number; numFixed?: boolean }>
  | RuntimeRuleEventBase<
      | "damageBegin1"
      | "damageBegin2"
      | "damageBegin3"
      | "damageBegin4"
      | "damageSource"
      | "damageEnd",
      {
        num: number;
        sourceId?: string;
        targetId: string;
        cardId?: string;
      }
    >
  | RuntimeRuleEventBase<
      | "useCard"
      | "useCard1"
      | "useCard2"
      | "useCardToTarget"
      | "useCardToPlayered"
      | "useCardToTargeted",
      {
        cardId: string;
        cardName: string;
        sourceId: string;
        targetIds: string[];
        targetId?: string;
        targetIndex?: number;
        directHitTargetIds: string[];
        excludedTargetIds: string[];
      }
    >;

export interface RuntimeHookInput<State = unknown> {
  apiVersion: "noname-compat/v1";
  hook: "roomStart" | "afterCommand" | "choiceResponse" | "ruleEvent";
  hookIndex: number;
  commandIndex?: number;
  packageId: string;
  state?: State;
  game: Readonly<Record<string, unknown>>;
  context: {
    command?: Readonly<{
      type: string;
      playerId: string;
      [key: string]: unknown;
    }>;
    events: ReadonlyArray<
      Readonly<{
        sequence: number;
        type: string;
        message: string;
        [key: string]: unknown;
      }>
    >;
    actorPlayerId?: string;
    selectedPlayerId?: string;
    choice?: {
      requestId: string;
      cardIds?: string[];
      targetIds?: string[];
      optionId?: string;
      numberValue?: number;
      suit?: "spade" | "heart" | "club" | "diamond";
    };
    ruleEvent?: RuntimeRuleEvent;
  };
}

export interface RuntimeHookOutput<State = unknown> {
  state?: State;
  effects?: EffectDto[];
  logs?: string[];
  request?: {
    playerId?: string;
    selection: SkillSelectionDto;
  };
  ruleEvent?: {
    cancelled?: boolean;
    data?: Record<string, unknown>;
  };
}

export type RuntimeHook<State = unknown> = (
  input: RuntimeHookInput<State>,
) => RuntimeHookOutput<State>;

/**
 * Compiles a self-contained synchronous hook into the advanced runtime manifest.
 * The hook cannot close over imported helpers or local variables: only its input,
 * JavaScript built-ins, and deterministic Math.random are available at runtime.
 */
export function defineRuntime<State = unknown>(
  hook: RuntimeHook<State>,
  options: {
    permissions?: NonameCompatPermissionDto[];
    upstreamCommit?: string;
    timeoutMs?: number;
    memoryMb?: number;
  } = {},
): NonameCompatRuntimeDto {
  if (typeof hook !== "function")
    throw new Error("Runtime hook must be a function");
  const source = Function.prototype.toString.call(hook);
  if (!source.includes("=>") && !/^\s*(?:async\s+)?function\b/.test(source))
    throw new Error(
      "Runtime hook must be an arrow function or function declaration",
    );
  if (/\[native code\]/.test(source))
    throw new Error("Native functions cannot be used as runtime hooks");
  return {
    kind: "noname-compat",
    apiVersion: "noname-compat/v1",
    upstreamCommit: options.upstreamCommit ?? NONAME_COMPAT_UPSTREAM_COMMIT,
    source,
    permissions: [
      ...new Set<NonameCompatPermissionDto>(
        options.permissions ?? (["game-state"] as NonameCompatPermissionDto[]),
      ),
    ],
    limits: {
      timeoutMs: options.timeoutMs ?? 500,
      memoryMb: options.memoryMb ?? 32,
    },
  };
}

/** 高级作者 SDK：构建可验证 DSL，不在服务器执行作者 JavaScript。 */
export const effect = {
  forPlayer: (playerId: string, value: EffectDto): EffectDto => ({
    ...value,
    targetPlayerId: playerId,
  }),
  draw: (count = 1, target: EffectDto["target"] = "self"): EffectDto => ({
    type: "draw",
    count,
    target,
  }),
  recover: (amount = 1, target: EffectDto["target"] = "self"): EffectDto => ({
    type: "recover",
    amount,
    target,
  }),
  damage: (
    amount = 1,
    target: EffectDto["target"] = "selected",
  ): EffectDto => ({ type: "damage", amount, target }),
  discard: (
    count = 1,
    target: EffectDto["target"] = "selected",
  ): EffectDto => ({ type: "discard", count, target }),
  mark: (
    mark: string,
    count = 1,
    target: EffectDto["target"] = "self",
  ): EffectDto => ({ type: "addMark", mark, count, target }),
  removeMark: (
    mark: string,
    count = 1,
    target: EffectDto["target"] = "self",
  ): EffectDto => ({ type: "removeMark", mark, count, target }),
  judge: (
    successSuits: Array<"spade" | "heart" | "club" | "diamond">,
    success: EffectDto[],
    failure: EffectDto[] = [],
    target: EffectDto["target"] = "self",
  ): EffectDto => ({
    type: "judge",
    target,
    successSuits,
    success,
    failure,
  }),
  when: (
    condition: RuleConditionDto,
    thenEffects: EffectDto[],
    elseEffects: EffectDto[] = [],
  ): EffectDto => ({
    type: "if",
    target: "self",
    condition,
    then: thenEffects,
    else: elseEffects,
  }),
  repeat: (times: number, body: EffectDto[]): EffectDto => ({
    type: "repeat",
    target: "self",
    times,
    body,
  }),
  setState: (stateKey: string, stateValue: number): EffectDto => ({
    type: "setState",
    target: "self",
    stateKey,
    value: stateValue,
  }),
  changeState: (stateKey: string, amount: number): EffectDto => ({
    type: "changeState",
    target: "self",
    stateKey,
    value: amount,
  }),
  loseHp: (amount = 1, target: EffectDto["target"] = "self"): EffectDto => ({
    type: "loseHp",
    amount,
    target,
  }),
  changeMaxHp: (
    amount: number,
    target: EffectDto["target"] = "self",
  ): EffectDto => ({ type: "changeMaxHp", value: amount, target }),
  grantSkill: (
    skillId: string,
    duration: "turn" | "game" = "turn",
    target: EffectDto["target"] = "self",
  ): EffectDto => ({ type: "grantSkill", skillId, duration, target }),
  removeSkill: (
    skillId: string,
    target: EffectDto["target"] = "self",
  ): EffectDto => ({ type: "removeSkill", skillId, target }),
  skipPhase: (
    phase: NonNullable<EffectDto["phase"]>,
    target: EffectDto["target"] = "self",
  ): EffectDto => ({ type: "skipPhase", phase, target }),
  moveCards: (
    options: {
      count?: number;
      from?: EffectDto["target"];
      fromPlayerId?: string;
      fromZone?: NonNullable<EffectDto["fromZone"]>;
      to?: NonNullable<EffectDto["to"]>;
      toPlayerId?: string;
      toZone?: NonNullable<EffectDto["toZone"]>;
    } = {},
  ): EffectDto => ({
    type: "moveCards",
    target: options.from ?? "selected",
    targetPlayerId: options.fromPlayerId,
    count: options.count ?? 1,
    fromZone: options.fromZone ?? "own",
    to: options.to ?? "self",
    toPlayerId: options.toPlayerId,
    toZone: options.toZone ?? "hand",
  }),
};
export const ruleValue = {
  number: (value: number): RuleValueDto => ({ kind: "number", value }),
  property: (
    property: Extract<RuleValueDto, { kind: "property" }>["property"],
    subject: RuleSubjectDto = "self",
    key?: string,
  ): RuleValueDto => ({ kind: "property", property, subject, key }),
  state: (key: string, subject: RuleSubjectDto = "self"): RuleValueDto => ({
    kind: "property",
    property: "state",
    subject,
    key,
  }),
  selection: (key: string, subject: RuleSubjectDto = "self"): RuleValueDto => ({
    kind: "property",
    property: "selection",
    subject,
    key,
  }),
};
export const condition = {
  compare: (
    left: RuleValueDto,
    comparator: Extract<RuleConditionDto, { op: "compare" }>["comparator"],
    right: RuleValueDto,
  ): RuleConditionDto => ({ op: "compare", comparator, left, right }),
  and: (...conditions: RuleConditionDto[]): RuleConditionDto => ({
    op: "and",
    conditions,
  }),
  or: (...conditions: RuleConditionDto[]): RuleConditionDto => ({
    op: "or",
    conditions,
  }),
  not: (value: RuleConditionDto): RuleConditionDto => ({
    op: "not",
    condition: value,
  }),
  wounded: (subject: RuleSubjectDto = "self"): RuleConditionDto => ({
    op: "predicate",
    predicate: "wounded",
    subject,
  }),
  hasSkill: (
    skillId: string,
    subject: RuleSubjectDto = "self",
  ): RuleConditionDto => ({
    op: "predicate",
    predicate: "hasSkill",
    subject,
    skillId,
  }),
};
export const modifier = (
  type: SkillModifierDto["type"],
  amount: number,
  when?: RuleConditionDto,
): SkillModifierDto => ({ type, amount, when });
export const defineSkill = (value: SkillDto) => value;
export const selection = {
  target: (
    id: string,
    prompt: string,
    options: {
      min?: number;
      max?: number;
      filter?: NonNullable<SkillSelectionDto["targetFilter"]>;
    } = {},
  ): SkillSelectionDto => ({
    id,
    prompt,
    kind: "target",
    min: options.min ?? 1,
    max: options.max ?? 1,
    targetFilter: options.filter ?? "other",
  }),
  card: (
    id: string,
    prompt: string,
    options: {
      min?: number;
      max?: number;
      zone?: NonNullable<SkillSelectionDto["cardZone"]>;
      consume?: NonNullable<SkillSelectionDto["consume"]>;
    } = {},
  ): SkillSelectionDto => ({
    id,
    prompt,
    kind: "card",
    min: options.min ?? 1,
    max: options.max ?? 1,
    cardZone: options.zone ?? "hand",
    consume: options.consume ?? "none",
  }),
  option: (
    id: string,
    prompt: string,
    options: Array<{ id: string; label: string; value?: number }>,
  ): SkillSelectionDto => ({
    id,
    prompt,
    kind: "option",
    min: 1,
    max: 1,
    options,
  }),
  number: (
    id: string,
    prompt: string,
    min: number,
    max: number,
  ): SkillSelectionDto => ({ id, prompt, kind: "number", min, max }),
  suit: (
    id: string,
    prompt: string,
    suits: Array<"spade" | "heart" | "club" | "diamond"> = [
      "spade",
      "heart",
      "club",
      "diamond",
    ],
  ): SkillSelectionDto => ({
    id,
    prompt,
    kind: "suit",
    min: 1,
    max: 1,
    suits,
  }),
};
export const defineGeneral = (value: GeneralDto) => value;
export const defineCard = (value: CardDefinitionDto) => value;
export const defineDeck = (value: DeckDefinitionDto) => value;
export const defineMode = (value: ModeDefinitionDto) => value;
export function definePackage(
  value: Omit<ExtensionPackageDto, "schemaVersion">,
): ExtensionPackageDto {
  return { schemaVersion: 4, assets: [], ...value };
}

export interface PluginDefinition {
  apiVersion: "sgs.plugin/v1";
  engineApi: "rules-ir/v1" | "rules-ir/v2";
  capabilities: Array<"rules" | "assets" | "advanced-runtime">;
  content: ExtensionPackageDto;
}

export interface CompiledPlugin {
  format: "sgs-compiled-plugin";
  formatVersion: 1;
  engineApi: "rules-ir/v1" | "rules-ir/v2";
  capabilities: Array<"rules" | "assets" | "advanced-runtime">;
  content: ExtensionPackageDto;
}

/** Defines locally compiled author code. Only the returned data crosses the host boundary. */
export function definePlugin(
  value: Omit<PluginDefinition, "apiVersion">,
): PluginDefinition {
  return { apiVersion: "sgs.plugin/v1", ...value };
}

export function compilePlugin(value: PluginDefinition): CompiledPlugin {
  if (value.apiVersion !== "sgs.plugin/v1")
    throw new Error(`Unsupported plugin API: ${String(value.apiVersion)}`);
  if (value.engineApi !== "rules-ir/v1" && value.engineApi !== "rules-ir/v2")
    throw new Error(`Unsupported rules API: ${String(value.engineApi)}`);
  const capabilities = [...new Set(value.capabilities)];
  if (
    capabilities.some(
      (item) =>
        item !== "rules" && item !== "assets" && item !== "advanced-runtime",
    )
  )
    throw new Error("Plugin requested an unsupported capability");
  if (value.content.runtime && !capabilities.includes("advanced-runtime"))
    throw new Error(
      "Plugin content includes a runtime but advanced-runtime capability is missing",
    );
  if (capabilities.includes("advanced-runtime") && !value.content.runtime)
    throw new Error(
      "Plugin requests advanced-runtime capability but defines no runtime",
    );
  return structuredClone({
    format: "sgs-compiled-plugin",
    formatVersion: 1,
    engineApi: value.engineApi,
    capabilities,
    content: value.content,
  });
}
