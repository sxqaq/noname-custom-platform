import assert from "node:assert/strict";
import test from "node:test";
import { definePackage, defineSkill, effect } from "../src/index.js";

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
  assert.equal(pack.schemaVersion, 3);
  assert.deepEqual(pack.assets, []);
  assert.equal(pack.skills[0].effects[0].type, "draw");
});
