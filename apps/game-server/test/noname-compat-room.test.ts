import assert from "node:assert/strict";
import test from "node:test";
import { HeadlessGame } from "@sgs/headless-engine";
import type { ExtensionPackageDto } from "@sgs/protocol";
import { NonameCompatRoomRuntime } from "../src/noname-compat-room.js";

const advancedPack = (): ExtensionPackageDto => ({
  schemaVersion: 4,
  id: "test.authoritative_mod",
  name: "权威高级扩展",
  version: "1.0.0",
  assets: [],
  generals: [],
  skills: [],
  cards: [],
  decks: [],
  modes: [],
  tests: [],
  runtime: {
    kind: "noname-compat",
    apiVersion: "noname-compat/v1",
    upstreamCommit: "632d2d3c8da2893466a8c440a18861c9ed49813d",
    permissions: ["game-state", "deterministic-random"],
    limits: { timeoutMs: 500, memoryMb: 32 },
    source: `(input) => ({
      state: { calls: (input.state?.calls ?? 0) + 1 },
      effects: input.hook === "roomStart"
        ? [{ type: "draw", target: "self", count: 2 }]
        : [{ type: "addMark", target: "self", mark: "compat", count: 1 }],
      logs: [input.hook],
    })`,
  },
});

function game() {
  return HeadlessGame.create({
    seed: 7,
    players: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
    generalSelection: false,
  });
}

test("高级扩展钩子在隔离 Worker 后由权威引擎应用", async () => {
  const current = game();
  const runtime = new NonameCompatRoomRuntime([advancedPack()], "room-seed");
  const actor = current.state.players.find(
    (item) => item.id === current.state.currentPlayerId,
  )!;
  const before = actor.hand.length;
  await runtime.run("roomStart", current);
  assert.equal(actor.hand.length, before + 2);
  await runtime.run("afterCommand", current);
  assert.equal(actor.marks.compat, 1);
  assert.deepEqual(runtime.snapshot().states["test.authoritative_mod"], {
    calls: 2,
  });
});

test("兼容钩子记录可在不重新执行作者代码时确定性回放", async () => {
  const original = game();
  const runtime = new NonameCompatRoomRuntime([advancedPack()], "room-seed");
  await runtime.run("roomStart", original);
  await runtime.run("afterCommand", original);
  const records = runtime.snapshot().records;

  const replay = game();
  const replayRuntime = new NonameCompatRoomRuntime(
    [advancedPack()],
    "room-seed",
  );
  for (const record of records) replayRuntime.replay(record, replay);
  assert.equal(replay.snapshot(), original.snapshot());
});

test("未申请状态权限的高级扩展不能返回规则效果", async () => {
  const pack = advancedPack();
  pack.runtime!.permissions = [];
  await assert.rejects(
    new NonameCompatRoomRuntime([pack], "room-seed").run("roomStart", game()),
    /未申请 game-state 权限/,
  );
});
