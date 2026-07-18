import {
  defineGeneral,
  defineNonameSkillRuntime,
  definePackage,
  definePlugin,
  defineSkill,
} from "@sgs/script-sdk";

const skill = defineSkill({
  id: "example.piercing_sha",
  name: "破阵",
  runtimeOnly: true,
  kind: "trigger",
  effects: [],
});

const runtime = defineNonameSkillRuntime([
  {
    id: skill.id,
    trigger: { source: "useCardToTarget" },
    filter(event, player) {
      return get.name(event.card!) === "sha" && player.isIn();
    },
    content(_event, trigger, player) {
      if (!trigger.target) return;
      player.logSkill("example.piercing_sha", trigger.target);
      trigger.directHit.add(trigger.target);
    },
  },
]);

export default definePlugin({
  engineApi: "rules-ir/v2",
  capabilities: ["rules", "advanced-runtime"],
  content: definePackage({
    id: "example.noname_compatible_skill",
    name: "无名杀兼容技能示例",
    version: "1.0.0",
    generals: [
      defineGeneral({
        id: "example.piercing_general",
        name: "破阵将",
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
    runtime,
  }),
});
