import assert from "node:assert/strict";
import test from "node:test";
import { PackageRegistry } from "../src/package-registry.js";

const content = { schemaVersion: 2 as const, id: "custom.test", name: "测试包", version: "1.0.0", generals: [{ id: "custom_hero", name: "测试将", faction: "qun", hp: 4, skills: ["custom_draw"] }], skills: [{ id: "custom_draw", name: "补给", event: "turnStart" as const, effects: [{ type: "draw" as const, target: "self" as const, count: 1 }] }], cards: [], decks: [], modes: [], tests: [{ id: "smoke", name: "冒烟", seed: 1, players: 2, expect: { noError: true } }] };
test("扩展版本通过哈希锁定、分享并且不可覆盖", () => { const registry = new PackageRegistry(); const published = registry.publish(content); const resolved = registry.resolve([{ id: content.id, version: content.version }]); assert.equal(resolved.locks[0].hash, published.hash); assert.equal(registry.byShareId(published.shareId).content.name, content.name); assert.throws(() => registry.publish({ ...content, name: "偷偷覆盖" }), /不可覆盖/); });
test("发布前运行扩展测试", () => { const registry = new PackageRegistry(); const result = registry.test(content); assert.equal(result.failed, 0); assert.equal(result.passed, 1); });
