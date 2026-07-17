import assert from "node:assert/strict";
import test from "node:test";
import {
  HeadlessGame,
  chooseAiCommand,
  type ContentPackage,
} from "../src/index.js";

const pack: ContentPackage = {
  id: "custom.ir2_pack",
  name: "IR2 测试包",
  version: "1.0.0",
  generals: [
    {
      id: "custom.ir2_hero",
      name: "炼策师",
      faction: "qun",
      hp: 4,
      skills: [
        "custom.ir2_skill",
        "custom.choice_skill",
        "custom.grant_skill",
        "custom.remove_skill",
        "custom.skip_draw_skill",
        "custom.move_skill",
        "custom.graph_skill",
      ],
    },
  ],
  skills: [
    {
      id: "custom.ir2_skill",
      name: "炼策",
      kind: "active",
      usage: "oncePerTurn",
      when: {
        op: "predicate",
        predicate: "wounded",
        subject: "self",
      },
      modifiers: [
        { type: "handLimit", amount: 2 },
        { type: "distanceFrom", amount: -1 },
      ],
      effects: [
        {
          type: "setState",
          target: "self",
          stateKey: "charge",
          value: 1,
        },
        {
          type: "repeat",
          target: "self",
          times: 2,
          body: [{ type: "draw", target: "self", count: 1 }],
        },
        {
          type: "if",
          target: "self",
          condition: {
            op: "compare",
            comparator: "gte",
            left: {
              kind: "property",
              subject: "self",
              property: "state",
              key: "charge",
            },
            right: { kind: "number", value: 1 },
          },
          then: [
            { type: "recover", target: "self", amount: 1 },
            {
              type: "changeState",
              target: "self",
              stateKey: "charge",
              value: 2,
            },
          ],
          else: [{ type: "loseHp", target: "self", amount: 1 }],
        },
      ],
    },
    {
      id: "custom.choice_skill",
      name: "择策",
      kind: "active",
      usage: "unlimited",
      selections: [
        {
          id: "custom.mode",
          prompt: "选择策略",
          kind: "option",
          min: 1,
          max: 1,
          options: [
            { id: "custom.calm", label: "徐图", value: 1 },
            { id: "custom.bold", label: "进取", value: 2 },
          ],
        },
        {
          id: "custom.amount",
          prompt: "选择点数",
          kind: "number",
          min: 1,
          max: 3,
        },
        {
          id: "custom.suit",
          prompt: "选择花色",
          kind: "suit",
          min: 1,
          max: 1,
          suits: ["heart", "spade"],
        },
      ],
      effects: [
        {
          type: "if",
          target: "self",
          condition: {
            op: "compare",
            comparator: "gte",
            left: {
              kind: "property",
              subject: "self",
              property: "selection",
              key: "custom.mode",
            },
            right: { kind: "number", value: 2 },
          },
          then: [{ type: "draw", target: "self", count: 1 }],
          else: [],
        },
      ],
    },
    {
      id: "custom.grant_skill",
      name: "授业",
      kind: "active",
      usage: "unlimited",
      effects: [
        {
          type: "grantSkill",
          target: "self",
          skillId: "custom.borrowed_skill",
          duration: "turn",
        },
      ],
    },
    {
      id: "custom.remove_skill",
      name: "止业",
      kind: "active",
      usage: "unlimited",
      effects: [
        {
          type: "removeSkill",
          target: "self",
          skillId: "custom.borrowed_skill",
        },
      ],
    },
    {
      id: "custom.borrowed_skill",
      name: "借策",
      kind: "trigger",
      event: "turnEnd",
      effects: [{ type: "draw", target: "self", count: 1 }],
    },
    {
      id: "custom.skip_draw_skill",
      name: "断粮",
      kind: "active",
      usage: "unlimited",
      effects: [{ type: "skipPhase", target: "self", phase: "draw" }],
    },
    {
      id: "custom.move_skill",
      name: "取策",
      kind: "active",
      usage: "unlimited",
      selections: [
        {
          id: "custom.move_target",
          prompt: "选择一名角色",
          kind: "target",
          min: 1,
          max: 1,
          targetFilter: "other",
        },
      ],
      effects: [
        {
          type: "moveCards",
          target: "selected",
          count: 1,
          fromZone: "hand",
          to: "self",
          toZone: "hand",
        },
      ],
    },
    {
      id: "custom.graph_skill",
      name: "图策",
      kind: "active",
      usage: "unlimited",
      effects: [{ type: "draw", target: "self", count: 9 }],
      graph: {
        entry: "custom.graph.start",
        nodes: [
          {
            id: "custom.graph.finish",
            type: "setState",
            target: "self",
            stateKey: "graph",
            value: 7,
          },
          {
            id: "custom.graph.start",
            next: "custom.graph.finish",
            type: "draw",
            target: "self",
            count: 1,
          },
        ],
      },
    },
  ],
};

