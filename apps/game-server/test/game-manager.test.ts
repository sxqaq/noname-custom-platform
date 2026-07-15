import assert from "node:assert/strict";
import test from "node:test";
import type { RoomState } from "@sgs/protocol";
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

test("offline player becomes eligible for authoritative automation and action is replayed", () => {
  const manager = new GameManager();
  const state = room();
  manager.start(state, []);
  const before = manager.view(state.id, "a").sequence;
  assert.equal(manager.automationDue(state, Date.now() + 6_000), true);
  assert.equal(manager.automate(state.id), true);
  assert.ok(manager.view(state.id, "a").sequence > before);
  assert.equal(manager.listReplays()[0].commands.length, 1);
});
