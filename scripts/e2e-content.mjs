import assert from "node:assert/strict";
import WebSocket from "ws";
class Peer {
  constructor() {
    this.queue = [];
    this.waiters = [];
    this.ws = new WebSocket("ws://localhost:3001/ws");
    this.ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      const index = this.waiters.findIndex(
        (item) => item.type === message.type && item.predicate(message),
      );
      if (index >= 0) this.waiters.splice(index, 1)[0].resolve(message);
      else this.queue.push(message);
    });
  }
  wait(type, predicate = () => true) {
    const index = this.queue.findIndex(
      (item) => item.type === type && predicate(item),
    );
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`等待 ${type} 超时`)),
        5000,
      );
      this.waiters.push({
        type,
        predicate,
        resolve: (message) => {
          clearTimeout(timeout);
          resolve(message);
        },
      });
    });
  }
  send(type, payload) {
    this.ws.send(
      JSON.stringify({ type, requestId: crypto.randomUUID(), payload }),
    );
  }
}
const pack = {
  schemaVersion: 2,
  id: "custom.e2e",
  name: "端到端创作包",
  version: "1.0.0",
  generals: [
    {
      id: "custom_e2e_general",
      name: "创作武将",
      faction: "qun",
      hp: 4,
      skills: ["custom_e2e_skill", "custom_e2e_active"],
    },
  ],
  skills: [
    {
      id: "custom_e2e_skill",
      name: "整备",
      event: "turnStart",
      effects: [{ id: "n1", type: "draw", target: "self", count: 1 }],
    },
    {
      id: "custom_e2e_active",
      name: "调度",
      kind: "active",
      usage: "oncePerTurn",
      selections: [
        {
          id: "custom_e2e_cost",
          prompt: "弃置一张手牌",
          kind: "card",
          min: 1,
          max: 1,
          cardZone: "hand",
          consume: "discard",
        },
        {
          id: "custom_e2e_target",
          prompt: "选择一名其他角色",
          kind: "target",
          min: 1,
          max: 1,
          targetFilter: "other",
        },
      ],
      effects: [
        { id: "a1", type: "draw", target: "self", count: 2 },
        { id: "a2", type: "damage", target: "selected", amount: 1 },
      ],
    },
  ],
  cards: [
    {
      id: "custom_e2e_card",
      name: "补给",
      type: "trick",
      target: "self",
      effects: [{ id: "c1", type: "draw", target: "self", count: 2 }],
    },
  ],
  decks: [
    {
      id: "custom_e2e_deck",
      name: "创作牌堆",
      cards: [{ cardId: "custom_e2e_card", count: 24 }],
    },
  ],
  modes: [
    {
      id: "custom_e2e_mode",
      name: "创作模式",
      minPlayers: 2,
      maxPlayers: 8,
      initialHand: 3,
      drawPerTurn: 1,
      winCondition: "lastAlive",
      deckId: "custom_e2e_deck",
    },
  ],
  tests: [
    {
      id: "smoke",
      name: "冒烟",
      seed: 9,
      players: 2,
      expect: {
        noError: true,
        firstGeneral: "custom_e2e_general",
        firstHandAtLeast: 5,
      },
    },
  ],
};
const host = new Peer();
await host.wait("session.welcome");
await host.wait("packages.snapshot");
const { adminToken } = await fetch(
  "http://localhost:3001/api/admin/token",
).then((response) => response.json());
host.send("package.test", pack);
const tests = await host.wait("package.test-result");
assert.equal(tests.payload.failed, 0);
host.send("package.publish", { package: pack, adminToken });
const library = await host.wait("packages.snapshot", (message) =>
  message.payload.some((item) => item.content.id === pack.id),
);
const published = library.payload.find((item) => item.content.id === pack.id);
const shared = await fetch(
  `http://localhost:3001/api/share/${published.shareId}`,
).then((response) => response.json());
assert.equal(shared.hash, published.hash);
host.send("room.create", {
  name: "创作内容测试",
  playerName: "甲",
  maxPlayers: 2,
  packages: [{ id: pack.id, version: pack.version }],
  modeId: "custom_e2e_mode",
});
const hostRoom = await host.wait("room.snapshot");
const guest = new Peer();
await guest.wait("session.welcome");
await guest.wait("packages.snapshot");
guest.send("room.join", { roomId: hostRoom.payload.room.id, playerName: "乙" });
const guestRoom = await guest.wait("room.snapshot");
guest.send("room.ready", { ready: true });
await guest.wait("room.snapshot");
host.send("room.start", {});
let hostView = (await host.wait("game.snapshot")).payload;
let guestView = (await guest.wait("game.snapshot")).payload;
for (let selected = 0; selected < 2; selected += 1) {
  const chooserView =
    hostView.pending?.kind === "selectGeneral" ? hostView : guestView;
  const chooser = chooserView === hostView ? host : guest;
  assert.equal(chooserView.pending?.kind, "selectGeneral");
  const choice =
    chooserView.pending.choices.find(
      (general) => general.id === "custom_e2e_general",
    ) ?? chooserView.pending.choices[0];
  chooser.send("game.action", {
    action: "chooseGeneral",
    generalId: choice.id,
  });
  [hostView, guestView] = await Promise.all([
    host.wait("game.snapshot").then((message) => message.payload),
    guest.wait("game.snapshot").then((message) => message.payload),
  ]);
}
const customPlayer = hostView.players.find(
  (player) => player.general.id === "custom_e2e_general",
);
assert.ok(customPlayer);
const ownerView =
  customPlayer.id === hostRoom.payload.selfPlayerId ? hostView : guestView;
