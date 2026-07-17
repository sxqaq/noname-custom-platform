import {
  defineGeneral,
  definePackage,
  definePlugin,
  defineRuntime,
} from "@sgs/script-sdk";

interface PluginState {
  calls: number;
}

const runtime = defineRuntime<PluginState>(
  (input) => ({
    state: { calls: (input.state?.calls ?? 0) + 1 },
    effects: [
      ...(input.hook === "roomStart"
        ? [
            {
              type: "addMark" as const,
              target: "self" as const,
              mark: "advanced_started",
              count: 1,
            },
          ]
        : []),
      ...(input.context.selectedPlayerId
        ? [
            {
              type: "addMark" as const,
              target: "selected" as const,
              mark: "advanced_targeted",
              count: 1,
            },
          ]
        : []),
    ],
    logs: [`handled ${input.hook}`],
  }),
  {
    permissions: ["game-state"],
    timeoutMs: 500,
    memoryMb: 32,
  },
);

export default definePlugin({
  engineApi: "rules-ir/v2",
  capabilities: ["rules", "advanced-runtime"],
  content: definePackage({
    id: "example.advanced_runtime",
    name: "高级运行时示例",
    version: "1.0.0",
    generals: [
      defineGeneral({
        id: "example.advanced_hero",
        name: "高级自定义武将",
        faction: "qun",
        hp: 4,
        skills: [],
      }),
    ],
    skills: [],
    cards: [],
    decks: [],
    modes: [],
    tests: [],
    runtime,
  }),
});
