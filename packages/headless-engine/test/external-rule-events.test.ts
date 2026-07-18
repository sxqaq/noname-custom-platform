import assert from "node:assert/strict";
import test from "node:test";
import {
  HeadlessGame,
  type ContentPackage,
  type GameConfig,
} from "../src/index.js";

const pack: ContentPackage = {
  id: "test.rule_events",
  name: "Rule event fixtures",
  version: "1.0.0",
  generals: [
    { id: "test.blank_a", name: "Blank A", faction: "qun", hp: 4, skills: [] },
    { id: "test.blank_b", name: "Blank B", faction: "qun", hp: 4, skills: [] },
  ],
  skills: [],
};

const config: GameConfig = {
  seed: 918,
  fixedLordId: "a",
  externalRuleEvents: true,
  packages: [pack],
  players: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
};

test("draw phase pauses at an internal rule event hidden from clients", () => {
  const game = HeadlessGame.create(config);
  const event = game.externalRuleEvent();

  assert.equal(event?.name, "phaseDrawBegin2");
  assert.equal(event?.playerId, "a");
  assert.equal(event?.data.num, 2);
  assert.equal(game.viewFor("a").pending, undefined);
  assert.equal(game.viewFor("b").pending, undefined);
});

test("validated rule-event changes resume authoritative draw resolution", () => {
  const game = HeadlessGame.create(config);
  const player = game.state.players.find((item) => item.id === "a")!;
  const before = player.hand.length;
  const event = game.externalRuleEvent()!;

  game.resumeExternalRuleEvent({ eventId: event.id, data: { num: 4 } });

  assert.equal(player.hand.length, before + 4);
  assert.equal(game.state.phase, "play");
  assert.equal(game.externalRuleEvent(), undefined);
});

test("cancelling a draw rule event skips drawing but continues the phase", () => {
  const game = HeadlessGame.create(config);
  const player = game.state.players.find((item) => item.id === "a")!;
  const before = player.hand.length;
  const event = game.externalRuleEvent()!;

  game.resumeExternalRuleEvent({ eventId: event.id, cancelled: true });

  assert.equal(player.hand.length, before);
  assert.equal(game.state.phase, "play");
});

test("invalid rule-event resolutions atomically roll back", () => {
  const game = HeadlessGame.create(config);
  const before = game.snapshot();
  const event = game.externalRuleEvent()!;

  assert.throws(
    () =>
      game.resumeExternalRuleEvent({
        eventId: event.id,
        data: { num: 21 },
      }),
    /0 to 20/,
  );
  assert.equal(game.snapshot(), before);
  assert.throws(
    () => game.resumeExternalRuleEvent({ eventId: "wrong" }),
    /does not match/,
  );
  assert.equal(game.snapshot(), before);
});

test("rule-event pending state survives snapshots deterministically", () => {
  const first = HeadlessGame.create(config);
  const second = HeadlessGame.restore(first.snapshot(), [pack]);
  const event = first.externalRuleEvent()!;

  first.resumeExternalRuleEvent({ eventId: event.id, data: { num: 3 } });
  second.resumeExternalRuleEvent({ eventId: event.id, data: { num: 3 } });

  assert.equal(second.snapshot(), first.snapshot());
});

test("snapshots created before rule events restore with safe defaults", () => {
  const current = HeadlessGame.create({ ...config, externalRuleEvents: false });
  const legacy = JSON.parse(current.snapshot()) as Record<string, unknown>;
  delete legacy.externalRuleEvents;
  delete legacy.ruleEventSequence;

  const restored = HeadlessGame.restore(JSON.stringify(legacy), [pack]);

  assert.equal(restored.state.externalRuleEvents, false);
  assert.equal(restored.state.ruleEventSequence, 0);
  assert.equal(restored.externalRuleEvent(), undefined);
});