const ownedCustomPlayer = ownerView.players.find(
  (player) => player.id === customPlayer.id,
);
assert.ok(
  ownedCustomPlayer.hand.every((card) => card.name === "custom_e2e_card"),
);
const hostId = hostRoom.payload.selfPlayerId;
const guestId = guestRoom.payload.selfPlayerId;
const peerFor = (playerId) => (playerId === hostId ? host : guest);
const waitBoth = async () => {
  [hostView, guestView] = await Promise.all([
    host.wait("game.snapshot").then((message) => message.payload),
    guest.wait("game.snapshot").then((message) => message.payload),
  ]);
};
for (let guard = 0; guard < 30; guard += 1) {
  if (hostView.currentPlayerId === customPlayer.id && !hostView.pending) break;
  const actionable = hostView.pending
    ? hostView
    : guestView.pending
      ? guestView
      : undefined;
  if (actionable?.pending) {
    const pending = actionable.pending;
    const peer = peerFor(pending.playerId);
    if (pending.kind === "guanxing")
      peer.send("game.action", {
        action: "arrangeCards",
        topIds: pending.cards.map((card) => card.id),
        bottomIds: [],
      });
    else if (pending.kind === "tuxi")
      peer.send("game.action", {
        action: "activateSkill",
        skillId: "tuxi",
        targetIds: [],
      });
    else peer.send("game.action", { action: "respond" });
  } else
    peerFor(hostView.currentPlayerId).send("game.action", {
      action: "endTurn",
    });
  await waitBoth();
}
assert.equal(hostView.currentPlayerId, customPlayer.id);
assert.equal(hostView.pending, undefined);
const ownerPeer = peerFor(customPlayer.id);
const target = hostView.players.find((player) => player.id !== customPlayer.id);
const beforeActive = (
  customPlayer.id === hostId ? hostView : guestView
).players.find((player) => player.id === customPlayer.id);
assert.ok(beforeActive.hand?.length);
const handBeforeActive = beforeActive.hand.length;
const hpBeforeActive = target.hp;
ownerPeer.send("game.action", {
  action: "activateSkill",
  skillId: "custom_e2e_active",
});
await waitBoth();
let activeOwnerView = customPlayer.id === hostId ? hostView : guestView;
assert.equal(activeOwnerView.pending?.kind, "customSkill");
ownerPeer.send("game.action", {
  action: "activateSkill",
  skillId: "custom_e2e_active",
  cardIds: [
    activeOwnerView.players.find((player) => player.id === customPlayer.id)
      .hand[0].id,
  ],
});
await waitBoth();
activeOwnerView = customPlayer.id === hostId ? hostView : guestView;
assert.equal(activeOwnerView.pending?.kind, "customSkill");
ownerPeer.send("game.action", {
  action: "activateSkill",
  skillId: "custom_e2e_active",
  targetIds: [target.id],
});
await waitBoth();
activeOwnerView = customPlayer.id === hostId ? hostView : guestView;
assert.equal(
  activeOwnerView.players.find((player) => player.id === customPlayer.id).hand
    .length,
  handBeforeActive + 1,
);
assert.equal(
  hostView.players.find((player) => player.id === target.id).hp,
  hpBeforeActive - 1,
);
host.ws.close();
guest.ws.close();
console.log(
  JSON.stringify({
    ok: true,
    tests: tests.payload.passed,
    shareId: published.shareId,
    customMode: true,
    customDeck: true,
    generalSelection: true,
    multiStepActiveSkill: true,
  }),
);
