import assert from "node:assert/strict";
import test from "node:test";
import { evaluateIsolatedMod } from "../../noname-adapter/src/index.js";
import {
  compilePlugin,
  condition,
  definePackage,
  definePlugin,
  defineRuntime,
  defineNonameSkillRuntime,
  defineSkill,
  effect,
  modifier,
  ruleValue,
} from "../src/index.js";

test("SDK only produces declarative content", () => {
  const skill = defineSkill({
    id: "custom.draw",
    name: "整备",
    event: "turnStart",
    effects: [effect.draw(2)],
  });
  const pack = definePackage({
    id: "custom.sdk",
    name: "SDK包",
    version: "1.0.0",
    generals: [],
    skills: [skill],
    cards: [],
    decks: [],
    modes: [],
    tests: [],
  });
  assert.equal(pack.schemaVersion, 4);
  assert.deepEqual(pack.assets, []);
  assert.equal(pack.skills[0].effects[0].type, "draw");
});

test("advanced runtime hooks compile to a pinned self-contained manifest", () => {
  const runtime = defineRuntime<{ calls: number }>(
    (input) => ({
      state: { calls: (input.state?.calls ?? 0) + 1 },
      effects: [
        {
          type: "addMark",
          target: input.context.selectedPlayerId ? "selected" : "self",
          mark: "sdk_calls",
          count: 1,
        },
      ],
    }),
    { permissions: ["game-state", "deterministic-random"] },
  );
  const plugin = compilePlugin(
    definePlugin({
      engineApi: "rules-ir/v2",
      capabilities: ["rules", "advanced-runtime"],
      content: definePackage({
        id: "custom.advanced",
        name: "高级运行时",
        version: "1.0.0",
        generals: [],
        skills: [],
        cards: [],
        decks: [],
        modes: [],
        tests: [],
        runtime,
      }),
    }),
  );
  assert.equal(plugin.content.runtime?.apiVersion, "noname-compat/v1");
  assert.match(plugin.content.runtime?.source ?? "", /sdk_calls/);
  assert.doesNotMatch(
    JSON.stringify(plugin),
    /"runtime"\s*:\s*\{[^}]*function/,
  );
});

test("SDK v2 builds condition and state flow without executable functions", () => {
  const skill = defineSkill({
    id: "custom.flow",
    name: "蓄势",
    kind: "active",
    when: condition.wounded(),
    modifiers: [modifier("handLimit", 1, condition.wounded())],
    effects: [
      effect.setState("charge", 1),
      effect.when(
        condition.compare(
          ruleValue.state("charge"),
          "gte",
          ruleValue.number(1),
        ),
        [effect.repeat(2, [effect.draw(1)])],
      ),
    ],
  });
  const plugin = compilePlugin(
    definePlugin({
      engineApi: "rules-ir/v2",
      capabilities: ["rules"],
      content: definePackage({
        id: "custom.flow_pack",
        name: "流程包",
        version: "1.0.0",
        generals: [],
        skills: [skill],
        cards: [],
        decks: [],
        modes: [],
        tests: [],
      }),
    }),
  );
  assert.equal(plugin.engineApi, "rules-ir/v2");
  assert.equal(plugin.content.skills[0].effects[1].type, "if");
  assert.doesNotMatch(JSON.stringify(plugin), /function/);
});

test("SDK addresses exact runtime players and removes marks declaratively", () => {
  const remove = effect.forPlayer("player-b", effect.removeMark("charge", 2));
  const move = effect.moveCards({
    count: 1,
    fromPlayerId: "player-b",
    fromZone: "hand",
    toPlayerId: "player-c",
    toZone: "hand",
  });

  assert.equal(remove.targetPlayerId, "player-b");
  assert.equal(remove.type, "removeMark");
  assert.equal(move.targetPlayerId, "player-b");
  assert.equal(move.toPlayerId, "player-c");
});

