import {
  defineGeneral,
  definePackage,
  definePlugin,
  defineSkill,
  effect,
} from "@sgs/script-sdk";

const skill = defineSkill({
  id: "example.supply",
  name: "整备",
  kind: "trigger",
  event: "turnStart",
  effects: [effect.draw(1)],
});

export default definePlugin({
  engineApi: "rules-ir/v1",
  capabilities: ["rules"],
  content: definePackage({
    id: "example.trigger_pack",
    name: "简单触发技示例",
    version: "1.0.0",
    generals: [
      defineGeneral({
        id: "example.supply_master",
        name: "粮官",
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
