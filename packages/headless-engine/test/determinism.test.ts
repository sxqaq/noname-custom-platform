import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HeadlessGame,
  chooseAiCommand,
  replay,
  standardCards,
  standardDeck,
  standardGenerals,
  type GameCommand,
} from "../src/index.js";

const createUnfixedGame = HeadlessGame.create.bind(HeadlessGame);
HeadlessGame.create = ((config: Parameters<typeof HeadlessGame.create>[0]) => {
  const game = createUnfixedGame({
    ...config,
    fixedLordId: config.fixedLordId ?? config.players[0].id,
  });
  finishInitialPrompts(game);
  return game;
}) as typeof HeadlessGame.create;

test("server-authoritative general selection hides choices and starts after everyone picks", () => {
  const game = createUnfixedGame({
    seed: 701,
    fixedLordId: "a",
    generalSelection: true,
    players: ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id })),
  });
  assert.equal(game.state.phase, "selectGeneral");
  assert.equal(game.state.pending?.kind, "selectGeneral");
  assert.equal(game.state.players.every((player) => !player.hand.length), true);
  assert.equal(game.viewFor("b").pending, undefined);
  assert.equal(game.viewFor("a").pending?.kind, "selectGeneral");
  while (game.state.pending?.kind === "selectGeneral")
    game.dispatch(chooseAiCommand(game));
  const selectedIds = game.state.players.map((player) => player.general.id);
  assert.equal(new Set(selectedIds).size, selectedIds.length);
  assert.equal(
    game.state.players.every(
      (player) => player.hand.length >= game.state.mode.initialHand,
    ),
    true,
  );
  const lord = game.state.players.find((player) => player.identity === "lord")!;
  assert.equal(lord.maxHp, lord.general.hp + 1);
  assert.equal(game.state.currentPlayerId, lord.id);
  assert.notEqual(game.state.phase, "selectGeneral");
});

test("内置108张牌逐张匹配固定的无名杀标准牌表", () => {
  const upstream = readFileSync(
    new URL("../../../vendor/noname/apps/core/card/standard.js", import.meta.url),
    "utf8",
  );
  const list = upstream.slice(upstream.indexOf("\n\tlist: ["));
  const expected = [...list.matchAll(/\["(spade|heart|club|diamond)",\s*(\d+),\s*"([^"]+)"/g)].map(
    (match) => [match[1], Number(match[2]), match[3]],
  );
  assert.equal(expected.length, 108, "上游固定版本的标准牌表应为108张");
  assert.deepEqual(standardDeck, expected);
  assert.deepEqual(
    standardCards.map((card) => card.id).sort(),
    [...new Set(expected.map((entry) => entry[2] as string))].sort(),
  );
});

test("生产身份分配由种子随机且主公总是先手", () => {
  const lords = new Set<string>();
  for (let seed = 1; seed <= 32; seed++) {
    const config = {
      seed,
      players: ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id })),
    };
    const first = createUnfixedGame(config);
    const second = createUnfixedGame(config);
    const lord = first.state.players.find((player) => player.identity === "lord")!;
    lords.add(lord.id);
    assert.equal(first.state.currentPlayerId, lord.id);
    assert.equal(first.snapshot(), second.snapshot());
  }
  assert.ok(lords.size > 1, "不同种子应能把主公分配给不同座位");
});

function passWuxie(game: HeadlessGame) {
  while (game.state.pending?.kind === "wuxie")
    game.dispatch({ type: "respond", playerId: game.state.pending.playerId });
}

function finishInitialPrompts(game: HeadlessGame) {
  while (
    game.state.pending?.kind === "tuxi" ||
    game.state.pending?.kind === "guanxing" ||
    game.state.pending?.kind === "phaseSkill" ||
    game.state.pending?.kind === "judgmentSkill" ||
    game.state.pending?.kind === "judgment"
  )
    game.dispatch(chooseAiCommand(game));
}

test("同一种子和操作序列产生完全相同快照", () => {
  const config = {
    seed: 20260713,
    players: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
  };
  const first = HeadlessGame.create(config);
  const card = first.state.players[0].hand.find((item) => item.name === "sha");
  const commands: GameCommand[] = card
    ? [
        { type: "useCard", playerId: "a", cardId: card.id, targetId: "b" },
        { type: "respond", playerId: "b" },
      ]
    : [{ type: "endTurn", playerId: "a" }];
  const expected = replay(config, commands).snapshot();
  const actual = replay(config, commands).snapshot();
  assert.equal(actual, expected);
});

test("快照恢复后继续运行与原实例一致", () => {
  const config = {
    seed: 7,
    players: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
  };
  const game = HeadlessGame.create(config);
  finishInitialPrompts(game);
  const restored = HeadlessGame.restore(game.snapshot());
  game.dispatch({ type: "endTurn", playerId: "a" });
  restored.dispatch({ type: "endTurn", playerId: "a" });
  assert.equal(restored.snapshot(), game.snapshot());
});

test("声明式自定义技能在无 DOM 引擎内触发", () => {
  const pack = {
    id: "custom.test",
    name: "测试包",
    version: "1.0.0",
    generals: [
      {
        id: "custom_hero",
        name: "测试将",
        faction: "qun",
        hp: 4,
        skills: ["custom_draw"],
      },
    ],
    skills: [
      {
        id: "custom_draw",
        name: "补给",
        event: "turnStart" as const,
        effects: [{ type: "draw" as const, target: "self" as const, count: 1 }],
      },
    ],
  };
  const game = HeadlessGame.create({
    seed: 1,
    players: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
    packages: [pack],
  });
  const custom = game.state.players.find(
    (player) => player.general.id === "custom_hero",
  );
  if (custom?.id === game.state.currentPlayerId)
    assert.equal(custom.hand.length, 7);
  else {
    game.dispatch({ type: "endTurn", playerId: game.state.currentPlayerId });
    assert.equal(custom?.hand.length, 7);
  }
});

test("runtime-only skills are owned by generals but never double-run as DSL", () => {
  const game = HeadlessGame.create({
    seed: 1,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    packages: [
      {
        id: "runtime.skill.test",
        name: "Runtime skill test",
        version: "1.0.0",
        generals: [
          {
            id: "runtime_hero",
            name: "Runtime hero",
            faction: "qun",
            hp: 4,
            skills: ["runtime_only_draw"],
          },
        ],
        skills: [
          {
            id: "runtime_only_draw",
            name: "Runtime only",
            runtimeOnly: true,
            event: "turnStart",
            effects: [],
          },
        ],
      },
    ],
  });

  assert.equal(
    game.state.log.some(
      (entry) =>
        entry.type === "skill.trigger" &&
        entry.message.includes("Runtime only"),
    ),
    false,
  );
});

test("自定义卡牌、牌堆和模式由权威引擎执行", () => {
  const pack = {
    id: "custom.rules",
    name: "规则包",
    version: "1.0.0",
    generals: [],
    skills: [],
    cards: [
      {
        id: "custom_supply",
        name: "军资",
        type: "trick" as const,
        target: "self" as const,
        effects: [{ type: "draw" as const, target: "self" as const, count: 2 }],
      },
    ],
    decks: [
      {
        id: "custom_deck",
        name: "测试牌堆",
        cards: [{ cardId: "custom_supply", count: 20 }],
      },
    ],
    modes: [
      {
        id: "custom_mode",
        name: "测试模式",
        minPlayers: 2,
        maxPlayers: 4,
        initialHand: 2,
        drawPerTurn: 1,
        winCondition: "lastAlive" as const,
        deckId: "custom_deck",
      },
    ],
  };
  const game = HeadlessGame.create({
    seed: 2,
    players: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
    packages: [pack],
    modeId: "custom_mode",
  });
  const before = game.state.players[0].hand.length;
  const card = game.state.players[0].hand[0];
  game.dispatch({ type: "useCard", playerId: "a", cardId: card.id });
  assert.equal(game.state.players[0].hand.length, before + 1);
  assert.equal(game.state.mode.id, "custom_mode");
});

