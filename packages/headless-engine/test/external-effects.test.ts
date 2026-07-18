import assert from "node:assert/strict";
import test from "node:test";
import { HeadlessGame } from "../src/index.js";

function createGame() {
  return HeadlessGame.create({
    seed: 81,
    fixedLordId: "a",
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ],
  });
}

test("advanced effects address exact authoritative source and destination players", () => {
  const game = createGame();
  const a = game.state.players.find((player) => player.id === "a")!;
  const b = game.state.players.find((player) => player.id === "b")!;
  const c = game.state.players.find((player) => player.id === "c")!;
  const hands = [a.hand.length, b.hand.length, c.hand.length];

  game.applyExternalEffects(
    [
      { type: "draw", count: 1, target: "selected", targetPlayerId: "b" },
      {
        type: "moveCards",
        count: 1,
        target: "selected",
        targetPlayerId: "b",
        fromZone: "hand",
        to: "selected",
        toPlayerId: "c",
        toZone: "hand",
      },
      { type: "addMark", mark: "bridge.test", count: 3, target: "self" },
      { type: "removeMark", mark: "bridge.test", count: 2, target: "self" },
    ],
    "a",
    undefined,
    "explicit-target-test",
    "a",
  );

  assert.equal(a.hand.length, hands[0]);
  assert.equal(b.hand.length, hands[1]);
  assert.equal(c.hand.length, hands[2] + 1);
  assert.equal(a.marks["bridge.test"], 1);
});

test("invalid exact player targets roll back the entire external effect batch", () => {
  const game = createGame();
  const before = game.snapshot();

  assert.throws(
    () =>
      game.applyExternalEffects([
        { type: "draw", count: 2, target: "self" },
        {
          type: "damage",
          amount: 1,
          target: "selected",
          targetPlayerId: "missing",
        },
      ]),
    /missing|不存在|player/i,
  );
  assert.equal(game.snapshot(), before);
});