test("SDK types authoritative draw-rule event patches", () => {
  const runtime = defineRuntime((input) => {
    if (
      input.hook === "ruleEvent" &&
      input.context.ruleEvent?.name === "phaseDrawBegin2"
    ) {
      return {
        ruleEvent: {
          data: { num: Number(input.context.ruleEvent.data.num ?? 2) + 1 },
        },
      };
    }
    return {};
  });

  assert.match(runtime.source, /phaseDrawBegin2/);
  assert.match(runtime.source, /ruleEvent/);
});

test("SDK exposes the authoritative damage event chain", () => {
  const runtime = defineRuntime((input) => {
    if (
      input.hook === "ruleEvent" &&
      input.context.ruleEvent?.name === "damageBegin3"
    ) {
      return {
        ruleEvent: {
          data: { num: Number(input.context.ruleEvent.data.num ?? 1) + 1 },
        },
      };
    }
    return {};
  });

  assert.match(runtime.source, /damageBegin3/);
});

test("SDK exposes typed use-card retargeting and view-as patches", () => {
  const runtime = defineRuntime((input) => {
    const event = input.context.ruleEvent;
    if (input.hook === "ruleEvent" && event?.name === "useCard2") {
      return {
        ruleEvent: {
          data: {
            cardName:
              event.data.cardName === "tao" ? "sha" : event.data.cardName,
            targetIds: event.data.targetIds.filter(
              (playerId) => playerId !== event.data.sourceId,
            ),
          },
        },
      };
    }
    return {};
  });

  assert.match(runtime.source, /useCard2/);
  assert.match(runtime.source, /targetIds/);
});

test("SDK types per-target directHit and excluded collections", () => {
  const runtime = defineRuntime((input) => {
    const event = input.context.ruleEvent;
    if (
      input.hook === "ruleEvent" &&
      event?.name === "useCardToTarget" &&
      event.data.targetId
    ) {
      return {
        ruleEvent: {
          data: {
            directHitTargetIds: [event.data.targetId],
            excludedTargetIds: event.data.excludedTargetIds,
          },
        },
      };
    }
    return {};
  });

  assert.match(runtime.source, /useCardToTarget/);
  assert.match(runtime.source, /directHitTargetIds/);
});

test("Noname-style trigger skills execute in isolation and emit authoritative patches", async () => {
  const runtime = defineNonameSkillRuntime([
    {
      id: "custom.unavoidable",
      trigger: { source: "useCardToTarget" },
      filter(event, player) {
        return event.card?.name === "sha" && player.isIn();
      },
      content(_event, trigger, player) {
        if (trigger.target) trigger.directHit.add(trigger.target);
        player.draw(1);
      },
    },
  ]);
  const output = await evaluateIsolatedMod<{
    effects: Array<Record<string, unknown>>;
    ruleEvent: { data: Record<string, unknown> };
  }>({
    source: runtime.source,
    seed: "noname-skill-runtime",
    input: {
      hook: "ruleEvent",
      state: undefined,
      context: {
        ruleEvent: {
          id: "rule-1",
          name: "useCardToTarget",
          playerId: "a",
          data: {
            cardId: "sha-1",
            cardName: "sha",
            sourceId: "a",
            targetId: "b",
            targetIds: ["b"],
            directHitTargetIds: [],
            excludedTargetIds: [],
          },
        },
      },
      game: {
        players: [
          {
            id: "a",
            name: "Author",
            hp: 4,
            maxHp: 4,
            alive: true,
            hand: [],
            equipment: {},
            judgment: [],
            marks: {},
            grantedSkills: {},
            general: {
              faction: "qun",
              gender: "male",
              skills: ["custom.unavoidable"],
            },
          },
          {
            id: "b",
            name: "Target",
            hp: 4,
            maxHp: 4,
            alive: true,
            hand: [],
            equipment: {},
            judgment: [],
            marks: {},
            grantedSkills: {},
            general: { faction: "wei", gender: "male", skills: [] },
          },
        ],
      },
    },
  });

  assert.deepEqual(output.ruleEvent.data.directHitTargetIds, ["b"]);
  assert.deepEqual(output.effects, [
    {
      type: "draw",
      count: 1,
      target: "selected",
      targetPlayerId: "a",
    },
  ]);
});

