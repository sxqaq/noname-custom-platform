import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HeadlessGame } from "@sgs/headless-engine";
import {
  loadPinnedNonameSkillModule,
  NonameEffectBridge,
} from "../src/index.js";

const upstreamRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../vendor/noname",
);

function createGame() {
  return HeadlessGame.create({
    seed: 20260718,
    fixedLordId: "a",
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ],
  });
}

async function runUpstreamKurou(game: HeadlessGame) {
  const module = await loadPinnedNonameSkillModule({
    upstreamRoot,
    pack: "standard",
    seed: "effect-bridge-kurou",
  });
  const bridge = new NonameEffectBridge({ state: game.state, selfId: "a" });
  try {
    await module.skills.kurou.content?.({}, {}, bridge.player("a"));
    bridge.apply(game, "standard.kurou");
    return bridge.snapshot();
  } finally {
    module.dispose();
  }
}

test("真实无名杀苦肉技能通过结构化效果桥原子应用", async () => {
  const game = createGame();
  const player = game.state.players.find((item) => item.id === "a")!;
  const hpBefore = player.hp;
  const handBefore = player.hand.length;

  const checkpoint = await runUpstreamKurou(game);

  assert.deepEqual(checkpoint.effects, [
    { type: "loseHp", amount: 1, target: "self" },
    { type: "draw", count: 2, target: "self" },
  ]);
  assert.equal(checkpoint.applied, true);
  assert.equal(player.hp, hpBefore - 1);
  assert.equal(player.hand.length, handBefore + 2);
});

test("effect batches cannot be applied twice", () => {
  const game = createGame();
  const bridge = new NonameEffectBridge({ state: game.state, selfId: "a" });
  bridge.player("a").draw(1);
  bridge.apply(game);
  assert.throws(() => bridge.apply(game), /already been applied/);
});

test("相同快照上的真实上游技能产生相同效果日志和最终快照", async () => {
  const original = createGame();
  const base = original.snapshot();
  const replay = HeadlessGame.restore(base);

  const first = await runUpstreamKurou(original);
  const second = await runUpstreamKurou(replay);

  assert.deepEqual(first, second);
  assert.equal(original.snapshot(), replay.snapshot());
});

test("兼容代理可按权威玩家 ID 寻址并维护标记与临时技能", async () => {
  const game = createGame();
  const module = await loadPinnedNonameSkillModule({
    upstreamRoot,
    pack: "standard",
    seed: "effect-bridge-luoyi",
  });
  const bridge = new NonameEffectBridge({ state: game.state, selfId: "a" });
  const target = game.state.players.find((item) => item.id === "b")!;
  const hpBefore = target.hp;
  const trigger = { num: 2 };

  try {
    bridge.player("b").damage(1);
    bridge.player("b").addMark("bridge.test", 2);
    bridge.player("b").removeMark("bridge.test", 1);
    await module.skills.luoyi.content?.(undefined, trigger, bridge.player("a"));
    bridge.apply(game, "standard.luoyi");
  } finally {
    module.dispose();
  }

  assert.equal(trigger.num, 1);
  assert.equal(target.hp, hpBefore - 1);
  assert.equal(target.marks["bridge.test"], 1);
  assert.equal(game.state.players[0].grantedSkills.luoyi2, "turn");
  assert.ok(
    bridge
      .effects()
      .some(
        (effect) => effect.targetPlayerId === "b" && effect.type === "damage",
      ),
  );
});

test("兼容桥检查点保留扩展 storage 且不接触真实游戏状态", () => {
  const game = createGame();
  const bridge = new NonameEffectBridge({ state: game.state, selfId: "a" });
  const proxy = bridge.player("a");
  proxy.markAuto("targets", ["b", "c", "b"]);
  proxy.unmarkAuto("targets", "c");
  proxy.setStorage("counter", 3);

  const restored = new NonameEffectBridge({
    state: game.state,
    selfId: "a",
    checkpoint: bridge.snapshot(),
  });

  assert.deepEqual(restored.player("a").getStorage("targets"), ["b"]);
  assert.equal(restored.player("a").getStorage("counter"), 3);
  assert.deepEqual(game.state.players[0].marks, {});
});
