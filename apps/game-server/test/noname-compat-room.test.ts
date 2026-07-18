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

test("命令与事件上下文映射实际操作者和所选目标", async () => {
  const pack = advancedPack();
  pack.runtime!.source = `(input) => ({
    state: { commandType: input.context.command?.type },
    effects: [
      { type: "addMark", target: "self", mark: "actual_actor", count: 1 },
      { type: "addMark", target: "selected", mark: "actual_target", count: 1 },
    ],
  })`;
  const current = game();
  const runtime = new NonameCompatRoomRuntime([pack], "context-seed");
  await runtime.run("afterCommand", current, 0, {
    command: { type: "endTurn", playerId: "b" },
    events: [],
    actorPlayerId: "b",
    selectedPlayerId: "a",
  });
  assert.equal(
    current.state.players.find((player) => player.id === "b")?.marks
      .actual_actor,
    1,
  );
  assert.equal(
    current.state.players.find((player) => player.id === "a")?.marks
      .actual_target,
    1,
  );
  assert.deepEqual(runtime.snapshot().states[pack.id], {
    commandType: "endTurn",
  });
});

test("隔离 Mod 修改摸牌规则事件后由权威引擎验证并恢复", async () => {
  const pack = advancedPack();
  pack.runtime!.source = `(input) => input.hook === "ruleEvent"
    ? ({
        state: { eventId: input.context.ruleEvent.id },
        ruleEvent: { data: { num: 4 } },
      })
    : ({})`;
  pack.generals = [
    { id: "test.blank_a", name: "Blank A", faction: "qun", hp: 4, skills: [] },
    { id: "test.blank_b", name: "Blank B", faction: "qun", hp: 4, skills: [] },
  ];
  const current = HeadlessGame.create({
    seed: 7,
    fixedLordId: "a",
    externalRuleEvents: true,
    packages: [pack],
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const runtime = new NonameCompatRoomRuntime([pack], "rule-event-seed");
  const event = current.externalRuleEvent()!;
  const player = current.state.players.find(
    (item) => item.id === event.playerId,
  )!;
  const before = player.hand.length;

  const resolution = await runtime.runRuleEvent(current, event, 0);
  current.resumeExternalRuleEvent(resolution);

  assert.equal(player.hand.length, before + 4);
  assert.equal(current.state.phase, "play");
  assert.deepEqual(runtime.snapshot().states[pack.id], { eventId: event.id });
  assert.equal(runtime.snapshot().records.at(-1)?.hook, "ruleEvent");
  assert.deepEqual(runtime.snapshot().records.at(-1)?.output.ruleEvent, {
    data: { num: 4 },
  });
});

test("没有 game-state 权限的 Mod 不能修改规则事件", async () => {
  const pack = advancedPack();
  pack.runtime!.permissions = [];
  pack.runtime!.source = `() => ({ ruleEvent: { cancelled: true } })`;
  pack.generals = [
    { id: "test.blank_a", name: "Blank A", faction: "qun", hp: 4, skills: [] },
    { id: "test.blank_b", name: "Blank B", faction: "qun", hp: 4, skills: [] },
  ];
  const current = HeadlessGame.create({
    seed: 8,
    fixedLordId: "a",
    externalRuleEvents: true,
    packages: [pack],
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  await assert.rejects(
    new NonameCompatRoomRuntime([pack], "denied-event").runRuleEvent(
      current,
      current.externalRuleEvent()!,
    ),
    /game-state/,
  );
});

test("规则事件暂时拒绝可能覆盖内部中断的嵌套效果", async () => {
  const pack = advancedPack();
  pack.runtime!.source = `() => ({ effects: [
    { type: "damage", target: "self", amount: 1 },
  ] })`;
  pack.generals = [
    { id: "test.blank_a", name: "Blank A", faction: "qun", hp: 4, skills: [] },
    { id: "test.blank_b", name: "Blank B", faction: "qun", hp: 4, skills: [] },
  ];
  const current = HeadlessGame.create({
    seed: 9,
    fixedLordId: "a",
    externalRuleEvents: true,
    packages: [pack],
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  await assert.rejects(
    new NonameCompatRoomRuntime([pack], "nested-event").runRuleEvent(
      current,
      current.externalRuleEvent()!,
    ),
    /嵌套中断/,
  );
});

test("高级 Mod 选择请求可快照、校验响应并无代码回放", async () => {
  const pack = advancedPack();
  pack.runtime!.permissions.push("player-choice");
  pack.runtime!.source = `(input) => input.hook === "afterCommand"
    ? ({ request: { playerId: input.context.actorPlayerId, selection: {
        id: "pick_path", prompt: "选择路线", kind: "option", min: 1, max: 1,
        options: [{ id: "advance", label: "前进" }, { id: "wait", label: "等待" }],
      } } })
    : ({ state: { picked: input.context.choice.optionId }, effects: [
        { type: "addMark", target: "self", mark: "choice_done", count: 1 },
      ] })`;
  const current = game();
  const runtime = new NonameCompatRoomRuntime([pack], "choice-seed");
  await runtime.run("afterCommand", current, 0, {
    command: { type: "endTurn", playerId: "b" },
    actorPlayerId: "b",
    events: [],
  });
  const pending = runtime.pendingChoice();
  assert.equal(pending?.playerId, "b");
  assert.equal(pending?.selection.kind, "option");
  const restored = NonameCompatRoomRuntime.restore(
    [pack],
    "choice-seed",
    runtime.snapshot(),
  );
  await assert.rejects(
    restored.respond(
      current,
      "a",
      { requestId: pending!.requestId, optionId: "advance" },
      1,
    ),
    /不属于当前玩家/,
  );
  await restored.respond(
    current,
    "b",
    { requestId: pending!.requestId, optionId: "advance" },
    1,
  );
  assert.equal(restored.pendingChoice(), undefined);
  assert.equal(
    current.state.players.find((player) => player.id === "b")?.marks
      .choice_done,
    1,
  );

  const replayGame = game();
  const replay = new NonameCompatRoomRuntime([pack], "choice-seed");
  for (const record of restored.snapshot().records)
    replay.replay(record, replayGame);
  assert.equal(replay.pendingChoice(), undefined);
  assert.equal(replayGame.snapshot(), current.snapshot());
});
