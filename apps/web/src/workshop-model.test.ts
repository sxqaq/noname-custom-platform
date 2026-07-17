import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneGeneral,
  createGeneral,
  createProject,
  migrateProject,
  uniqueId,
} from "./workshop-model.js";

test("workshop creates unique multi-general projects", () => {
  const project = createProject();
  const second = createGeneral(project.generals.map((item) => item.id));
  const copy = cloneGeneral(project.generals[0], [
    ...project.generals.map((item) => item.id),
    second.id,
  ]);
  assert.equal(new Set([project.generals[0].id, second.id, copy.id]).size, 3);
  assert.equal(copy.portraitAssetId, undefined);
  assert.equal(uniqueId("hero", ["hero", "hero_2"]), "hero_3");
});

test("legacy projects migrate to card-style schema v4", () => {
  const project = createProject();
  const legacy = {
    ...project,
    schemaVersion: 3 as const,
    generals: project.generals.map(
      ({ cardStyle: _cardStyle, ...general }) => general,
    ),
  };
  const migrated = migrateProject(legacy);
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.generals[0].cardStyle?.portraitX, 50);
  assert.deepEqual(migrated.assets, []);
});
