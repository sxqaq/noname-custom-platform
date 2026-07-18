import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadPinnedNonameSkillModule,
  NonameEventBridge,
} from "../src/index.js";

const upstreamRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../vendor/noname",
);

function events() {
  return [
    { id: "turn-1", name: "phase", playerId: "a" },
    {
      id: "draw-1",
      name: "phaseDraw",
      parentId: "turn-1",
      playerId: "a",
      data: { num: 2, numFixed: false },
    },
    {
      id: "skill-1",
      name: "yingzi",
      parentId: "draw-1",
      triggerId: "draw-1",
      playerId: "a",
      losses: {
        a: {
          playerId: "a",
          hs: [{ id: "card-a" }],
          cards2: [{ id: "card-a" }],
        },
      },
      gains: { b: [{ id: "card-a" }] },
      discarded: { a: [{ id: "card-b" }] },
    },
  ];
}

test("event bridge exposes parent chains, trigger links and card histories", () => {
  const bridge = new NonameEventBridge({ events: events() });
  const skill = bridge.event("skill-1");

  assert.equal(skill.getParent().name, "phaseDraw");
  assert.equal(skill.getParent(2).name, "phase");
  assert.equal(skill.getParent("phase").id, "turn-1");
  assert.equal(skill.getTrigger().id, "draw-1");
  assert.deepEqual(skill.getl({ id: "a" }).hs, [{ id: "card-a" }]);
  assert.deepEqual(skill.getg({ playerid: "b" }), [{ id: "card-a" }]);
  assert.deepEqual(skill.getd(), [{ id: "card-b" }]);
});

test("real upstream yingzi mutates a serializable trigger journal", async () => {
  const module = await loadPinnedNonameSkillModule({
    upstreamRoot,
    pack: "standard",
    seed: "event-bridge-yingzi",
  });
  const bridge = new NonameEventBridge({ events: events() });
  const trigger = bridge.event("draw-1");

  try {
    await module.skills.yingzi.content?.(bridge.event("skill-1"), trigger, {
      id: "a",
    });
  } finally {
    module.dispose();
  }

  assert.equal(trigger.num, 3);
  assert.deepEqual(bridge.mutations(), [
    { eventId: "draw-1", op: "set", key: "num", value: 3 },
  ]);
  const restored = new NonameEventBridge({
    events: events(),
    checkpoint: bridge.snapshot(),
  });
  assert.equal(restored.event("draw-1").num, 3);
  assert.deepEqual(restored.mutations(), bridge.mutations());
});

test("event cancellation, finish and goto are explicit bounded mutations", () => {
  const bridge = new NonameEventBridge({ events: events() });
  const event = bridge.event("skill-1");
  event.set("result", { bool: true }).cancel().finish().goto(2);

  assert.deepEqual(bridge.mutations(), [
    {
      eventId: "skill-1",
      op: "set",
      key: "result",
      value: { bool: true },
    },
    { eventId: "skill-1", op: "cancel" },
    { eventId: "skill-1", op: "finish" },
    { eventId: "skill-1", op: "goto", step: 2 },
  ]);
});

test("event graph rejects dangling links and parent cycles", () => {
  assert.throws(
    () =>
      new NonameEventBridge({
        events: [{ id: "a", name: "a", parentId: "missing" }],
      }),
    /unknown parent/,
  );
  assert.throws(
    () =>
      new NonameEventBridge({
        events: [
          { id: "a", name: "a", parentId: "b" },
          { id: "b", name: "b", parentId: "a" },
        ],
      }),
    /cycle/,
  );
});
