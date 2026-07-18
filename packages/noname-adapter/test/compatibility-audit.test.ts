import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  analyzeNonameApiUsage,
  auditPinnedNonameApiUsage,
  compatibilityForApi,
} from "../src/index.js";

const upstreamRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../vendor/noname",
);

test("兼容审计统计固定上游 API 并明确标记未知能力", async () => {
  const report = await auditPinnedNonameApiUsage(upstreamRoot);
  assert.equal(report.packCount, 26);
  assert.equal(report.usages.length, 612);
  assert.deepEqual(report.summary, {
    direct: 13,
    shimmed: 61,
    migrated: 41,
    unsupported: 497,
  });
  assert.deepEqual(report.callSummary, {
    direct: 2838,
    shimmed: 17929,
    migrated: 32249,
    unsupported: 33123,
  });
  assert.ok(report.usages.some((usage) => usage.api === "player.chooseTarget"));
  assert.ok(
    report.usages.some((usage) => usage.compatibility === "unsupported"),
  );
  assert.equal(
    report.usages.find((usage) => usage.api === "player.chooseTarget")
      ?.compatibility,
    "shimmed",
  );
});

test("迁移分析区分已迁移效果和未支持调用", () => {
  const usage = analyzeNonameApiUsage(
    `async function content() { await player.draw(2); evt.getParent(); trigger.targets.add(target); trigger.directHit.addArray(targets); game.broadcastAll(() => {}); Math.random(); }`,
  );
  assert.equal(usage.get("player.draw"), 1);
  assert.equal(compatibilityForApi("player.draw").compatibility, "migrated");
  assert.equal(usage.get("event.getParent"), 1);
  assert.equal(compatibilityForApi("event.getParent").compatibility, "shimmed");
  assert.equal(usage.get("event.targets.add"), 1);
  assert.equal(usage.get("event.directHit.addArray"), 1);
  assert.equal(
    compatibilityForApi("event.targets.add").compatibility,
    "shimmed",
  );
  assert.equal(
    compatibilityForApi("game.broadcastAll").compatibility,
    "unsupported",
  );
});
