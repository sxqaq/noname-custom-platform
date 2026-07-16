import type {
  CardDefinitionDto,
  DeckDefinitionDto,
  EffectDto,
  ExtensionPackageDto,
  GeneralDto,
  ModeDefinitionDto,
  SkillSelectionDto,
  SkillDto,
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
};
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
};
export const defineGeneral = (value: GeneralDto) => value;
export const defineCard = (value: CardDefinitionDto) => value;
export const defineDeck = (value: DeckDefinitionDto) => value;
export const defineMode = (value: ModeDefinitionDto) => value;
export function definePackage(
  value: Omit<ExtensionPackageDto, "schemaVersion">,
): ExtensionPackageDto {
  return { schemaVersion: 3, assets: [], ...value };
}

export interface PluginDefinition {
  apiVersion: "sgs.plugin/v1";
  engineApi: "rules-ir/v1";
  capabilities: Array<"rules" | "assets">;
  content: ExtensionPackageDto;
}

export interface CompiledPlugin {
  format: "sgs-compiled-plugin";
  formatVersion: 1;
  engineApi: "rules-ir/v1";
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
  if (value.engineApi !== "rules-ir/v1")
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
