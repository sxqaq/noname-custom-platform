import assert from "node:assert/strict";
import test from "node:test";
import {
  compilePlugin,
  condition,
  definePackage,
  definePlugin,
  defineRuntime,
  defineSkill,
  effect,
  modifier,
  ruleValue,
} from "../src/index.js";

test("SDK only produces declarative content", () => {
  const skill = defineSkill({
    id: "custom.draw",
    name: "整备",
    event: "turnStart",
    effects: [effect.draw(2)],
  });
  const pack = definePackage({
    id: "custom.sdk",
    name: "SDK包",
    version: "1.0.0",
    generals: [],
    skills: [skill],
    cards: [],
    decks: [],
    modes: [],
    tests: [],
  });
  assert.equal(pack.schemaVersion, 4);
  assert.deepEqual(pack.assets, []);
  assert.equal(pack.skills[0].effects[0].type, "draw");
});

test("advanced runtime hooks compile to a pinned self-contained manifest", () => {
  const runtime = defineRuntime<{ calls: number }>(
    (input) => ({
      state: { calls: (input.state?.calls ?? 0) + 1 },
      effects: [
        {
          type: "addMark",
          target: input.context.selectedPlayerId ? "selected" : "self",
          mark: "sdk_calls",
          count: 1,
        },
      ],
    }),
    { permissions: ["game-state", "deterministic-random"] },
  );
  const plugin = compilePlugin(
    definePlugin({
      engineApi: "rules-ir/v2",
      capabilities: ["rules", "advanced-runtime"],
      content: definePackage({
        id: "custom.advanced",
        name: "高级运行时",
        version: "1.0.0",
        generals: [],
        skills: [],
        cards: [],
        decks: [],
        modes: [],
        tests: [],
        runtime,
      }),
    }),
  );
  assert.equal(plugin.content.runtime?.apiVersion, "noname-compat/v1");
  assert.match(plugin.content.runtime?.source ?? "", /sdk_calls/);
  assert.doesNotMatch(
    JSON.stringify(plugin),
    /"runtime"\s*:\s*\{[^}]*function/,
  );
});

test("SDK v2 builds condition and state flow without executable functions", () => {
  const skill = defineSkill({
    id: "custom.flow",
    name: "蓄势",
    kind: "active",
    when: condition.wounded(),
    modifiers: [modifier("handLimit", 1, condition.wounded())],
    effects: [
      effect.setState("charge", 1),
      effect.when(
        condition.compare(
          ruleValue.state("charge"),
          "gte",
          ruleValue.number(1),
        ),
        [effect.repeat(2, [effect.draw(1)])],
      ),
    ],
  });
  const plugin = compilePlugin(
    definePlugin({
      engineApi: "rules-ir/v2",
      capabilities: ["rules"],
      content: definePackage({
        id: "custom.flow_pack",
        name: "流程包",
        version: "1.0.0",
        generals: [],
        skills: [skill],
        cards: [],
        decks: [],
        modes: [],
        tests: [],
      }),
    }),
  );
  assert.equal(plugin.engineApi, "rules-ir/v2");
  assert.equal(plugin.content.skills[0].effects[1].type, "if");
  assert.doesNotMatch(JSON.stringify(plugin), /function/);
});

test("SDK addresses exact runtime players and removes marks declaratively", () => {
  const remove = effect.forPlayer("player-b", effect.removeMark("charge", 2));
  const move = effect.moveCards({
    count: 1,
    fromPlayerId: "player-b",
    fromZone: "hand",
    toPlayerId: "player-c",
    toZone: "hand",
  });

  assert.equal(remove.targetPlayerId, "player-b");
  assert.equal(remove.type, "removeMark");
  assert.equal(move.targetPlayerId, "player-b");
  assert.equal(move.toPlayerId, "player-c");
});
