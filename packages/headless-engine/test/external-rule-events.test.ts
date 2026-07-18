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
    { id: "test.blank_c", name: "Blank C", faction: "qun", hp: 4, skills: [] },
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

function startDamage(game: HeadlessGame, amount = 1) {
  game.applyExternalEffects(
    [{ type: "damage", target: "selected", amount }],
    "a",
    "b",
    "test.damage",
  );
}

test("damage runs through the complete authoritative pre/post event chain", () => {
  const game = HeadlessGame.create(config);
  game.resumeExternalRuleEvent({ eventId: game.externalRuleEvent()!.id });
  const target = game.state.players.find((item) => item.id === "b")!;
  const before = target.hp;
  startDamage(game);
  const stages: string[] = [];

  while (game.externalRuleEvent()) {
    const event = game.externalRuleEvent()!;
    stages.push(event.name);
    game.resumeExternalRuleEvent({
      eventId: event.id,
      data:
        event.name === "damageBegin3"
          ? { num: Number(event.data.num) + 1 }
          : undefined,
    });
  }

  assert.deepEqual(stages, [
    "damageBegin1",
    "damageBegin2",
    "damageBegin3",
    "damageBegin4",
    "damageSource",
    "damageEnd",
  ]);
  assert.equal(target.hp, before - 2);
});

test("pre-damage cancellation resumes without changing health", () => {
  const game = HeadlessGame.create(config);
  game.resumeExternalRuleEvent({ eventId: game.externalRuleEvent()!.id });
  const target = game.state.players.find((item) => item.id === "b")!;
  const before = target.hp;
  startDamage(game);

  while (game.externalRuleEvent()?.name !== "damageBegin4") {
    const event = game.externalRuleEvent()!;
    game.resumeExternalRuleEvent({ eventId: event.id });
  }
  const finalPreEvent = game.externalRuleEvent()!;
  game.resumeExternalRuleEvent({
    eventId: finalPreEvent.id,
    cancelled: true,
  });

  assert.equal(target.hp, before);
  assert.equal(game.externalRuleEvent(), undefined);
});

test("resolved post-damage events reject mutation atomically", () => {
  const game = HeadlessGame.create(config);
  game.resumeExternalRuleEvent({ eventId: game.externalRuleEvent()!.id });
  startDamage(game);
  while (game.externalRuleEvent()?.name !== "damageSource") {
    const event = game.externalRuleEvent()!;
    game.resumeExternalRuleEvent({ eventId: event.id });
  }
  const before = game.snapshot();
  const event = game.externalRuleEvent()!;

  assert.throws(
    () =>
      game.resumeExternalRuleEvent({
        eventId: event.id,
        data: { num: Number(event.data.num) + 1 },
      }),
    /cannot change/,
  );
  assert.equal(game.snapshot(), before);
});

test("damage event chains restore and resume deterministically mid-flight", () => {
  const first = HeadlessGame.create(config);
  first.resumeExternalRuleEvent({ eventId: first.externalRuleEvent()!.id });
  startDamage(first, 2);
  first.resumeExternalRuleEvent({ eventId: first.externalRuleEvent()!.id });
  const second = HeadlessGame.restore(first.snapshot(), [pack]);

  for (const game of [first, second]) {
    while (game.externalRuleEvent()) {
      const event = game.externalRuleEvent()!;
      game.resumeExternalRuleEvent({ eventId: event.id });
    }
  }

  assert.equal(second.snapshot(), first.snapshot());
});

test("effect batches continue after every serialized damage interrupt", () => {
  const game = HeadlessGame.create(config);
  game.resumeExternalRuleEvent({ eventId: game.externalRuleEvent()!.id });
  const target = game.state.players.find((item) => item.id === "b")!;
  const before = target.hp;
  game.applyExternalEffects(
    [
      { type: "damage", target: "selected", amount: 1 },
      { type: "damage", target: "selected", amount: 1 },
      { type: "addMark", target: "selected", mark: "finished", count: 1 },
    ],
    "a",
    "b",
    "test.damage-batch",
  );

  while (game.externalRuleEvent()) {
    const event = game.externalRuleEvent()!;
    game.resumeExternalRuleEvent({ eventId: event.id });
  }

  assert.equal(target.hp, before - 2);
  assert.equal(target.marks.finished, 1);
});

