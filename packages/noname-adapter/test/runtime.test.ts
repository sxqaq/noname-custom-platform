import assert from "node:assert/strict";
import test from "node:test";
import { NonameCompatibleRuntime } from "../src/index.js";

test("兼容适配器能创建、快照并恢复权威规则实例", async () => {
  const runtime = new NonameCompatibleRuntime();
  await runtime.create({ seed: "fixed-seed", players: [{ id: "a", name: "甲" }, { id: "b", name: "乙" }] });
  const before = await runtime.viewFor("a") as { currentPlayerId: string; pending?: { playerId: string; kind: string } }; const snapshot = await runtime.snapshot();
  const actor = before.pending?.playerId ?? before.currentPlayerId;
  await runtime.dispatch(before.pending?.kind === "tuxi"
    ? { playerId: actor, requestId: "1", action: "activateSkill", payload: { skillId: "tuxi", targetIds: [] } }
    : { playerId: actor, requestId: "1", action: before.pending ? "respond" : "endTurn", payload: {} });
  await runtime.restore(snapshot); const restored = await runtime.viewFor("a");
  assert.equal(JSON.stringify(restored), JSON.stringify(before)); await runtime.dispose();
});
