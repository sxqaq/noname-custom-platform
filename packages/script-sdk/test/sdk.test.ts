import assert from "node:assert/strict";
import test from "node:test";
import {
  compilePlugin,
  condition,
  definePackage,
  definePlugin,
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