test("Noname-style async choices suspend and deterministically resume", async () => {
  const runtime = defineNonameSkillRuntime([
    {
      id: "custom.choose_excluded",
      trigger: { source: "useCard" },
      async content(_event, trigger, player) {
        const result = await player
          .chooseTarget({
            prompt: "Choose an excluded target",
            filterTarget(
              _card: unknown,
              owner: { id: string },
              target: { id: string },
            ) {
              return owner.id !== target.id;
            },
          })
          .forResult();
        if (result.targets?.[0]) trigger.excluded.add(result.targets[0]);
      },
    },
  ]);
  const players = [
    {
      id: "a",
      name: "Author",
      hp: 4,
      maxHp: 4,
      alive: true,
      hand: [],
      equipment: {},
      judgment: [],
      marks: {},
      grantedSkills: {},
      general: { skills: ["custom.choose_excluded"] },
    },
    {
      id: "b",
      name: "Target",
      hp: 4,
      maxHp: 4,
      alive: true,
      hand: [],
      equipment: {},
      judgment: [],
      marks: {},
      grantedSkills: {},
      general: { skills: [] },
    },
  ];
  const ruleEvent = {
    id: "rule-choice",
    name: "useCard",
    playerId: "a",
    data: {
      cardId: "sha-1",
      cardName: "sha",
      sourceId: "a",
      targetIds: ["b"],
      directHitTargetIds: [],
      excludedTargetIds: [],
    },
  };
  const suspended = await evaluateIsolatedMod<{
    state: Record<string, unknown>;
    request: {
      playerId: string;
      selection: { allowedTargetIds: string[] };
    };
  }>({
    source: runtime.source,
    seed: "async-choice-seed",
    input: {
      hook: "ruleEvent",
      state: undefined,
      context: { ruleEvent },
      game: { players },
    },
  });
  assert.equal(suspended.request.playerId, "a");
  assert.deepEqual(suspended.request.selection.allowedTargetIds, ["b"]);

  const completed = await evaluateIsolatedMod<{
    ruleEvent: { data: { excludedTargetIds: string[] } };
  }>({
    source: runtime.source,
    seed: "async-choice-seed",
    input: {
      hook: "choiceResponse",
      state: suspended.state,
      context: { choice: { targetIds: ["b"] } },
      game: { players },
    },
  });
  assert.deepEqual(completed.ruleEvent.data.excludedTargetIds, ["b"]);
});

test("Noname-style cost choices gate content like upstream skills", async () => {
  const runtime = defineNonameSkillRuntime([
    {
      id: "custom.optional_draw",
      trigger: { player: "phaseDrawBegin2" },
      async cost(event, _trigger, player) {
        event.result = await player
          .chooseBool({ prompt: "Activate optional draw?" })
          .forResult();
      },
      content(_event, trigger) {
        trigger.num = (trigger.num ?? 0) + 1;
      },
    },
  ]);
  const input = {
    hook: "ruleEvent",
    context: {
      ruleEvent: {
        id: "rule-cost",
        name: "phaseDrawBegin2",
        playerId: "a",
        data: { num: 2, numFixed: false },
      },
    },
    game: {
      players: [
        {
          id: "a",
          name: "Author",
          hp: 4,
          maxHp: 4,
          alive: true,
          hand: [],
          equipment: {},
          judgment: [],
          marks: {},
          grantedSkills: {},
          general: { skills: ["custom.optional_draw"] },
        },
      ],
    },
  };
  const suspended = await evaluateIsolatedMod<{
    state: Record<string, unknown>;
    request: { selection: { kind: string } };
  }>({ source: runtime.source, seed: "cost-seed", input });
  assert.equal(suspended.request.selection.kind, "option");

  const declined = await evaluateIsolatedMod<{
    ruleEvent: { data: { num: number } };
  }>({
    source: runtime.source,
    seed: "cost-seed",
    input: {
      ...input,
      hook: "choiceResponse",
      state: suspended.state,
      context: { choice: { optionId: "no" } },
    },
  });
  assert.equal(declined.ruleEvent.data.num, 2);
});