function fixture() {
  const game = HeadlessGame.create({
    seed: 2026,
    fixedLordId: "a",
    players: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
    packages: [pack],
  });
  const owner = game.state.players[0];
  owner.general = structuredClone(pack.generals[0]);
  owner.maxHp = 4;
  owner.hp = 3;
  game.state.currentPlayerId = owner.id;
  game.state.phase = "play";
  delete game.state.pending;
  return game;
}

test("IR2 conditions, bounded flow and state survive deterministic replay", () => {
  const game = fixture();
  const base = game.snapshot();
  const owner = game.state.players[0];
  const handBefore = owner.hand.length;
  const command = {
    type: "activateSkill" as const,
    playerId: owner.id,
    skillId: "custom.ir2_skill",
  };
  game.dispatch(command);
  assert.equal(owner.hand.length, handBefore + 2);
  assert.equal(owner.hp, 4);
  assert.equal(owner.marks["state.custom.ir2_skill.charge"], 3);
  const replayed = HeadlessGame.restore(base, [pack]);
  replayed.dispatch(command);
  assert.equal(replayed.snapshot(), game.snapshot());
});

test("IR2 active conditions are enforced by the authoritative engine", () => {
  const game = fixture();
  game.state.players[0].hp = game.state.players[0].maxHp;
  assert.throws(
    () =>
      game.dispatch({
        type: "activateSkill",
        playerId: "a",
        skillId: "custom.ir2_skill",
      }),
    /不满足插件技能发动条件/,
  );
});

test("IR2 option, number and suit selections serialize for replay", () => {
  const game = fixture();
  const handBefore = game.state.players[0].hand.length;
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "custom.choice_skill",
  });
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "custom.choice_skill",
    optionId: "custom.bold",
  });
  const restored = HeadlessGame.restore(game.snapshot(), [pack]);
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "custom.choice_skill",
    numberValue: 3,
  });
  restored.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "custom.choice_skill",
    numberValue: 3,
  });
  const ai = {
    type: "activateSkill" as const,
    playerId: "a",
    skillId: "custom.choice_skill",
    suit: "heart" as const,
  };
  game.dispatch(ai);
  restored.dispatch(ai);
  assert.equal(restored.snapshot(), game.snapshot());
  assert.equal(game.state.players[0].hand.length, handBefore + 1);
  assert.equal(
    game.state.players[0].marks["selection.custom.choice_skill.custom.amount"],
    3,
  );
});

