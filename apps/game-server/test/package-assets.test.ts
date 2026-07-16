import assert from "node:assert/strict";
import test from "node:test";
import { PackageRegistry } from "../src/package-registry.js";

const hash = "a".repeat(64);
const content = {
  schemaVersion: 3 as const,
  id: "custom.asset_test",
  name: "资源检查扩展",
  version: "1.0.0",
  assets: [
    {
      id: "custom.portrait",
      hash,
      mediaType: "image/webp",
      bytes: 100,
      originalName: "portrait.webp",
      kind: "portrait" as const,
    },
  ],
  generals: [],
  skills: [],
  cards: [],
  decks: [],
  modes: [],
  tests: [],
};

test("package publication rejects asset hashes missing from the host", () => {
  const registry = new PackageRegistry(undefined, () => false);
  assert.throws(() => registry.publish(content), /资源不存在/);
});

test("package publication accepts content-addressed assets present on the host", () => {
  const registry = new PackageRegistry(
    undefined,
    (candidate) => candidate === hash,
  );
  assert.equal(registry.publish(content).content.assets?.[0].hash, hash);
});