const threePlayerConfig: GameConfig = {
  ...config,
  players: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ],
};

function enterPlay(game: HeadlessGame) {
  const event = game.externalRuleEvent();
  assert.equal(event?.name, "phaseDrawBegin2");
  game.resumeExternalRuleEvent({ eventId: event!.id });
}

function giveDeckCard(game: HeadlessGame, playerId: string, name: string) {
  const index = game.state.deck.findIndex((card) => card.name === name);
  assert.notEqual(index, -1);
  const card = game.state.deck.splice(index, 1)[0];
  game.state.players.find((player) => player.id === playerId)!.hand.push(card);
  return card;
}

test("use-card events can retarget a card before authoritative validation", () => {
  const game = HeadlessGame.create(threePlayerConfig);
  enterPlay(game);
  const card = giveDeckCard(game, "a", "sha");
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: card.id,
    targetId: "b",
  });
  const stages: string[] = [];

  while (game.externalRuleEvent()) {
    const event = game.externalRuleEvent()!;
    stages.push(event.name);
    game.resumeExternalRuleEvent({
      eventId: event.id,
      data: event.name === "useCard" ? { targetIds: ["c"] } : undefined,
    });
  }

  assert.deepEqual(stages, ["useCard", "useCard1", "useCard2"]);
  assert.equal(game.state.pending?.kind, "shan");
  assert.equal(game.state.pending?.playerId, "c");
});

test("use-card events can replace the effective card name", () => {
  const game = HeadlessGame.create(threePlayerConfig);
  enterPlay(game);
  const card = giveDeckCard(game, "a", "tao");
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: card.id,
    targetId: "b",
  });

  while (game.externalRuleEvent()) {
    const event = game.externalRuleEvent()!;
    game.resumeExternalRuleEvent({
      eventId: event.id,
      data:
        event.name === "useCard"
          ? { cardName: "sha", targetIds: ["b"] }
          : undefined,
    });
  }

  assert.equal(game.state.pending?.kind, "shan");
  assert.equal(game.state.pending?.playerId, "b");
  assert.equal(
    game.state.discard.some((item) => item.id === card.id),
    true,
  );
});

test("cancelling a use-card event consumes the physical card and resumes play", () => {
  const game = HeadlessGame.create(threePlayerConfig);
  enterPlay(game);
  const card = giveDeckCard(game, "a", "sha");
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: card.id,
    targetId: "b",
  });
  game.resumeExternalRuleEvent({ eventId: game.externalRuleEvent()!.id });
  const event = game.externalRuleEvent()!;

  game.resumeExternalRuleEvent({ eventId: event.id, cancelled: true });

  assert.equal(game.externalRuleEvent(), undefined);
  assert.equal(game.state.pending, undefined);
  assert.equal(game.state.phase, "play");
  assert.equal(
    game.state.discard.some((item) => item.id === card.id),
    true,
  );
});

test("use-card event identity fields are immutable and roll back atomically", () => {
  const game = HeadlessGame.create(threePlayerConfig);
  enterPlay(game);
  const card = giveDeckCard(game, "a", "sha");
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: card.id,
    targetId: "b",
  });
  const event = game.externalRuleEvent()!;
  const before = game.snapshot();

  assert.throws(
    () =>
      game.resumeExternalRuleEvent({
        eventId: event.id,
        data: { cardId: "forged" },
      }),
    /physical card ID/,
  );
  assert.equal(game.snapshot(), before);
});

test("use-card event checkpoints resume deterministically", () => {
  const first = HeadlessGame.create(threePlayerConfig);
  enterPlay(first);
  const card = giveDeckCard(first, "a", "sha");
  first.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: card.id,
    targetId: "b",
  });
  first.resumeExternalRuleEvent({ eventId: first.externalRuleEvent()!.id });
  const second = HeadlessGame.restore(first.snapshot(), [pack]);

  for (const game of [first, second]) {
    while (game.externalRuleEvent()) {
      const event = game.externalRuleEvent()!;
      game.resumeExternalRuleEvent({ eventId: event.id });
    }
  }

  assert.equal(second.snapshot(), first.snapshot());
});
