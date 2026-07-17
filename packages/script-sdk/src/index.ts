import type {
  CardDefinitionDto,
  DeckDefinitionDto,
  EffectDto,
  ExtensionPackageDto,
  GeneralDto,
  ModeDefinitionDto,
  RuleConditionDto,
  RuleSubjectDto,
  RuleValueDto,
  SkillSelectionDto,
  SkillDto,
  SkillModifierDto,
} from "@sgs/protocol";

/** 高级作者 SDK：构建可验证 DSL，不在服务器执行作者 JavaScript。 */
export const effect = {
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
      fromZone?: NonNullable<EffectDto["fromZone"]>;
      to?: NonNullable<EffectDto["to"]>;
      toZone?: NonNullable<EffectDto["toZone"]>;
    } = {},
  ): EffectDto => ({
    type: "moveCards",
    target: options.from ?? "selected",
    count: options.count ?? 1,
    fromZone: options.fromZone ?? "own",
    to: options.to ?? "self",
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
  capabilities: Array<"rules" | "assets">;
  content: ExtensionPackageDto;
}

export interface CompiledPlugin {
  format: "sgs-compiled-plugin";
  formatVersion: 1;
  engineApi: "rules-ir/v1" | "rules-ir/v2";
  capabilities: Array<"rules" | "assets">;
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
  if (capabilities.some((item) => item !== "rules" && item !== "assets"))
    throw new Error("Plugin requested an unsupported capability");
  return structuredClone({
    format: "sgs-compiled-plugin",
    formatVersion: 1,
    engineApi: value.engineApi,
    capabilities,
    content: value.content,
  });
}
