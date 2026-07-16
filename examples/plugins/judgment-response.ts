import {
  defineGeneral,
  definePackage,
  definePlugin,
  defineSkill,
  effect,
} from "@sgs/script-sdk";

const skill = defineSkill({
  id: "example.divination",
  name: "问卦",
  kind: "active",
  usage: "oncePerTurn",
  effects: [
    effect.judge(
      ["heart", "diamond"],
      [effect.draw(2)],
      [effect.damage(1, "self")],
    ),
    effect.mark("example.divination_done"),
  ],
});

export default definePlugin({
  engineApi: "rules-ir/v1",
  capabilities: ["rules"],
  content: definePackage({
    id: "example.judgment_pack",
    name: "判定响应示例",
    version: "1.0.0",
    generals: [
      defineGeneral({
        id: "example.oracle",
        name: "卜者",
        faction: "qun",
        hp: 3,
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
