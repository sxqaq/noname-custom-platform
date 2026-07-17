import {
  condition,
  defineGeneral,
  definePackage,
  definePlugin,
  defineSkill,
  effect,
  ruleValue,
} from "@sgs/script-sdk";

const skill = defineSkill({
  id: "example.resolve",
  name: "蓄锐",
  kind: "active",
  usage: "oncePerTurn",
  when: condition.wounded(),
  effects: [
    effect.changeState("charge", 1),
    effect.when(
      condition.compare(ruleValue.state("charge"), "gte", ruleValue.number(2)),
      [effect.setState("charge", 0), effect.repeat(2, [effect.draw(1)])],
      [effect.recover(1)],
    ),
  ],
});

export default definePlugin({
  engineApi: "rules-ir/v2",
  capabilities: ["rules"],
  content: definePackage({
    id: "example.conditional_pack",
    name: "条件与状态示例",
    version: "1.0.0",
    generals: [
      defineGeneral({
        id: "example.resolve_hero",
        name: "蓄锐者",
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
