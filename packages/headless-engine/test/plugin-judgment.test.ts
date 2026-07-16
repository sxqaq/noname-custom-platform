import assert from "node:assert/strict";
import test from "node:test";
import {
  HeadlessGame,
  type ContentPackage,
  type GameCommand,
} from "../src/index.js";

const pack: ContentPackage = {
  id: "custom.judgment_pack",
  name: "判定技能测试包",
  version: "1.0.0",
  generals: [
    {
      id: "custom.oracle",
      name: "卜者",
      faction: "qun",
      hp: 4,
      skills: ["custom.divination"],
    },
  ],
  skills: [
    {
      id: "custom.divination",
      name: "问卦",
      kind: "active",
      usage: "oncePerTurn",
      effects: [
        {
          type: "judge",
          target: "self",
          successSuits: ["spade", "heart", "club", "diamond"],
          success: [{ type: "draw", target: "self", count: 2 }],
          failure: [{ type: "damage", target: "self", amount: 1 }],
        },
        {
          type: "addMark",
          target: "self",
          mark: "custom.divination.finished",
          count: 1,
        },
      ],
    },
  ],
};

function fixture() {
  const game = HeadlessGame.create({
    seed: 77,
    fixedLordId: "a",
    players: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
    packages: [pack],
  });
  game.state.players[0].general = structuredClone(pack.generals[0]);
  game.state.players[0].maxHp = pack.generals[0].hp;
  game.state.players[0].hp = pack.generals[0].hp;
  game.state.players[1].general = {
    id: "custom.controller",
    name: "改判者",
    faction: "wei",
    hp: 3,
    skills: ["guicai"],
  };
  return game;
}

test("plugin judgment participates in response, snapshot and replay pipelines", () => {
  const game = fixture();
  const base = game.snapshot();
  const handBefore = game.state.players[0].hand.length;
  const replacementId = game.state.players[1].hand[0].id;
  const commands: GameCommand[] = [
    {
      type: "activateSkill",
      playerId: "a",
      skillId: "custom.divination",
    },
    { type: "respond", playerId: "b", cardId: replacementId },
  ];
  game.dispatch(commands[0]);
  assert.equal(game.state.pending?.kind, "judgment");
  if (game.state.pending?.kind === "judgment") {
    assert.equal(game.state.pending.stage, "guicai");
    assert.equal(game.state.pending.playerId, "b");
    assert.equal(game.state.pending.context.kind, "custom");
  }
  const restored = HeadlessGame.restore(game.snapshot(), [pack]);
  game.dispatch(commands[1]);
  restored.dispatch(commands[1]);
  assert.equal(restored.snapshot(), game.snapshot());
  assert.equal(game.state.players[0].hand.length, handBefore + 2);
  assert.equal(game.state.players[0].marks["custom.divination.finished"], 1);

  const replayed = HeadlessGame.restore(base, [pack]);
  commands.forEach((command) => replayed.dispatch(command));
  assert.equal(replayed.snapshot(), game.snapshot());
});
