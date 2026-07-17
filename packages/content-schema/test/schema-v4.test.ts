import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionPackageDto } from "@sgs/protocol";
import { validatePackage } from "../src/index.js";

const packageV4 = (): ExtensionPackageDto => ({
  schemaVersion: 4,
  id: "test.creator_pack",
  name: "创作包",
  version: "1.0.0",
  author: "测试作者",
  license: "CC-BY-4.0",
  assets: [],
  generals: [
    {
      id: "test.hero",
      name: "测试武将",
      faction: "qun",
      hp: 4,
      skills: ["test.skill"],
      cardStyle: {
        template: "classic",
        portraitX: 50,
        portraitY: 45,
        portraitScale: 1,
        accentColor: "#991b1b",
        textColor: "#fffaf0",
        showSkillText: true,
      },
    },
  ],
  skills: [
    {
      id: "test.skill",
      name: "测试技能",
      event: "turnStart",
      effects: [{ type: "draw", target: "self", count: 1 }],
    },
  ],
  cards: [],
  decks: [
    {
      id: "test.deck",
      name: "测试牌堆",
      cards: [{ cardId: "sha", count: 16 }],
    },
  ],
  modes: [
    {
      id: "test.mode",
      name: "测试模式",
      minPlayers: 2,
      maxPlayers: 8,
      initialHand: 4,
      drawPerTurn: 2,
      winCondition: "lastAlive",
      deckId: "test.deck",
    },
  ],
  tests: [],
});

test("schema v4 accepts structured general card styles", () => {
  const result = validatePackage(packageV4());
  assert.equal(
    result.ok,
    true,
    result.ok ? undefined : result.errors.join("；"),
  );
});

test("schema v4 rejects duplicate entities and unsafe card composition", () => {
  const value = packageV4();
  value.generals.push(structuredClone(value.generals[0]));
  value.generals[0].cardStyle!.portraitScale = 100;
  const result = validatePackage(value);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((item) => item.includes("武将 ID")));
  assert.ok(result.errors.some((item) => item.includes("构图参数")));
});

test("rules IR2 validates conditions, state and bounded control flow", () => {
  const value = packageV4();
  value.skills[0] = {
    ...value.skills[0],
    when: { op: "predicate", predicate: "wounded", subject: "self" },
    modifiers: [
      {
        type: "handLimit",
        amount: 2,
        when: { op: "predicate", predicate: "wounded", subject: "self" },
      },
    ],
    effects: [
      {
        type: "setState",
        target: "self",
        stateKey: "charge",
        value: 1,
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
        then: [{ type: "draw", target: "self", count: 2 }],
        else: [],
      },
    ],
  };
  assert.equal(validatePackage(value).ok, true);
  const unsafe = structuredClone(value);
  unsafe.skills[0].effects = [
    {
      type: "repeat",
      target: "self",
      times: 100,
      body: [{ type: "draw", target: "self", count: 1 }],
    },
  ];
  const result = validatePackage(unsafe);
  assert.equal(result.ok, false);
  if (!result.ok)
    assert.ok(result.errors.some((item) => item.includes("重复节点次数")));
});

test("node graphs reject cycles, broken edges and unreachable nodes", () => {
  const value = packageV4();
  value.skills[0].graph = {
    entry: "test.start",
    nodes: [
      {
        id: "test.start",
        next: "test.finish",
        type: "draw",
        target: "self",
        count: 1,
      },
      {
        id: "test.finish",
        type: "recover",
        target: "self",
        amount: 1,
      },
    ],
  };
  assert.equal(validatePackage(value).ok, true);

  value.skills[0].graph.nodes[1].next = "test.start";
  const cyclic = validatePackage(value);
  assert.equal(cyclic.ok, false);
  if (!cyclic.ok)
    assert.ok(cyclic.errors.some((item) => item.includes("循环")));

  value.skills[0].graph.nodes[1].next = "test.missing";
  const broken = validatePackage(value);
  assert.equal(broken.ok, false);
  if (!broken.ok)
    assert.ok(broken.errors.some((item) => item.includes("不存在的节点")));
});

test("schema v4 validates isolated noname-compatible runtimes", () => {
  const value = packageV4();
  value.runtime = {
    kind: "noname-compat",
    apiVersion: "noname-compat/v1",
    upstreamCommit: "632d2d3c8da2893466a8c440a18861c9ed49813d",
    source: `({ skills: { test_skill: { trigger: { player: "phaseBegin" } } } })`,
    permissions: ["game-state", "player-choice", "deterministic-random"],
    limits: { timeoutMs: 500, memoryMb: 32 },
  };
  assert.equal(validatePackage(value).ok, true);

  const unsafe = structuredClone(value);
  unsafe.runtime!.permissions.push("filesystem" as never);
  unsafe.runtime!.limits.timeoutMs = 60_000;
  const result = validatePackage(unsafe);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((item) => item.includes("filesystem")));
    assert.ok(result.errors.some((item) => item.includes("10–5000ms")));
  }
});
