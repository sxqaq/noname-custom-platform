import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionPackageDto, RoomState } from "@sgs/protocol";
import { GameManager } from "../src/game-manager.js";

function room(): RoomState {
  return {
    id: "room-ai",
    name: "AI room",
    mode: "identity",
    visibility: "public",
    playerCount: 2,
    maxPlayers: 2,
    state: "playing",
    contentLock: [],
    revision: 1,
    players: [
      { id: "a", name: "A", seat: 1, status: "offline", isHost: true },
      { id: "b", name: "B", seat: 2, status: "offline", isHost: false },
    ],
  };
}

test("offline player becomes eligible for authoritative automation and action is replayed", async () => {
  const manager = new GameManager();
  const state = room();
  await manager.start(state, []);
  const before = manager.view(state.id, "a").sequence;
  assert.equal(manager.automationDue(state, Date.now() + 6_000), true);
  assert.equal(await manager.automate(state.id), true);
  assert.ok(manager.view(state.id, "a").sequence > before);
  assert.equal(manager.listReplays()[0].commands.length, 1);
});

function runtimePack(source: string): ExtensionPackageDto {
  return {
    schemaVersion: 4,
    id: "test.room_runtime",
    name: "房间运行时",
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
      permissions: ["game-state"],
      limits: { timeoutMs: 500, memoryMb: 32 },
      source,
    },
  };
}

test("GameManager 在开局、命令和回放路径执行兼容 Mod", async () => {
  const manager = new GameManager();
  const state = room();
  await manager.start(state, [
    runtimePack(`(input) => ({
        state: { calls: (input.state?.calls ?? 0) + 1 },
        effects: input.hook === "roomStart"
          ? [{ type: "addMark", target: "self", mark: "started", count: 1 }]
          : [{ type: "addMark", target: "self", mark: "acted", count: 1 }],
      })`),
  ]);
  const a = manager.view(state.id, "a");
  const b = manager.view(state.id, "b");
  const pending = a.pending?.kind === "selectGeneral" ? a.pending : b.pending;
  assert.equal(pending?.kind, "selectGeneral");
  await manager.action(state.id, pending!.playerId, {
    action: "chooseGeneral",
    generalId: pending!.choices[0].id,
  });

  const replay = manager.listReplays()[0];
  assert.equal(replay.commands.length, 1);
  assert.equal(replay.compatHooks?.length, 2);
  const replayed = manager.replay(replay.id, 1);
  assert.equal(replayed.view.sequence, manager.view(state.id, "a").sequence);
});

test("兼容 Mod 失败会同时回滚核心命令和 Mod 检查点", async () => {
  const manager = new GameManager();
  const state = room();
  await manager.start(state, [
    runtimePack(`(input) => {
      if (input.hook === "afterCommand") throw new Error("mod failed");
      return { state: { started: true } };
    }`),
  ]);
  const beforeA = manager.view(state.id, "a");
  const beforeB = manager.view(state.id, "b");
  const pending =
    beforeA.pending?.kind === "selectGeneral"
      ? beforeA.pending
      : beforeB.pending;
  await assert.rejects(
    manager.action(state.id, pending!.playerId, {
      action: "chooseGeneral",
      generalId: pending!.choices[0].id,
    }),
    /mod failed/,
  );
  assert.equal(
    JSON.stringify(manager.view(state.id, "a")),
    JSON.stringify(beforeA),
  );
  assert.equal(manager.listReplays()[0].commands.length, 0);
  assert.equal(manager.listReplays()[0].compatHooks?.length, 1);
});
