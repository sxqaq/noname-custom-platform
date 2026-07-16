import assert from "node:assert/strict";
import test from "node:test";
import {
  HeadlessGame,
  chooseAiCommand,
  type ContentPackage,
  type GameCommand,
} from "../src/index.js";

const pack: ContentPackage = {
  id: "custom.active_pack",
  name: "主动技能测试包",
  version: "1.0.0",
  generals: [
    {
      id: "custom.active_hero",
      name: "策士",
      faction: "qun",
      hp: 4,
      skills: ["custom.exchange"],
    },
  ],
  skills: [
    {
      id: "custom.exchange",
      name: "换策",
      kind: "active",
      usage: "oncePerTurn",
      selections: [
        {
          id: "custom.cost",
          prompt: "弃置一张手牌",
          kind: "card",
          min: 1,
          max: 1,
          cardZone: "hand",
          consume: "discard",
        },
        {
          id: "custom.target",
          prompt: "选择一名其他角色",
          kind: "target",
          min: 1,
          max: 1,
          targetFilter: "other",
        },
      ],
      effects: [
        { type: "draw", target: "self", count: 2 },
        { type: "damage", target: "selected", amount: 1 },
      ],
    },
  ],
};

function createGame() {
  const game = HeadlessGame.create({
    seed: 1,
    players: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
    packages: [pack],
  });
  const owner = game.state.players.find(
    (player) => player.general.id === "custom.active_hero",
  );
  assert.ok(owner);
  while (game.state.currentPlayerId !== owner.id)
    game.dispatch(chooseAiCommand(game));
  while (game.state.pending) game.dispatch(chooseAiCommand(game));
  return { game, ownerId: owner.id };
}

test("multi-step active plugin skill survives snapshots and deterministic replay", () => {
  const { game, ownerId } = createGame();
  const owner = game.state.players.find((player) => player.id === ownerId)!;
  const target = game.state.players.find((player) => player.id !== ownerId)!;
  const handBefore = owner.hand.length;
  const hpBefore = target.hp;
  const baseSnapshot = game.snapshot();
  const commands: GameCommand[] = [
    { type: "activateSkill", playerId: ownerId, skillId: "custom.exchange" },
    {
      type: "activateSkill",
      playerId: ownerId,
      skillId: "custom.exchange",
      cardIds: [owner.hand[0].id],
    },
    {
      type: "activateSkill",
      playerId: ownerId,
      skillId: "custom.exchange",
      targetIds: [target.id],
    },
  ];
  game.dispatch(commands[0]);
  assert.equal(game.state.pending?.kind, "customSkill");
  const afterStart = HeadlessGame.restore(game.snapshot(), [pack]);
  game.dispatch(commands[1]);
  afterStart.dispatch(commands[1]);
  assert.equal(afterStart.snapshot(), game.snapshot());
  assert.equal(game.state.pending?.kind, "customSkill");
  game.dispatch(commands[2]);
  afterStart.dispatch(commands[2]);
  assert.equal(afterStart.snapshot(), game.snapshot());
  assert.equal(owner.hand.length, handBefore + 1);
  assert.equal(target.hp, hpBefore - 1);
  const replayed = HeadlessGame.restore(baseSnapshot, [pack]);
  commands.forEach((command) => replayed.dispatch(command));
  assert.equal(replayed.snapshot(), game.snapshot());
  assert.throws(() => game.dispatch(commands[0]), /本回合已经发动/);
});

test("AI completes serialized plugin selections with the same result after restore", () => {
  const { game, ownerId } = createGame();
  game.dispatch({
    type: "activateSkill",
    playerId: ownerId,
    skillId: "custom.exchange",
  });
  const restored = HeadlessGame.restore(game.snapshot(), [pack]);
  while (game.state.pending?.kind === "customSkill") {
    const command = chooseAiCommand(game);
    assert.deepEqual(command, chooseAiCommand(restored));
    game.dispatch(command);
    restored.dispatch(command);
  }
  assert.equal(restored.snapshot(), game.snapshot());
});
