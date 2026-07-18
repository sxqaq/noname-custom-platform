import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadPinnedNonameSkillModule,
  NonameInteractionHost,
  ReplayableNonameExecution,
  type NonameInteractionRecord,
} from "../src/index.js";

const upstreamRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../vendor/noname",
);

async function runFanjian(host: NonameInteractionHost, onDamage: () => void) {
  const module = await loadPinnedNonameSkillModule({
    upstreamRoot,
    pack: "standard",
    seed: "fanjian-seed",
    globals: {
      game: { log() {} },
      get: {
        translation(value: unknown) {
          return String(value);
        },
        suit(card: { suit: string }) {
          return card.suit;
        },
      },
    },
  });
  const source = { id: "source" };
  const target = host.player("target", {
    chat() {},
    async damage() {
      onDamage();
    },
  });
  const execution = module.skills.fanjian.content?.({ target }, {}, source);
  return { module, execution };
}

test("真实反间技能可由两段外部玩家输入驱动并确定性回放", async () => {
  let damage = 0;
  const host = new NonameInteractionHost();
  const first = await runFanjian(host, () => damage++);

  const suitRequest = await host.waitForRequest();
  assert.equal(suitRequest.kind, "chooseControl");
  assert.deepEqual((suitRequest.payload as { controls: string[] }).controls, [
    "heart2",
    "diamond2",
    "club2",
    "spade2",
  ]);
  host.submit({
    requestId: suitRequest.id,
    playerId: "target",
    result: { control: "heart2" },
  });

  const cardRequest = await host.waitForRequest();
  assert.equal(cardRequest.kind, "gainPlayerCard");
  host.submit({
    requestId: cardRequest.id,
    playerId: "target",
    result: { bool: true, cards: [{ id: "card-1", suit: "spade" }] },
  });
  await first.execution;
  assert.equal(damage, 1);

  const journal: NonameInteractionRecord[] = host.journal();
  assert.equal(journal.length, 2);
  let replayDamage = 0;
  const replayHost = new NonameInteractionHost(journal);
  const replay = await runFanjian(replayHost, () => replayDamage++);
  await replay.execution;
  assert.equal(replayDamage, 1);
  assert.deepEqual(replayHost.journal(), journal);

  first.module.dispose();
  replay.module.dispose();
});

test("真实技能可从待交互检查点重建异步执行位置", async () => {
  let damage = 0;
  const factory = async (host: NonameInteractionHost) => {
    const run = await runFanjian(host, () => damage++);
    try {
      await run.execution;
      return "completed";
    } finally {
      run.module.dispose();
    }
  };

  const original = await ReplayableNonameExecution.start(factory);
  const suit = await original.waitForRequest();
  original.submit({
    requestId: suit.id,
    playerId: "target",
    result: { control: "heart2" },
  });
  const card = await original.waitForRequest();
  assert.equal(card.kind, "gainPlayerCard");
  const checkpoint = await original.checkpoint();
  assert.equal(checkpoint.journal.length, 1);
  assert.deepEqual(checkpoint.pending, card);

  const stopped = original.result().catch(() => "stopped");
  original.dispose("模拟房主进程重启");
  assert.equal(await stopped, "stopped");

  const restored = await ReplayableNonameExecution.start(factory, checkpoint);
  assert.deepEqual(await restored.waitForRequest(), card);
  restored.submit({
    requestId: card.id,
    playerId: "target",
    result: { bool: true, cards: [{ id: "card-1", suit: "spade" }] },
  });
  assert.equal(await restored.result(), "completed");
  assert.equal(damage, 1);
});

test("交互宿主拒绝其他玩家代答", async () => {
  const host = new NonameInteractionHost();
  const player = host.player("owner");
  const result = player.chooseBool({ prompt: "发动技能？" }).forResult();
  const request = await host.waitForRequest();
  assert.throws(
    () =>
      host.submit({
        requestId: request.id,
        playerId: "intruder",
        result: { bool: true },
      }),
    /无权回答/,
  );
  host.submit({
    requestId: request.id,
    playerId: "owner",
    result: { bool: false },
  });
  assert.deepEqual(await result, { bool: false });
});

test("扩展选择种类保留 set 链参数并支持直接 await 与回放", async () => {
  const host = new NonameInteractionHost();
  const player = host.player("owner");
  const completion = (async () =>
    await player
      .chooseButton({ buttons: ["one", "two"] })
      .set("prompt", "选择一个按钮")
      .set("ai", () => 1))();

  const request = await host.waitForRequest();
  assert.equal(request.kind, "chooseButton");
  assert.deepEqual(request.payload, {
    buttons: ["one", "two"],
    prompt: "选择一个按钮",
  });
  host.submit({
    requestId: request.id,
    playerId: "owner",
    result: { bool: true, links: ["two"] },
  });
  assert.deepEqual(await completion, { bool: true, links: ["two"] });

  const replay = new NonameInteractionHost(host.journal());
  const replayResult = await replay
    .player("owner")
    .chooseButton({ buttons: ["one", "two"] })
    .set("prompt", "选择一个按钮")
    .set("ai", () => 2);
  assert.deepEqual(replayResult, { bool: true, links: ["two"] });
  assert.deepEqual(replay.journal(), host.journal());
});