test("AI deterministically completes IR2 scalar selections", () => {
  const game = fixture();
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "custom.choice_skill",
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

test("IR2 continuous modifiers affect authoritative hand limit and distance", () => {
  const game = fixture();
  const owner = game.state.players[0];
  while (owner.hand.length < 6) owner.hand.push(game.state.deck.shift()!);
  game.dispatch({ type: "endTurn", playerId: owner.id });
  assert.equal(game.state.pending?.kind, "discard");
  if (game.state.pending?.kind === "discard")
    assert.equal(game.state.pending.count, 1);

  const distanceGame = HeadlessGame.create({
    seed: 99,
    fixedLordId: "a",
    players: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
      { id: "c", name: "丙" },
      { id: "d", name: "丁" },
    ],
    packages: [pack],
  });
  distanceGame.state.players[0].general = structuredClone(pack.generals[0]);
  assert.equal(distanceGame.distance("a", "c"), 1);
});

test("IR2 granted skills are authoritative, replayable and removable", () => {
  const game = fixture();
  const baseline = game.snapshot();
  const grant = {
    type: "activateSkill" as const,
    playerId: "a",
    skillId: "custom.grant_skill",
  };
  game.dispatch(grant);
  assert.equal(
    game.state.players[0].grantedSkills["custom.borrowed_skill"],
    "turn",
  );
  assert.ok(
    game
      .viewFor("a")
      .players[0].general?.skills.includes("custom.borrowed_skill"),
  );

  const replayed = HeadlessGame.restore(baseline, [pack]);
  replayed.dispatch(grant);
  assert.equal(replayed.snapshot(), game.snapshot());

  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "custom.remove_skill",
  });
  assert.equal(
    game.state.players[0].grantedSkills["custom.borrowed_skill"],
    undefined,
  );
  assert.ok(
    !game
      .viewFor("a")
      .players[0].general?.skills.includes("custom.borrowed_skill"),
  );
});

test("IR2 skip-phase effects survive the full authoritative turn cycle", () => {
  const game = fixture();
  for (const player of game.state.players) {
    game.state.discard.push(...player.hand.splice(0));
    player.hp = player.maxHp;
  }
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "custom.skip_draw_skill",
  });
  assert.equal(game.state.players[0].marks["skipPhase.draw"], 1);
  game.dispatch({ type: "endTurn", playerId: "a" });
  assert.equal(game.state.currentPlayerId, "b");
  game.dispatch({ type: "endTurn", playerId: "b" });
  assert.equal(game.state.currentPlayerId, "a");
  assert.equal(game.state.phase, "play");
  assert.equal(game.state.players[0].hand.length, 0);
  assert.equal(game.state.players[0].marks["skipPhase.draw"], undefined);
  assert.ok(
    game.state.log.some((entry) => entry.type === "phase.draw.skipped"),
  );
});

test("IR2 card movement uses seeded randomness and replays identically", () => {
  const game = fixture();
  const baseline = game.snapshot();
  const beforeA = game.state.players[0].hand.length;
  const beforeB = game.state.players[1].hand.length;
  const commands = [
    {
      type: "activateSkill" as const,
      playerId: "a",
      skillId: "custom.move_skill",
    },
    {
      type: "activateSkill" as const,
      playerId: "a",
      skillId: "custom.move_skill",
      targetIds: ["b"],
    },
  ];
  for (const command of commands) game.dispatch(command);
  assert.equal(game.state.players[0].hand.length, beforeA + 1);
  assert.equal(game.state.players[1].hand.length, beforeB - 1);
  const replayed = HeadlessGame.restore(baseline, [pack]);
  for (const command of commands) replayed.dispatch(command);
  assert.equal(replayed.snapshot(), game.snapshot());
});

test("node graphs execute from entry through edges and emit trace logs", () => {
  const game = fixture();
  const before = game.state.players[0].hand.length;
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "custom.graph_skill",
  });
  assert.equal(game.state.players[0].hand.length, before + 1);
  assert.equal(
    game.state.players[0].marks["state.custom.graph_skill.graph"],
    7,
  );
  const traces = game.state.log.filter((entry) => entry.type === "skill.node");
  assert.deepEqual(
    traces.slice(-2).map((entry) => entry.text),
    [
      "custom.graph_skill 执行节点 custom.graph.start",
      "custom.graph_skill 执行节点 custom.graph.finish",
    ],
  );
});