test("turn lifecycle enters all six phases and enforces hand limit", () => {
  const game = HeadlessGame.create({
    seed: 11,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  assert.deepEqual(
    game.state.log.slice(-4).map((item) => item.type),
    ["phase.prepare", "phase.judge", "phase.draw", "phase.play"],
  );
  const player = game.state.players[0];
  game.dispatch({ type: "endTurn", playerId: player.id });
  assert.equal(game.state.phase, "discard");
  assert.equal(game.state.pending?.kind, "discard");
  if (game.state.pending?.kind !== "discard")
    throw new Error("discard expected");
  game.dispatch({
    type: "discardCards",
    playerId: player.id,
    cardIds: player.hand
      .slice(0, game.state.pending.count)
      .map((card) => card.id),
  });
  assert.equal(game.state.currentPlayerId, "b");
  assert.equal(game.state.phase, "play");
});

test("seat distance and horses affect attack distance", () => {
  const game = HeadlessGame.create({
    seed: 12,
    players: ["a", "b", "c", "d"].map((id) => ({ id, name: id })),
  });
  assert.equal(game.distance("a", "c"), 2);
  game.state.players[0].equipment.offensiveHorse = {
    id: "horse",
    name: "chitu",
    displayName: "Chi Tu",
    suit: "heart",
    rank: 5,
    type: "equipment",
    subtype: "offensiveHorse",
  };
  assert.equal(game.distance("a", "c"), 1);
  game.state.players[2].equipment.defensiveHorse = {
    id: "horse2",
    name: "dilu",
    displayName: "Di Lu",
    suit: "club",
    rank: 5,
    type: "equipment",
    subtype: "defensiveHorse",
  };
  assert.equal(game.distance("a", "c"), 2);
});

test("dying player can be rescued with tao", () => {
  const game = HeadlessGame.create({
    seed: 13,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  finishInitialPrompts(game);
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.hand[0].name = "sha";
  target.hand[0].name = "tao";
  target.hp = 1;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(game.state.pending?.kind, "dying");
  game.dispatch({ type: "respond", playerId: "b", cardId: target.hand[0].id });
  assert.equal(target.hp, 1);
  assert.equal(target.alive, true);
  assert.equal(game.state.phase, "play");
});

test("killing a rebel grants three cards", () => {
  const game = HeadlessGame.create({
    seed: 14,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.hand[0].name = "sha";
  target.hp = 1;
  const before = source.hand.length;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b" });
  game.dispatch({ type: "respond", playerId: "b" });
  game.dispatch({ type: "respond", playerId: "a" });
  assert.equal(target.alive, false);
  assert.equal(source.hand.length, before - 1 + 3);
  assert.equal(game.state.winner, "lord");
});

test("lord killing a loyalist discards all lord cards", () => {
  const game = HeadlessGame.create({
    seed: 15,
    players: ["a", "b", "c", "d"].map((id) => ({ id, name: id })),
  });
  const lord = game.state.players[0];
  const loyalist = game.state.players[1];
  lord.identity = "lord";
  loyalist.identity = "loyalist";
  game.state.players[2].identity = "rebel";
  game.state.players[3].identity = "renegade";
  lord.hand[0].name = "sha";
  loyalist.hp = 1;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: lord.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b" });
  for (const responder of ["b", "c", "d", "a"])
    game.dispatch({ type: "respond", playerId: responder });
  assert.equal(loyalist.alive, false);
  assert.equal(lord.hand.length, 0);
  assert.deepEqual(lord.equipment, {});
});

test("renegade wins when the lord dies with only the renegade alive", () => {
  const game = HeadlessGame.create({
    seed: 116,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  finishInitialPrompts(game);
  const [lord, rebel, renegade] = game.state.players;
  lord.identity = "lord";
  rebel.identity = "rebel";
  renegade.identity = "renegade";
  rebel.alive = false;
  rebel.hp = 0;
  game.state.currentPlayerId = renegade.id;
  game.state.phase = "play";
  renegade.hand[0].name = "sha";
  lord.general.skills = [];
  lord.hp = 1;
  game.dispatch({
    type: "useCard",
    playerId: renegade.id,
    cardId: renegade.hand[0].id,
    targetId: lord.id,
  });
  game.dispatch({ type: "respond", playerId: lord.id });
  game.dispatch({ type: "respond", playerId: lord.id });
  game.dispatch({ type: "respond", playerId: renegade.id });
  assert.equal(game.state.winner, "renegade");
});

test("standard catalogue contains basic, trick, delayed and equipment cards", () => {
  const ids = new Set(standardCards.map((card) => card.id));
  for (const id of [
    "sha",
    "shan",
    "tao",
    "wuxie",
    "juedou",
    "nanman",
    "wanjian",
    "lebu",
    "shandian",
    "zhuge",
    "hanbing",
    "bagua",
    "chitu",
    "jueying",
  ])
    assert.equal(ids.has(id), true, id);
  const game = HeadlessGame.create({
    seed: 20,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  assert.equal(
    game.state.deck.length +
      game.state.players.reduce((sum, player) => sum + player.hand.length, 0),
    108,
  );
});

test("equipment enters its slot and weapon controls attack range", () => {
  const game = HeadlessGame.create({
    seed: 21,
    players: ["a", "b", "c", "d"].map((id) => ({ id, name: id })),
  });
  const card = game.state.players[0].hand[0];
  card.name = "qinglong";
  game.dispatch({ type: "useCard", playerId: "a", cardId: card.id });
  assert.equal(game.state.players[0].equipment.weapon?.name, "qinglong");
  const sha = game.state.players[0].hand[0];
  sha.name = "sha";
  assert.doesNotThrow(() =>
    game.dispatch({
      type: "useCard",
      playerId: "a",
      cardId: sha.id,
      targetId: "c",
    }),
  );
});

test("duel alternates sha responses and damages the player who gives up", () => {
  const game = HeadlessGame.create({
    seed: 22,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const duel = game.state.players[0].hand[0];
  duel.name = "juedou";
  const sha = game.state.players[1].hand[0];
  sha.name = "sha";
  const hp = game.state.players[0].hp;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: duel.id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b", cardId: sha.id });
  game.dispatch({ type: "respond", playerId: "a" });
  assert.equal(game.state.players[0].hp, hp - 1);
  assert.equal(game.state.phase, "play");
});

test("aoe walks seats and preserves continuation after each response", () => {
  const game = HeadlessGame.create({
    seed: 23,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  const nanman = game.state.players[0].hand[0];
  nanman.name = "nanman";
  const sha = game.state.players[1].hand[0];
  sha.name = "sha";
  const hp = game.state.players[2].hp;
  game.dispatch({ type: "useCard", playerId: "a", cardId: nanman.id });
  passWuxie(game);
  game.dispatch({ type: "respond", playerId: "b", cardId: sha.id });
  passWuxie(game);
  game.dispatch({ type: "respond", playerId: "c" });
  assert.equal(game.state.players[2].hp, hp - 1);
  assert.equal(game.state.pending, undefined);
  assert.equal(game.state.phase, "play");
});

test("wuxie negates a group trick for one target instead of the whole card", () => {
  const game = HeadlessGame.create({
    seed: 2301,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  for (const player of game.state.players) {
    player.general.skills = [];
    for (const card of player.hand) card.name = "sha";
  }
  const nanman = game.state.players[0].hand[0];
  nanman.name = "nanman";
  const wuxie = game.state.players[1].hand[0];
  wuxie.name = "wuxie";
  const bHp = game.state.players[1].hp;
  const cHp = game.state.players[2].hp;
  game.dispatch({ type: "useCard", playerId: "a", cardId: nanman.id });
  assert.equal(game.state.pending?.kind, "wuxie");
  game.dispatch({ type: "respond", playerId: "a" });
  game.dispatch({ type: "respond", playerId: "b", cardId: wuxie.id });
  passWuxie(game);
  assert.equal(game.state.players[1].hp, bHp);
  assert.equal(game.state.pending?.kind, "nanman");
  assert.equal(game.state.pending?.playerId, "c");
  game.dispatch({ type: "respond", playerId: "c" });
  assert.equal(game.state.players[2].hp, cHp - 1);
  assert.equal(game.state.pending, undefined);
});

test("lebu judgment skips play phase on a non-heart result", () => {
  const game = HeadlessGame.create({
    seed: 24,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const lebu = game.state.players[0].hand[0];
  lebu.name = "lebu";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: lebu.id,
    targetId: "b",
  });
  game.state.deck[0].suit = "spade";
  game.dispatch({ type: "endTurn", playerId: "a" });
  if (game.state.pending?.kind === "discard") {
    game.dispatch({
      type: "discardCards",
      playerId: "a",
      cardIds: game.state.players[0].hand
        .slice(0, game.state.pending.count)
        .map((card) => card.id),
    });
  }
  assert.equal(game.state.currentPlayerId, "b");
  assert.equal(game.state.phase, "discard");
  assert.equal(
    game.state.log.some((item) => item.type === "phase.play.skipped"),
    true,
  );
});

test("guicai explicitly chooses a replacement judgment card", () => {
  const game = HeadlessGame.create({
    seed: 2401,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  const lebu = game.state.players[0].hand[0];
  lebu.name = "lebu";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: lebu.id,
    targetId: "b",
  });
  passWuxie(game);
  const simayi = game.state.players[2];
  simayi.general.skills = ["guicai"];
  const replacement = simayi.hand[0];
  replacement.suit = "heart";
  game.state.deck[0].suit = "spade";
  game.dispatch({ type: "endTurn", playerId: "a" });
  if (game.state.pending?.kind === "discard")
    game.dispatch({
      type: "discardCards",
      playerId: "a",
      cardIds: game.state.players[0].hand
        .slice(0, game.state.pending.count)
        .map((card) => card.id),
    });
  assert.equal(game.state.pending?.kind, "judgment");
  assert.equal(game.state.pending?.stage, "guicai");
  assert.equal(game.state.pending?.playerId, "c");
  game.dispatch({
    type: "respond",
    playerId: "c",
    cardId: replacement.id,
  });
  assert.equal(game.state.currentPlayerId, "b");
  assert.equal(game.state.phase, "play");
  assert.equal(
    game.state.discard.some((card) => card.id === replacement.id),
    true,
  );
});

test("tiandu is an explicit optional choice after judgment takes effect", () => {
  const game = HeadlessGame.create({
    seed: 2402,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const lebu = game.state.players[0].hand[0];
  lebu.name = "lebu";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: lebu.id,
    targetId: "b",
  });
  const guojia = game.state.players[1];
  guojia.general.skills = ["tiandu"];
  game.state.deck[0].suit = "spade";
  const judgedId = game.state.deck[0].id;
  game.dispatch({ type: "endTurn", playerId: "a" });
  if (game.state.pending?.kind === "discard")
    game.dispatch({
      type: "discardCards",
      playerId: "a",
      cardIds: game.state.players[0].hand
        .slice(0, game.state.pending.count)
        .map((card) => card.id),
    });
  assert.equal(game.state.pending?.kind, "judgment");
  assert.equal(game.state.pending?.stage, "tiandu");
  game.dispatch({
    type: "activateSkill",
    playerId: "b",
    skillId: "tiandu",
  });
  assert.equal(guojia.hand.some((card) => card.id === judgedId), true);
  assert.equal(
    game.state.discard.some((card) => card.id === judgedId),
    false,
  );
  assert.equal(
    game.state.log.some((item) => item.type === "phase.play.skipped"),
    true,
  );
});

test("tieji and bagua are explicit optional judgment skills", () => {
  const tieji = HeadlessGame.create({
    seed: 2403,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const machao = tieji.state.players[0];
  machao.general.skills = ["tieji"];
  machao.hand[0].name = "sha";
  tieji.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: machao.hand[0].id,
    targetId: "b",
  });
  assert.equal(tieji.state.pending?.kind, "judgmentSkill");
  tieji.dispatch({ type: "respond", playerId: "a" });
  assert.equal(tieji.state.pending?.kind, "shan");

  const bagua = HeadlessGame.create({
    seed: 2404,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = bagua.state.players[0];
  const target = bagua.state.players[1];
  source.general.skills = [];
  target.general.skills = [];
  source.hand[0].name = "sha";
  target.equipment.armor = {
    id: "bagua-test",
    name: "bagua",
    displayName: "八卦阵",
    suit: "spade",
    rank: 2,
    type: "equipment",
    subtype: "armor",
  };
  bagua.state.deck[0].suit = "heart";
  const hp = target.hp;
  bagua.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  bagua.dispatch({ type: "respond", playerId: "b" });
  assert.equal(bagua.state.pending?.kind, "judgmentSkill");
  bagua.dispatch({
    type: "activateSkill",
    playerId: "b",
    skillId: "bagua",
  });
  assert.equal(target.hp, hp);
  assert.equal(bagua.state.phase, "play");
});

test("luoshen asks before every judgment and can stop after a black result", () => {
  const game = HeadlessGame.create({
    seed: 2405,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const zhenji = game.state.players[1];
  zhenji.general.skills = ["luoshen"];
  game.state.deck[0].suit = "club";
  const blackId = game.state.deck[0].id;
  game.dispatch({ type: "endTurn", playerId: "a" });
  if (game.state.pending?.kind === "discard")
    game.dispatch({
      type: "discardCards",
      playerId: "a",
      cardIds: game.state.players[0].hand
        .slice(0, game.state.pending.count)
        .map((card) => card.id),
    });
  assert.equal(game.state.pending?.kind, "judgmentSkill");
  game.dispatch({
    type: "activateSkill",
    playerId: "b",
    skillId: "luoshen",
  });
  assert.equal(zhenji.hand.some((card) => card.id === blackId), true);
  assert.equal(game.state.pending?.kind, "judgmentSkill");
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(game.state.phase, "play");
});

test("lightning damage triggers resume the interrupted judgment phase", () => {
  const game = HeadlessGame.create({
    seed: 2406,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const lightning = game.state.players[0].hand.shift()!;
  lightning.name = "shandian";
  game.state.players[0].general.skills = [];
  game.state.players[1].judgment.push(lightning);
  game.state.players[1].general.skills = ["yiji"];
  game.state.deck[0].suit = "spade";
  game.state.deck[0].rank = 5;
  game.dispatch({ type: "endTurn", playerId: "a" });
  if (game.state.pending?.kind === "discard")
    game.dispatch({
      type: "discardCards",
      playerId: "a",
      cardIds: game.state.players[0].hand
        .slice(0, game.state.pending.count)
        .map((card) => card.id),
    });
  assert.equal(game.state.pending?.kind, "yijiChoice");
  game.dispatch({
    type: "activateSkill",
    playerId: "b",
    skillId: "yiji",
  });
  if (game.state.pending?.kind !== "yiji")
    throw new Error("lightning yiji distribution expected");
  game.dispatch({
    type: "activateSkill",
    playerId: "b",
    skillId: "yiji",
    cardIds: game.state.pending.cards.map((card) => card.id),
    targetIds: ["b"],
  });
  assert.equal(game.state.players[1].hp, 1);
  assert.equal(game.state.phase, "play");
  assert.equal(game.state.pending, undefined);
});

test("standard general catalogue contains 25 generals with skills", () => {
  assert.equal(standardGenerals.length, 25);
  assert.equal(
    standardGenerals.every((general) => general.skills.length > 0),
    true,
  );
  for (const id of [
    "caocao",
    "zhugeliang",
    "sunquan",
    "huatuo",
    "lvbu",
    "diaochan",
  ])
    assert.equal(
      standardGenerals.some((general) => general.id === id),
      true,
    );
});

test("25名标准武将的ID、势力、体力、性别和技能匹配无名杀上游", async () => {
  const upstream = (await import(
    new URL(
      "../../../vendor/noname/apps/core/character/standard/character.js",
      import.meta.url,
    ).href
  )).default as Record<
    string,
    { sex: "male" | "female"; group: string; hp: number; skills: string[] }
  >;
  const ids = [
    "caocao",
    "simayi",
    "xiahoudun",
    "zhangliao",
    "xuzhu",
    "guojia",
    "zhenji",
    "liubei",
    "guanyu",
    "zhangfei",
    "zhugeliang",
    "zhaoyun",
    "machao",
    "huangyueying",
    "sunquan",
    "ganning",
    "huanggai",
    "zhouyu",
    "daqiao",
    "luxun",
    "sunshangxiang",
    "lvmeng",
    "huatuo",
    "lvbu",
    "diaochan",
  ];
  assert.deepEqual(
    standardGenerals.map((general) => general.id).sort(),
    [...ids].sort(),
  );
  for (const id of ids) {
    const actual = standardGenerals.find((general) => general.id === id)!;
    const expected = upstream[id];
    assert.equal(actual.faction, expected.group, `${id} 势力`);
    assert.equal(actual.hp, expected.hp, `${id} 体力`);
    assert.equal(actual.gender ?? "male", expected.sex, `${id} 性别`);
    assert.deepEqual(actual.skills, expected.skills, `${id} 技能`);
  }
});

test("paoxiao removes the once-per-turn sha limit", () => {
  const game = HeadlessGame.create({
    seed: 30,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  finishInitialPrompts(game);
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.general.skills = ["paoxiao"];
  source.hand[0].name = "sha";
  source.hand[1].name = "sha";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b" });
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  assert.equal(game.state.pending?.kind, "shan");
  assert.equal(target.alive, true);
});

test("mashu reduces distance by one", () => {
  const game = HeadlessGame.create({
    seed: 31,
    players: ["a", "b", "c", "d"].map((id) => ({ id, name: id })),
  });
  game.state.players[0].general.skills = ["mashu"];
  assert.equal(game.distance("a", "c"), 1);
});

test("zhiheng discards selected cards and draws the same amount once", () => {
  const game = HeadlessGame.create({
    seed: 32,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const player = game.state.players[0];
  player.general.skills = ["zhiheng"];
  const ids = player.hand.slice(0, 2).map((card) => card.id);
  const before = player.hand.length;
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "zhiheng",
    cardIds: ids,
  });
  assert.equal(player.hand.length, before);
  assert.throws(() =>
    game.dispatch({
      type: "activateSkill",
      playerId: "a",
      skillId: "zhiheng",
      cardIds: [player.hand[0].id],
    }),
  );
});

test("zhiheng can discard equipment and is not limited by max hp", () => {
  const game = HeadlessGame.create({
    seed: 3201,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const player = game.state.players[0];
  player.general.skills = ["zhiheng"];
  while (player.hand.length < 5) player.hand.push(game.state.deck.shift()!);
  player.equipment.weapon = {
    id: "zhiheng-equipment",
    name: "qinglong",
    displayName: "青龙偃月刀",
    suit: "spade",
    rank: 5,
    type: "equipment",
    subtype: "weapon",
    range: 3,
  };
  const ids = [...player.hand.map((card) => card.id), player.equipment.weapon.id];
  const count = ids.length;
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "zhiheng",
    cardIds: ids,
  });
  assert.equal(count > player.maxHp, true);
  assert.equal(player.hand.length, count);
  assert.equal(player.equipment.weapon, undefined);
  assert.equal(
    game.state.discard.some((card) => card.id === "zhiheng-equipment"),
    true,
  );
});

test("view-as skills preserve the physical card name and accept equipment", () => {
  const game = HeadlessGame.create({
    seed: 3202,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  source.general.skills = ["wusheng", "lianying"];
  source.hand.splice(0);
  source.equipment.weapon = {
    id: "physical-red-weapon",
    name: "qinglong",
    displayName: "青龙偃月刀",
    suit: "heart",
    rank: 5,
    type: "equipment",
    subtype: "weapon",
    range: 3,
  };
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "wusheng",
    cardIds: ["physical-red-weapon"],
    targetIds: ["b"],
  });
  assert.equal(game.state.pending?.kind, "shan");
  assert.equal(
    game.state.discard.find((card) => card.id === "physical-red-weapon")?.name,
    "qinglong",
  );
  assert.equal(
    game.state.log.some((item) => item.type === "skill.lianying"),
    false,
  );
});

test("guose keeps the physical equipment identity under a virtual delayed trick", () => {
  const game = HeadlessGame.create({
    seed: 3203,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  source.general.skills = ["guose"];
  source.equipment.defensiveHorse = {
    id: "physical-diamond-horse",
    name: "dilu",
    displayName: "的卢",
    suit: "diamond",
    rank: 5,
    type: "equipment",
    subtype: "defensiveHorse",
  };
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "guose",
    cardIds: ["physical-diamond-horse"],
    targetIds: ["b"],
  });
  passWuxie(game);
  assert.equal(game.state.players[1].judgment[0]?.name, "dilu");
  assert.equal(game.state.players[1].judgment[0]?.virtualName, "lebu");
});

test("qixi and lijian accept equipment as their cost", () => {
  const qixi = HeadlessGame.create({
    seed: 3204,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const ganning = qixi.state.players[0];
  ganning.general.skills = ["qixi"];
  ganning.equipment.armor = {
    id: "qixi-equipment",
    name: "renwang",
    displayName: "仁王盾",
    suit: "club",
    rank: 2,
    type: "equipment",
    subtype: "armor",
  };
  qixi.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "qixi",
    cardIds: ["qixi-equipment"],
    targetIds: ["b"],
  });
  passWuxie(qixi);
  assert.equal(qixi.state.pending?.kind, "otherCard");
  assert.equal(
    qixi.state.discard.find((card) => card.id === "qixi-equipment")?.name,
    "renwang",
  );

  const lijian = HeadlessGame.create({
    seed: 3205,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  const diaochan = lijian.state.players[0];
  diaochan.general.skills = ["lijian"];
  lijian.state.players[1].general.gender = "male";
  lijian.state.players[2].general.gender = "male";
  diaochan.equipment.offensiveHorse = {
    id: "lijian-equipment",
    name: "chitu",
    displayName: "赤兔",
    suit: "heart",
    rank: 5,
    type: "equipment",
    subtype: "offensiveHorse",
  };
  lijian.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "lijian",
    cardIds: ["lijian-equipment"],
    targetIds: ["b", "c"],
  });
  assert.equal(lijian.state.pending?.kind, "duel");
  assert.equal(diaochan.equipment.offensiveHorse, undefined);
  assert.equal(
    lijian.state.discard.some((card) => card.id === "lijian-equipment"),
    true,
  );
});

test("wusheng and jijiu can answer with red equipment cards", () => {
  const duel = HeadlessGame.create({
    seed: 3206,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const duelCard = duel.state.players[0].hand[0];
  duelCard.name = "juedou";
  for (const player of duel.state.players)
    for (const card of player.hand)
      if (card.id !== duelCard.id && card.name === "wuxie") card.name = "sha";
  const guanyu = duel.state.players[1];
  guanyu.general.skills = ["wusheng"];
  guanyu.equipment.weapon = {
    id: "wusheng-response-equipment",
    name: "qinglong",
    displayName: "青龙偃月刀",
    suit: "heart",
    rank: 5,
    type: "equipment",
    subtype: "weapon",
    range: 3,
  };
  duel.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: duelCard.id,
    targetId: "b",
  });
  duel.dispatch({
    type: "respond",
    playerId: "b",
    cardId: "wusheng-response-equipment",
  });
  assert.equal(duel.state.pending?.kind, "duel");
  assert.equal(duel.state.pending?.playerId, "a");
  assert.equal(
    duel.state.discard.find(
      (card) => card.id === "wusheng-response-equipment",
    )?.name,
    "qinglong",
  );

  const rescue = HeadlessGame.create({
    seed: 3207,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  const attacker = rescue.state.players[0];
  const dying = rescue.state.players[1];
  const huatuo = rescue.state.players[2];
  attacker.hand[0].name = "sha";
  dying.hp = 1;
  huatuo.general.skills = ["jijiu"];
  huatuo.equipment.armor = {
    id: "jijiu-response-equipment",
    name: "bagua",
    displayName: "八卦阵",
    suit: "diamond",
    rank: 2,
    type: "equipment",
    subtype: "armor",
  };
  rescue.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: attacker.hand[0].id,
    targetId: "b",
  });
  rescue.dispatch({ type: "respond", playerId: "b" });
  while (
    rescue.state.pending?.kind === "dying" &&
    rescue.state.pending.responders[rescue.state.pending.responderIndex] !== "c"
  ) {
    const responder =
      rescue.state.pending.responders[rescue.state.pending.responderIndex];
    rescue.dispatch({ type: "respond", playerId: responder });
  }
  rescue.dispatch({
    type: "respond",
    playerId: "c",
    cardId: "jijiu-response-equipment",
  });
  assert.equal(dying.alive, true);
  assert.equal(dying.hp, 1);
  assert.equal(
    rescue.state.discard.find(
      (card) => card.id === "jijiu-response-equipment",
    )?.name,
    "bagua",
  );
});

test("qingguo allows a black hand card to answer as shan", () => {
  const game = HeadlessGame.create({
    seed: 33,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.hand[0].name = "sha";
  target.general.skills = ["qingguo"];
  target.hand[0].name = "tao";
  target.hand[0].suit = "spade";
  const hp = target.hp;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b", cardId: target.hand[0].id });
  assert.equal(target.hp, hp);
  assert.equal(game.state.phase, "play");
});

test("liuli lets its owner choose both the discarded card and redirected target", () => {
  const game = HeadlessGame.create({
    seed: 122,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  const [source, daqiao, redirected] = game.state.players;
  source.general.skills = [];
  daqiao.general.skills = ["liuli"];
  redirected.general.skills = [];
  source.hand[0].name = "sha";
  const costId = daqiao.hand[0].id;
  const before = daqiao.hand.length;
  game.dispatch({
    type: "useCard",
    playerId: source.id,
    cardId: source.hand[0].id,
    targetId: daqiao.id,
  });
  assert.equal(game.state.pending?.kind, "liuli");
  game.dispatch({
    type: "activateSkill",
    playerId: daqiao.id,
    skillId: "liuli",
    cardIds: [costId],
    targetIds: [redirected.id],
  });
  assert.equal(daqiao.hand.length, before - 1);
  assert.equal(game.state.pending?.kind, "shan");
  assert.equal(game.state.pending?.playerId, redirected.id);
});

test("basic AI drives authoritative commands through turns and responses", () => {
  const run = () => {
    const game = HeadlessGame.create({
      seed: 40,
      players: ["a", "b", "c", "d"].map((id) => ({ id, name: id })),
    });
    let commands = 0;
    while (game.state.status === "playing" && commands < 500) {
      game.dispatch(chooseAiCommand(game));
      commands++;
    }
    assert.ok(commands > 20);
    return game.snapshot();
  };
  assert.equal(run(), run());
});

test("identity setup supports every player count from two through eight", () => {
  const expected: Record<number, Record<string, number>> = {
    2: { lord: 1, rebel: 1 },
    3: { lord: 1, rebel: 1, renegade: 1 },
    4: { lord: 1, loyalist: 1, rebel: 1, renegade: 1 },
    5: { lord: 1, loyalist: 1, rebel: 2, renegade: 1 },
    6: { lord: 1, loyalist: 1, rebel: 3, renegade: 1 },
    7: { lord: 1, loyalist: 2, rebel: 3, renegade: 1 },
    8: { lord: 1, loyalist: 2, rebel: 4, renegade: 1 },
  };
  for (let count = 2; count <= 8; count++) {
    const game = HeadlessGame.create({
      seed: 50 + count,
      players: Array.from({ length: count }, (_, index) => ({
        id: `p${index}`,
        name: `P${index}`,
      })),
    });
    const actual: Record<string, number> = {};
    for (const player of game.state.players)
      actual[player.identity] = (actual[player.identity] ?? 0) + 1;
    assert.deepEqual(actual, expected[count]);
  }
});

test("snapshot restores every interactive selection without changing the next result", () => {
  const verifyPending = (
    kind: "shan" | "duel" | "nanman" | "dying" | "discard",
  ) => {
    const game = HeadlessGame.create({
      seed: 70,
      players: ["a", "b", "c"].map((id) => ({ id, name: id })),
    });
    const source = game.state.players[0];
    if (kind === "discard") game.dispatch({ type: "endTurn", playerId: "a" });
    else {
      source.hand[0].name =
        kind === "duel" ? "juedou" : kind === "nanman" ? "nanman" : "sha";
      if (kind === "dying") game.state.players[1].hp = 1;
      game.dispatch({
        type: "useCard",
        playerId: "a",
        cardId: source.hand[0].id,
        targetId: kind === "nanman" ? undefined : "b",
      });
      if (kind === "dying") game.dispatch({ type: "respond", playerId: "b" });
    }
    assert.equal(game.state.pending?.kind, kind);
    const restored = HeadlessGame.restore(game.snapshot());
    const command = chooseAiCommand(game);
    game.dispatch(command);
    restored.dispatch(command);
    assert.equal(restored.snapshot(), game.snapshot());
  };
  for (const kind of ["shan", "duel", "nanman", "dying", "discard"] as const)
    verifyPending(kind);
});

test("guanxing is optional and declining restores the revealed cards in order", () => {
  const game = createUnfixedGame({
    seed: 7,
    fixedLordId: "a",
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  assert.equal(game.state.pending?.kind, "guanxing");
  if (game.state.pending?.kind !== "guanxing")
    throw new Error("seed 7 should select the guanxing general");
  const revealed = game.state.pending.cards.map((card) => card.id);
  const player = game.state.players.find(
    (candidate) => candidate.id === game.state.pending?.playerId,
  )!;
  const handBefore = player.hand.length;
  game.dispatch({ type: "respond", playerId: player.id });
  assert.deepEqual(
    player.hand.slice(handBefore).map((card) => card.id),
    revealed,
  );
  assert.equal(game.state.phase, "play");
});

test("luoyi and yingzi use explicit optional draw-phase confirmations", () => {
  const make = (skill: "luoyi" | "yingzi") => {
    const game = HeadlessGame.create({
      seed: skill === "luoyi" ? 117 : 118,
      players: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
    });
    finishInitialPrompts(game);
    const current = game.state.players[0];
    const next = game.state.players[1];
    current.general.skills = [];
    current.hand.splice(0);
    next.general.skills = [skill];
    const before = next.hand.length;
    game.dispatch({ type: "endTurn", playerId: current.id });
    assert.equal(game.state.pending?.kind, "phaseSkill");
    assert.equal(
      game.state.pending?.kind === "phaseSkill"
        ? game.state.pending.skillId
        : undefined,
      skill,
    );
    return { game, next, before };
  };

  const declined = make("luoyi");
  declined.game.dispatch({ type: "respond", playerId: declined.next.id });
  assert.equal(declined.next.hand.length, declined.before + 2);
  assert.equal(declined.next.marks.luoyi, undefined);

  const luoyi = make("luoyi");
  luoyi.game.dispatch({
    type: "activateSkill",
    playerId: luoyi.next.id,
    skillId: "luoyi",
  });
  assert.equal(luoyi.next.hand.length, luoyi.before + 1);
  assert.equal(luoyi.next.marks.luoyi, 1);

  const yingzi = make("yingzi");
  yingzi.game.dispatch({
    type: "activateSkill",
    playerId: yingzi.next.id,
    skillId: "yingzi",
  });
  assert.equal(yingzi.next.hand.length, yingzi.before + 3);
});

test("keji and biyue are optional and recorded through authoritative commands", () => {
  const keji = HeadlessGame.create({
    seed: 119,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  finishInitialPrompts(keji);
  const actor = keji.state.players[0];
  actor.general.skills = ["keji"];
  keji.dispatch({ type: "endTurn", playerId: actor.id });
  assert.equal(keji.state.pending?.kind, "phaseSkill");
  keji.dispatch({ type: "activateSkill", playerId: actor.id, skillId: "keji" });
  assert.notEqual(keji.state.currentPlayerId, actor.id);

  const biyue = HeadlessGame.create({
    seed: 120,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  finishInitialPrompts(biyue);
  const diaochan = biyue.state.players[0];
  diaochan.general.skills = ["biyue"];
  diaochan.hand.splice(0);
  biyue.dispatch({ type: "endTurn", playerId: diaochan.id });
  assert.equal(biyue.state.pending?.kind, "phaseSkill");
  biyue.dispatch({
    type: "activateSkill",
    playerId: diaochan.id,
    skillId: "biyue",
  });
  assert.equal(diaochan.hand.length, 1);
});

test("wushuang requires two shan responses", () => {
  const game = HeadlessGame.create({
    seed: 80,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.general.skills = ["wushuang"];
  source.hand[0].name = "sha";
  target.hand[0].name = "shan";
  target.hand[1].name = "shan";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b", cardId: target.hand[0].id });
  assert.equal(game.state.pending?.kind, "shan");
  game.dispatch({ type: "respond", playerId: "b", cardId: target.hand[0].id });
  assert.equal(game.state.pending, undefined);
});

test("hujia can consume a wei ally shan", () => {
  const game = HeadlessGame.create({
    seed: 81,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  finishInitialPrompts(game);
  const source = game.state.players[0];
  const lord = game.state.players[1];
  const ally = game.state.players[2];
  source.hand[0].name = "sha";
  source.identity = "rebel";
  lord.identity = "lord";
  lord.general.skills = ["hujia"];
  ally.general.faction = "wei";
  ally.hand[0].name = "shan";
  const shanId = ally.hand[0].id;
  const before = ally.hand.length;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(game.state.pending?.kind, "hujia");
  game.dispatch({ type: "respond", playerId: "c", cardId: shanId });
  assert.equal(ally.hand.length, before - 1);
  assert.equal(game.state.phase, "play");
});

test("xiaoji draws two when replacing equipment", () => {
  const game = HeadlessGame.create({
    seed: 82,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const player = game.state.players[0];
  player.general.skills = ["xiaoji"];
  player.equipment.weapon = {
    id: "old",
    name: "zhuge",
    displayName: "Old",
    suit: "club",
    rank: 1,
    type: "equipment",
    subtype: "weapon",
    range: 1,
  };
  const card = player.hand[0];
  card.name = "qinglong";
  const before = player.hand.length;
  game.dispatch({ type: "useCard", playerId: "a", cardId: card.id });
  assert.equal(game.state.pending?.kind, "optionalTrigger");
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "xiaoji",
  });
  assert.equal(player.hand.length, before + 1);
  assert.equal(player.equipment.weapon?.name, "qinglong");
});

test("lianying draws after the last hand card is lost", () => {
  const game = HeadlessGame.create({
    seed: 83,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const player = game.state.players[0];
  player.general.skills = ["lianying", "zhiheng"];
  player.hand.splice(1);
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "zhiheng",
    cardIds: [player.hand[0].id],
  });
  assert.equal(game.state.pending?.kind, "optionalTrigger");
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "lianying",
  });
  assert.equal(
    game.state.log.some((item) => item.type === "skill.lianying"),
    true,
  );
  assert.equal(player.hand.length, 2);
});

test("jizhi is optional and resolves before the trick response chain", () => {
  const game = HeadlessGame.create({
    seed: 8301,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const player = game.state.players[0];
  player.general.skills = ["jizhi"];
  const card = player.hand[0];
  card.name = "wuzhong";
  const before = player.hand.length;
  game.dispatch({ type: "useCard", playerId: "a", cardId: card.id });
  assert.equal(game.state.pending?.kind, "optionalTrigger");
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "jizhi",
  });
  assert.equal(player.hand.length, before);
  passWuxie(game);
  assert.equal(player.hand.length, before + 2);
});

test("wugu reveals cards and lets every living player choose in seat order", () => {
  const game = HeadlessGame.create({
    seed: 90,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  finishInitialPrompts(game);
  const card = game.state.players[0].hand[0];
  card.name = "wugu";
  const before = game.state.players.map((player) => player.hand.length);
  game.dispatch({ type: "useCard", playerId: "a", cardId: card.id });
  passWuxie(game);
  assert.equal(game.state.pending?.kind, "wugu");
  for (const id of ["a", "b", "c"]) {
    if (game.state.pending?.kind !== "wugu")
      throw new Error("wugu pending expected");
    game.dispatch({
      type: "chooseCard",
      playerId: id,
      cardId: game.state.pending.cards[0].id,
    });
    passWuxie(game);
  }
  assert.equal(game.state.pending, undefined);
  assert.deepEqual(
    game.state.players.map((player) => player.hand.length),
    [before[0], before[1] + 1, before[2] + 1],
  );
});

test("jiedao asks the weapon holder to use sha against the second target", () => {
  const game = HeadlessGame.create({
    seed: 91,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  const source = game.state.players[0];
  const holder = game.state.players[1];
  const victim = game.state.players[2];
  const trick = source.hand[0];
  trick.name = "jiedao";
  holder.equipment.weapon = {
    id: "weapon",
    name: "qinglong",
    displayName: "青龙偃月刀",
    suit: "spade",
    rank: 5,
    type: "equipment",
    subtype: "weapon",
    range: 3,
  };
  holder.hand[0].name = "sha";
  const hp = victim.hp;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: trick.id,
    targetIds: ["b", "c"],
  });
  if (game.state.pending?.kind === "optionalTrigger")
    game.dispatch({
      type: "activateSkill",
      playerId: game.state.pending.playerId,
      skillId: game.state.pending.skillId,
    });
  passWuxie(game);
  assert.equal(game.state.pending?.kind, "jiedao");
  game.dispatch({ type: "respond", playerId: "b", cardId: holder.hand[0].id });
  assert.equal(game.state.pending?.kind, "shan");
  game.dispatch({ type: "respond", playerId: "c" });
  assert.equal(victim.hp, hp - 1);
  assert.equal(holder.equipment.weapon?.name, "qinglong");
});

test("jiedao transfers the weapon when its holder declines to use sha", () => {
  const game = HeadlessGame.create({
    seed: 92,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  const source = game.state.players[0];
  const holder = game.state.players[1];
  const trick = source.hand[0];
  trick.name = "jiedao";
  holder.equipment.weapon = {
    id: "weapon",
    name: "qinglong",
    displayName: "青龙偃月刀",
    suit: "spade",
    rank: 5,
    type: "equipment",
    subtype: "weapon",
    range: 3,
  };
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: trick.id,
    targetIds: ["b", "c"],
  });
  passWuxie(game);
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(holder.equipment.weapon, undefined);
  assert.equal(
    source.hand.some((card) => card.id === "weapon"),
    true,
  );
  assert.equal(game.state.phase, "play");
});

test("shunshou and guohe wait for the source to choose a target-zone card", () => {
  const game = HeadlessGame.create({
    seed: 115,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  finishInitialPrompts(game);
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.general.skills = [];
  target.general.skills = [];
  source.hand.forEach((card) => (card.name = "sha"));
  target.hand.forEach((card) => (card.name = "sha"));
  const equipment = target.hand.pop()!;
  Object.assign(equipment, {
    name: "bagua",
    displayName: "八卦阵",
    type: "equipment" as const,
    subtype: "armor" as const,
  });
  target.equipment.armor = equipment;
  const shun = source.hand[0];
  shun.name = "shunshou";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: shun.id,
    targetId: "b",
  });
  assert.equal(game.state.pending?.kind, "otherCard");
  game.dispatch({ type: "chooseCard", playerId: "a", cardId: equipment.id });
  assert.equal(source.hand.some((card) => card.id === equipment.id), true);
  assert.equal(target.equipment.armor, undefined);

  const guohe = source.hand.find((card) => card.id !== equipment.id)!;
  guohe.name = "guohe";
  const targetHandBefore = target.hand.length;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: guohe.id,
    targetId: "b",
  });
  assert.equal(game.state.pending?.kind, "otherCard");
  game.dispatch({ type: "chooseCard", playerId: "a", cardId: "random-hand" });
  assert.equal(target.hand.length, targetHandBefore - 1);
  assert.equal(game.state.pending, undefined);
});

test("wugu selection survives snapshot restoration", () => {
  const game = HeadlessGame.create({
    seed: 93,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  game.state.players[0].hand[0].name = "wugu";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: game.state.players[0].hand[0].id,
  });
  passWuxie(game);
  const restored = HeadlessGame.restore(game.snapshot());
  const command = chooseAiCommand(game);
  game.dispatch(command);
  restored.dispatch(command);
  assert.equal(restored.snapshot(), game.snapshot());
});

test("wuxie response chain can negate a trick", () => {
  const game = HeadlessGame.create({
    seed: 94,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  for (const player of game.state.players)
    for (const card of player.hand)
      if (card.name === "wuxie") card.name = "sha";
  const source = game.state.players[0];
  const target = game.state.players[1];
  const trick = source.hand[0];
  trick.name = "wuzhong";
  const counter = target.hand[0];
  counter.name = "wuxie";
  const before = source.hand.length;
  game.dispatch({ type: "useCard", playerId: "a", cardId: trick.id });
  assert.equal(game.state.pending?.kind, "wuxie");
  game.dispatch({ type: "respond", playerId: "a" });
  game.dispatch({ type: "respond", playerId: "b", cardId: counter.id });
  game.dispatch({ type: "respond", playerId: "a" });
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(source.hand.length, before - 1);
  assert.equal(game.state.pending, undefined);
  assert.equal(
    game.state.log.some((item) => item.type === "card.wuxie.cancel"),
    true,
  );
});

test("a second wuxie restores the original trick effect", () => {
  const game = HeadlessGame.create({
    seed: 95,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  for (const player of game.state.players)
    for (const card of player.hand)
      if (card.name === "wuxie") card.name = "sha";
  const source = game.state.players[0];
  const trick = source.hand[0];
  trick.name = "wuzhong";
  const first = game.state.players[1].hand[0];
  first.name = "wuxie";
  const second = game.state.players[2].hand[0];
  second.name = "wuxie";
  const before = source.hand.length;
  game.dispatch({ type: "useCard", playerId: "a", cardId: trick.id });
  game.dispatch({ type: "respond", playerId: "a" });
  game.dispatch({ type: "respond", playerId: "b", cardId: first.id });
  game.dispatch({ type: "respond", playerId: "c", cardId: second.id });
  for (const id of ["a", "b", "c"])
    game.dispatch({ type: "respond", playerId: id });
  assert.equal(source.hand.length, before + 1);
  assert.equal(game.state.pending, undefined);
});

test("wuxie stack survives snapshot restoration", () => {
  const game = HeadlessGame.create({
    seed: 96,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  for (const player of game.state.players)
    for (const card of player.hand)
      if (card.name === "wuxie") card.name = "sha";
  game.state.players[0].hand[0].name = "wuzhong";
  game.state.players[1].hand[0].name = "wuxie";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: game.state.players[0].hand[0].id,
  });
  game.dispatch({ type: "respond", playerId: "a" });
  const restored = HeadlessGame.restore(game.snapshot());
  const command = chooseAiCommand(game);
  game.dispatch(command);
  restored.dispatch(command);
  assert.equal(restored.snapshot(), game.snapshot());
});

test("qinglong can continue using sha after the target plays shan", () => {
  const game = HeadlessGame.create({
    seed: 97,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  target.general.skills = [];
  source.equipment.weapon = {
    id: "weapon",
    name: "qinglong",
    displayName: "青龙偃月刀",
    suit: "spade",
    rank: 5,
    type: "equipment",
    subtype: "weapon",
    range: 3,
  };
  source.hand[0].name = "sha";
  source.hand[1].name = "sha";
  target.hand[0].name = "shan";
  const firstSha = source.hand[0].id;
  const secondSha = source.hand[1].id;
  const shan = target.hand[0].id;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: firstSha,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b", cardId: shan });
  assert.equal(game.state.pending?.kind, "qinglong");
  game.dispatch({ type: "respond", playerId: "a", cardId: secondSha });
  assert.equal(game.state.pending?.kind, "shan");
  assert.equal(
    game.state.pending?.kind === "shan"
      ? game.state.pending.playerId
      : undefined,
    "b",
  );
});

test("guanshi discards two cards to force a dodged sha to deal damage", () => {
  const game = HeadlessGame.create({
    seed: 98,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  target.general.skills = [];
  source.equipment.weapon = {
    id: "weapon",
    name: "guanshi",
    displayName: "贯石斧",
    suit: "diamond",
    rank: 5,
    type: "equipment",
    subtype: "weapon",
    range: 3,
  };
  source.equipment.armor = {
    id: "guanshi-armor-cost",
    name: "bagua",
    displayName: "八卦阵",
    suit: "spade",
    rank: 2,
    type: "equipment",
    subtype: "armor",
  };
  source.hand[0].name = "sha";
  target.hand[0].name = "shan";
  const sha = source.hand[0].id;
  const shan = target.hand[0].id;
  const hp = target.hp;
  game.dispatch({ type: "useCard", playerId: "a", cardId: sha, targetId: "b" });
  game.dispatch({ type: "respond", playerId: "b", cardId: shan });
  assert.equal(game.state.pending?.kind, "guanshi");
  game.dispatch({
    type: "discardCards",
    playerId: "a",
    cardIds: [source.hand[0].id, "guanshi-armor-cost"],
  });
  assert.equal(target.hp, hp - 1);
  assert.equal(source.equipment.armor, undefined);
  assert.equal(game.state.phase, "play");
});

test("zhangba converts two hand cards into sha", () => {
  const game = HeadlessGame.create({
    seed: 99,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  source.equipment.weapon = {
    id: "weapon",
    name: "zhangba",
    displayName: "丈八蛇矛",
    suit: "spade",
    rank: 12,
    type: "equipment",
    subtype: "weapon",
    range: 3,
  };
  const ids = source.hand.slice(0, 2).map((card) => card.id);
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "zhangba",
    cardIds: ids,
    targetIds: ["b"],
  });
  assert.equal(game.state.pending?.kind, "shan");
  assert.equal(
    source.hand.some((card) => ids.includes(card.id)),
    false,
  );
});

test("fangtian lets the last hand sha resolve against up to three targets", () => {
  const game = HeadlessGame.create({
    seed: 100,
    players: ["a", "b", "c", "d"].map((id) => ({ id, name: id })),
  });
  const source = game.state.players[0];
  source.equipment.weapon = {
    id: "weapon",
    name: "fangtian",
    displayName: "方天画戟",
    suit: "diamond",
    rank: 12,
    type: "equipment",
    subtype: "weapon",
    range: 4,
  };
  source.hand.splice(1);
  source.hand[0].name = "sha";
  const hp = game.state.players.slice(1).map((player) => player.hp);
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetIds: ["b", "c", "d"],
  });
  for (const id of ["b", "c", "d"])
    game.dispatch({ type: "respond", playerId: id });
  assert.deepEqual(
    game.state.players.slice(1).map((player) => player.hp),
    hp.map((value) => value - 1),
  );
  assert.equal(game.state.pending, undefined);
});

test("every later fangtian target enters the full sha target pipeline", () => {
  const game = HeadlessGame.create({
    seed: 10001,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  const source = game.state.players[0];
  source.general.skills = ["tieji"];
  game.state.players[1].general.skills = [];
  game.state.players[2].general.skills = [];
  source.equipment.weapon = {
    id: "fangtian-pipeline",
    name: "fangtian",
    displayName: "方天画戟",
    suit: "diamond",
    rank: 12,
    type: "equipment",
    subtype: "weapon",
    range: 4,
  };
  source.hand.splice(1);
  source.hand[0].name = "sha";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetIds: ["b", "c"],
  });
  assert.equal(game.state.pending?.kind, "judgmentSkill");
  game.dispatch({ type: "respond", playerId: "a" });
  assert.equal(game.state.pending?.kind, "shan");
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(game.state.pending?.kind, "judgmentSkill");
  if (game.state.pending?.kind !== "judgmentSkill")
    throw new Error("second tieji choice expected");
  assert.equal(game.state.pending.context.kind, "tieji");
  if (game.state.pending.context.kind === "tieji")
    assert.equal(game.state.pending.context.targetId, "c");
});

test("cixiong lets an opposite-gender target discard or let the source draw", () => {
  const game = HeadlessGame.create({
    seed: 101,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.general.id = "caocao";
  target.general.id = "zhenji";
  source.equipment.weapon = {
    id: "weapon",
    name: "cixiong",
    displayName: "雌雄双股剑",
    suit: "spade",
    rank: 2,
    type: "equipment",
    subtype: "weapon",
    range: 2,
  };
  source.hand[0].name = "sha";
  const discardId = target.hand[0].id;
  const before = target.hand.length;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  assert.equal(game.state.pending?.kind, "cixiong");
  game.dispatch({ type: "respond", playerId: "b", cardId: discardId });
  assert.equal(target.hand.length, before - 1);
  assert.equal(game.state.pending?.kind, "shan");
});

test("qilin can discard a mount after sha deals damage", () => {
  const game = HeadlessGame.create({
    seed: 102,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.equipment.weapon = {
    id: "weapon",
    name: "qilin",
    displayName: "麒麟弓",
    suit: "heart",
    rank: 5,
    type: "equipment",
    subtype: "weapon",
    range: 5,
  };
  target.equipment.defensiveHorse = {
    id: "horse",
    name: "dilu",
    displayName: "的卢",
    suit: "club",
    rank: 5,
    type: "equipment",
    subtype: "defensiveHorse",
  };
  source.hand[0].name = "sha";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(game.state.pending?.kind, "qilin");
  game.dispatch({ type: "chooseCard", playerId: "a", cardId: "horse" });
  assert.equal(target.equipment.defensiveHorse, undefined);
  assert.equal(game.state.phase, "play");
});

test("hanbing can prevent sha damage and discard up to two target cards", () => {
  const game = HeadlessGame.create({
    seed: 114,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  finishInitialPrompts(game);
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.general.skills = [];
  target.general.skills = [];
  const weapon = source.hand.pop()!;
  Object.assign(weapon, {
    name: "hanbing",
    displayName: "寒冰剑",
    type: "equipment" as const,
    subtype: "weapon" as const,
    range: 2,
  });
  source.equipment.weapon = weapon;
  source.hand[0].name = "sha";
  const targetHp = target.hp;
  const targetHand = target.hand.length;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(game.state.pending?.kind, "hanbing");
  game.dispatch({ type: "chooseCard", playerId: "a", cardId: "random-hand" });
  assert.equal(game.state.pending?.kind, "hanbing");
  game.dispatch({ type: "chooseCard", playerId: "a", cardId: "random-hand" });
  assert.equal(target.hp, targetHp);
  assert.equal(target.hand.length, targetHand - 2);
  assert.equal(game.state.pending, undefined);
});

test("jianxiong obtains the actual card that caused damage", () => {
  const game = HeadlessGame.create({
    seed: 103,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.hand[0].name = "sha";
  target.general.skills = ["jianxiong"];
  const shaId = source.hand[0].id;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: shaId,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(game.state.pending?.kind, "jianxiong");
  game.dispatch({
    type: "activateSkill",
    playerId: "b",
    skillId: "jianxiong",
  });
  assert.equal(
    target.hand.some((card) => card.id === shaId),
    true,
  );
  assert.equal(
    game.state.discard.some((card) => card.id === shaId),
    false,
  );
});

test("fanjian waits for a suit choice before transferring and comparing the card", () => {
  const game = HeadlessGame.create({
    seed: 104,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.general.skills = ["fanjian"];
  const hp = target.hp;
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "fanjian",
    targetIds: ["b"],
  });
  if (game.state.pending?.kind !== "fanjian")
    throw new Error("fanjian pending expected");
  const card = source.hand.find(
    (item) => item.id === game.state.pending?.cardId,
  )!;
  game.dispatch({ type: "chooseSuit", playerId: "b", suit: card.suit });
  assert.equal(target.hp, hp);
  assert.equal(
    target.hand.some((item) => item.id === card.id),
    true,
  );
});

test("jieyin and lijian enforce their standard gender targets", () => {
  const game = HeadlessGame.create({
    seed: 105,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  const source = game.state.players[0];
  source.general.skills = ["jieyin", "lijian"];
  game.state.players[1].general.id = "zhenji";
  game.state.players[1].hp--;
  assert.throws(() =>
    game.dispatch({
      type: "activateSkill",
      playerId: "a",
      skillId: "jieyin",
      cardIds: source.hand.slice(0, 2).map((card) => card.id),
      targetIds: ["b"],
    }),
  );
  source.marks["used.jieyin"] = 0;
  assert.throws(() =>
    game.dispatch({
      type: "activateSkill",
      playerId: "a",
      skillId: "lijian",
      cardIds: [source.hand[0].id],
      targetIds: ["b", "c"],
    }),
  );
});

test("tuxi replaces draw cards during the draw phase", () => {
  const game = HeadlessGame.create({
    seed: 106,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  game.state.players[1].general.skills = ["tuxi"];
  game.dispatch({ type: "endTurn", playerId: "a" });
  if (game.state.pending?.kind === "discard")
    game.dispatch({
      type: "discardCards",
      playerId: "a",
      cardIds: game.state.players[0].hand
        .slice(0, game.state.pending.count)
        .map((card) => card.id),
    });
  assert.equal(game.state.pending?.kind, "tuxi");
  const firstBefore = game.state.players[0].hand.length;
  const secondBefore = game.state.players[1].hand.length;
  game.dispatch({
    type: "activateSkill",
    playerId: "b",
    skillId: "tuxi",
    targetIds: ["a"],
  });
  assert.equal(game.state.players[0].hand.length, firstBefore - 1);
  assert.equal(game.state.players[1].hand.length, secondBefore + 2);
  assert.equal(game.state.phase, "play");
});

test("fankui lets the damaged player choose a random hand card or public equipment", () => {
  const game = HeadlessGame.create({
    seed: 107,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  finishInitialPrompts(game);
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.hand[0].name = "sha";
  target.general.skills = ["fankui"];
  const sourceBefore = source.hand.length;
  const targetBefore = target.hand.length;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(game.state.pending?.kind, "fankui");
  game.dispatch({ type: "chooseCard", playerId: "b", cardId: "random-hand" });
  assert.equal(source.hand.length, sourceBefore - 2);
  assert.equal(target.hand.length, targetBefore + 1);
  assert.equal(game.state.phase, "play");
});

test("yiji reveals two cards per damage and lets the owner distribute them", () => {
  const game = HeadlessGame.create({
    seed: 121,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  const source = game.state.players[0];
  const owner = game.state.players[1];
  const friend = game.state.players[2];
  source.general.skills = [];
  owner.general.skills = ["yiji"];
  source.hand[0].name = "sha";
  const ownerBefore = owner.hand.length;
  const friendBefore = friend.hand.length;
  game.dispatch({
    type: "useCard",
    playerId: source.id,
    cardId: source.hand[0].id,
    targetId: owner.id,
  });
  game.dispatch({ type: "respond", playerId: owner.id });
  assert.equal(game.state.pending?.kind, "yijiChoice");
  game.dispatch({
    type: "activateSkill",
    playerId: owner.id,
    skillId: "yiji",
  });
  assert.equal(game.state.pending?.kind, "yiji");
  if (game.state.pending?.kind !== "yiji") throw new Error("yiji pending expected");
  const [first, second] = game.state.pending.cards.map((card) => card.id);
  game.dispatch({
    type: "activateSkill",
    playerId: owner.id,
    skillId: "yiji",
    cardIds: [first],
    targetIds: [friend.id],
  });
  assert.equal(game.state.pending?.kind, "yiji");
  game.dispatch({
    type: "activateSkill",
    playerId: owner.id,
    skillId: "yiji",
    cardIds: [second],
    targetIds: [owner.id],
  });
  assert.equal(friend.hand.length, friendBefore + 1);
  assert.equal(owner.hand.length, ownerBefore + 1);
  assert.equal(game.state.pending, undefined);
});

test("ganglie uses a judgment and damages the source when they decline to discard two", () => {
  const game = HeadlessGame.create({
    seed: 108,
    players: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  });
  finishInitialPrompts(game);
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.general.skills = [];
  target.general.skills = ["ganglie"];
  source.hand[0].name = "sha";
  game.state.deck[0].suit = "spade";
  const hp = source.hp;
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: source.hand[0].id,
    targetId: "b",
  });
  game.dispatch({ type: "respond", playerId: "b" });
  assert.equal(game.state.pending?.kind, "judgmentSkill");
  game.dispatch({
    type: "activateSkill",
    playerId: "b",
    skillId: "ganglie",
  });
  assert.equal(game.state.pending?.kind, "ganglie");
  game.dispatch({ type: "respond", playerId: "a" });
  assert.equal(source.hp, hp - 1);
  assert.equal(game.state.phase, "play");
});

test("jijiang asks shu allies in seat order instead of auto-consuming a card", () => {
  const game = HeadlessGame.create({
    seed: 109,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  finishInitialPrompts(game);
  const lord = game.state.players[0];
  const ally = game.state.players[1];
  lord.identity = "lord";
  lord.general.skills = ["jijiang"];
  ally.general.faction = "shu";
  ally.hand[0].name = "sha";
  const shaId = ally.hand[0].id;
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "jijiang",
    targetIds: ["c"],
  });
  assert.equal(game.state.pending?.kind, "jijiang");
  assert.equal(
    ally.hand.some((card) => card.id === shaId),
    true,
  );
  game.dispatch({ type: "respond", playerId: "b", cardId: shaId });
  assert.equal(game.state.pending?.kind, "shan");
  assert.equal(
    ally.hand.some((card) => card.id === shaId),
    false,
  );
});

test("rende heals exactly when the second hand card is given in a turn", () => {
  const game = HeadlessGame.create({
    seed: 8101,
    players: ["a", "b"].map((id) => ({ id, name: id })),
  });
  const source = game.state.players[0];
  source.general.skills = ["rende"];
  source.hp = source.maxHp - 1;
  const [first, second] = source.hand;
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "rende",
    cardIds: [first.id],
    targetIds: ["b"],
  });
  assert.equal(source.hp, source.maxHp - 1);
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "rende",
    cardIds: [second.id],
    targetIds: ["b"],
  });
  assert.equal(source.hp, source.maxHp);
  assert.equal(source.marks.rende, 2);
});

test("kongcheng and qianxun reject their prohibited card targets", () => {
  const kongcheng = HeadlessGame.create({
    seed: 8102,
    players: ["a", "b"].map((id) => ({ id, name: id })),
  });
  kongcheng.state.players[1].general.skills = ["kongcheng"];
  kongcheng.state.players[1].hand.length = 0;
  const sha = kongcheng.state.players[0].hand[0];
  sha.name = "sha";
  assert.throws(() =>
    kongcheng.dispatch({
      type: "useCard",
      playerId: "a",
      cardId: sha.id,
      targetId: "b",
    }),
  );

  const qianxun = HeadlessGame.create({
    seed: 8103,
    players: ["a", "b"].map((id) => ({ id, name: id })),
  });
  qianxun.state.players[1].general.skills = ["qianxun"];
  const lebu = qianxun.state.players[0].hand[0];
  lebu.name = "lebu";
  assert.throws(() =>
    qianxun.dispatch({
      type: "useCard",
      playerId: "a",
      cardId: lebu.id,
      targetId: "b",
    }),
  );
});

test("longdan converts shan to sha and sha to shan", () => {
  const attack = HeadlessGame.create({
    seed: 8104,
    players: ["a", "b"].map((id) => ({ id, name: id })),
  });
  attack.state.players[0].general.skills = ["longdan"];
  const shan = attack.state.players[0].hand[0];
  shan.name = "shan";
  attack.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "longdan",
    cardIds: [shan.id],
    targetIds: ["b"],
  });
  assert.equal(attack.state.pending?.kind, "shan");

  const defense = HeadlessGame.create({
    seed: 8105,
    players: ["a", "b"].map((id) => ({ id, name: id })),
  });
  defense.state.players[1].general.skills = ["longdan"];
  const incoming = defense.state.players[0].hand[0];
  incoming.name = "sha";
  const response = defense.state.players[1].hand[0];
  response.name = "sha";
  defense.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: incoming.id,
    targetId: "b",
  });
  defense.dispatch({ type: "respond", playerId: "b", cardId: response.id });
  assert.equal(defense.state.pending, undefined);
});

test("qicai removes shunshou distance and jiuyuan adds one recovery", () => {
  const qicai = HeadlessGame.create({
    seed: 8106,
    players: ["a", "b", "c", "d"].map((id) => ({ id, name: id })),
  });
  qicai.state.players[0].general.skills = ["qicai"];
  const shunshou = qicai.state.players[0].hand[0];
  shunshou.name = "shunshou";
  qicai.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: shunshou.id,
    targetId: "c",
  });
  passWuxie(qicai);
  assert.equal(qicai.state.pending?.kind, "otherCard");

  const jiuyuan = HeadlessGame.create({
    seed: 8107,
    players: ["a", "b"].map((id) => ({ id, name: id })),
  });
  const lord = jiuyuan.state.players[0];
  const rescuer = jiuyuan.state.players[1];
  lord.general.skills = ["jiuyuan"];
  lord.hp = 1;
  rescuer.general.faction = "wu";
  const attackCard = rescuer.hand[0];
  attackCard.name = "sha";
  const tao = rescuer.hand[1];
  tao.name = "tao";
  jiuyuan.state.currentPlayerId = "b";
  jiuyuan.state.phase = "play";
  jiuyuan.dispatch({
    type: "useCard",
    playerId: "b",
    cardId: attackCard.id,
    targetId: "a",
  });
  jiuyuan.dispatch({ type: "respond", playerId: "a" });
  assert.equal(jiuyuan.state.pending?.kind, "dying");
  if (jiuyuan.state.pending?.kind === "dying" && jiuyuan.state.pending.playerId === "a")
    jiuyuan.dispatch({ type: "respond", playerId: "a" });
  jiuyuan.dispatch({ type: "respond", playerId: "b", cardId: tao.id });
  assert.equal(lord.hp, 2);
});

test("kurou is repeatable and qingnang requires a wounded target", () => {
  const game = HeadlessGame.create({
    seed: 8108,
    players: ["a", "b"].map((id) => ({ id, name: id })),
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.general.skills = ["kurou", "qingnang"];
  const before = source.hand.length;
  game.dispatch({ type: "activateSkill", playerId: "a", skillId: "kurou" });
  assert.equal(source.hand.length, before + 2);
  assert.throws(() =>
    game.dispatch({
      type: "activateSkill",
      playerId: "a",
      skillId: "qingnang",
      cardIds: [source.hand[0].id],
      targetIds: ["b"],
    }),
  );
  const restoredSource = game.state.players[0];
  const restoredTarget = game.state.players[1];
  restoredTarget.hp--;
  const cost = restoredSource.hand[0];
  game.dispatch({
    type: "activateSkill",
    playerId: "a",
    skillId: "qingnang",
    cardIds: [cost.id],
    targetIds: ["b"],
  });
  assert.equal(restoredTarget.hp, restoredTarget.maxHp);
});

test("a rejected command atomically restores state and random source", () => {
  const game = HeadlessGame.create({
    seed: 8109,
    players: ["a", "b"].map((id) => ({ id, name: id })),
  });
  game.state.players[0].general.skills = ["qingnang"];
  const before = game.snapshot();
  assert.throws(() =>
    game.dispatch({
      type: "activateSkill",
      playerId: "a",
      skillId: "qingnang",
      cardIds: [game.state.players[0].hand[0].id],
      targetIds: ["b"],
    }),
  );
  assert.equal(game.snapshot(), before);
});

test("taoyuan wuxie only negates recovery for the current target", () => {
  const game = HeadlessGame.create({
    seed: 8201,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  for (const player of game.state.players) {
    player.general.skills = [];
    player.hp = player.maxHp - 1;
  }
  const taoyuan = game.state.players[0].hand[0];
  taoyuan.name = "taoyuan";
  const wuxie = game.state.players[1].hand[0];
  wuxie.name = "wuxie";
  const before = game.state.players.map((player) => player.hp);
  game.dispatch({ type: "useCard", playerId: "a", cardId: taoyuan.id });
  game.dispatch({ type: "respond", playerId: "a" });
  game.dispatch({ type: "respond", playerId: "b", cardId: wuxie.id });
  passWuxie(game);
  assert.deepEqual(
    game.state.players.map((player) => player.hp),
    [before[0], before[1] + 1, before[2] + 1],
  );
});

test("wugu wuxie skips one target without consuming the revealed pool", () => {
  const game = HeadlessGame.create({
    seed: 8202,
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  for (const player of game.state.players) player.general.skills = [];
  const wugu = game.state.players[0].hand[0];
  wugu.name = "wugu";
  const wuxie = game.state.players[1].hand[0];
  wuxie.name = "wuxie";
  const aHandAfterUse = game.state.players[0].hand.length - 1;
  game.dispatch({ type: "useCard", playerId: "a", cardId: wugu.id });
  game.dispatch({ type: "respond", playerId: "a" });
  game.dispatch({ type: "respond", playerId: "b", cardId: wuxie.id });
  passWuxie(game);
  assert.equal(game.state.players[0].hand.length, aHandAfterUse);
  assert.equal(game.state.pending?.kind, "wugu");
  assert.equal(game.state.pending?.playerId, "b");
  assert.equal(game.state.pending?.cards.length, 3);
  if (game.state.pending?.kind !== "wugu") throw new Error("expected wugu");
  game.dispatch({
    type: "chooseCard",
    playerId: "b",
    cardId: game.state.pending.cards[0].id,
  });
  if (game.state.pending?.kind !== "wugu") throw new Error("expected wugu");
  game.dispatch({
    type: "chooseCard",
    playerId: "c",
    cardId: game.state.pending.cards[0].id,
  });
  assert.equal(game.state.pending, undefined);
  assert.equal(game.state.players[1].hand.length >= 4, true);
  assert.equal(game.state.players[2].hand.length, 5);
});

test("qinggang makes a black sha ignore renwang armor", () => {
  const game = HeadlessGame.create({
    seed: 8203,
    players: ["a", "b"].map((id) => ({ id, name: id })),
  });
  const source = game.state.players[0];
  const target = game.state.players[1];
  source.general.skills = [];
  target.general.skills = [];
  source.equipment.weapon = {
    id: "test-qinggang",
    name: "qinggang",
    displayName: "青釭剑",
    suit: "spade",
    rank: 6,
    type: "equipment",
    subtype: "weapon",
    range: 2,
  };
  target.equipment.armor = {
    id: "test-renwang",
    name: "renwang",
    displayName: "仁王盾",
    suit: "club",
    rank: 2,
    type: "equipment",
    subtype: "armor",
  };
  const sha = source.hand[0];
  sha.name = "sha";
  sha.suit = "spade";
  game.dispatch({
    type: "useCard",
    playerId: "a",
    cardId: sha.id,
    targetId: "b",
  });
  assert.equal(game.state.pending?.kind, "shan");
});
