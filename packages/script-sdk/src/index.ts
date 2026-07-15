import type { CardDefinitionDto, DeckDefinitionDto, EffectDto, ExtensionPackageDto, GeneralDto, ModeDefinitionDto, SkillDto } from "@sgs/protocol";

/** 高级作者 SDK：构建可验证 DSL，不在服务器执行作者 JavaScript。 */
export const effect = {
  draw: (count = 1, target: EffectDto["target"] = "self"): EffectDto => ({ type: "draw", count, target }),
  recover: (amount = 1, target: EffectDto["target"] = "self"): EffectDto => ({ type: "recover", amount, target }),
  damage: (amount = 1, target: EffectDto["target"] = "selected"): EffectDto => ({ type: "damage", amount, target }),
  discard: (count = 1, target: EffectDto["target"] = "selected"): EffectDto => ({ type: "discard", count, target }),
  mark: (mark: string, count = 1, target: EffectDto["target"] = "self"): EffectDto => ({ type: "addMark", mark, count, target }),
};
export const defineSkill = (value: SkillDto) => value;
export const defineGeneral = (value: GeneralDto) => value;
export const defineCard = (value: CardDefinitionDto) => value;
export const defineDeck = (value: DeckDefinitionDto) => value;
export const defineMode = (value: ModeDefinitionDto) => value;
export function definePackage(value: Omit<ExtensionPackageDto, "schemaVersion">): ExtensionPackageDto { return { schemaVersion: 2, ...value }; }
