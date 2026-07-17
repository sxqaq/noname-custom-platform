import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadPinnedNonameSkillModule,
  NonameInteractionHost,
  type NonameInteractionRecord,
} from "../src/index.js";

const upstreamRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../vendor/noname",
);

async function runFanjian(
  host: NonameInteractionHost,
  onDamage: () => void,
) {
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
  assert.deepEqual(
    (suitRequest.payload as { controls: string[] }).controls,
    ["heart2", "diamond2", "club2", "spade2"],
  );
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
  host.submit({ requestId: request.id, playerId: "owner", result: { bool: false } });
  assert.deepEqual(await result, { bool: false });
});
