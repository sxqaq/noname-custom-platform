import {
  defineGeneral,
  definePackage,
  definePlugin,
  defineSkill,
  effect,
  selection,
} from "@sgs/script-sdk";

const skill = defineSkill({
  id: "example.exchange",
  name: "换策",
  kind: "active",
  usage: "oncePerTurn",
  selections: [
    selection.card("example.cost", "弃置一张手牌", { consume: "discard" }),
    selection.target("example.target", "选择一名其他角色"),
  ],
  effects: [effect.draw(2), effect.damage(1, "selected")],
});

export default definePlugin({
  engineApi: "rules-ir/v1",
  capabilities: ["rules"],
  content: definePackage({
    id: "example.active_pack",
    name: "多段主动技示例",
    version: "1.0.0",
    generals: [
      defineGeneral({
        id: "example.strategist",
        name: "策士",
        faction: "qun",
        hp: 4,
        skills: [skill.id],
      }),
    ],
    skills: [skill],
    cards: [],
    decks: [],
    modes: [],
    tests: [],
  }),
});
