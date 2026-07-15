import assert from "node:assert/strict";
import WebSocket from "ws";

class Peer {
  constructor(name, token) {
    this.name = name;
    this.messages = [];
    this.waiters = [];
    this.ws = new WebSocket(
      `ws://localhost:3001/ws${token ? `?token=${token}` : ""}`,
    );
    this.ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      const index = this.waiters.findIndex(
        (waiter) => waiter.type === message.type && waiter.predicate(message),
      );
      if (index >= 0) this.waiters.splice(index, 1)[0].resolve(message);
      else this.messages.push(message);
    });
  }
  async wait(type, predicate = () => true) {
    const index = this.messages.findIndex(
      (message) => message.type === type && predicate(message),
    );
    if (index >= 0) return this.messages.splice(index, 1)[0];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.name} 等待 ${type} 超时`)),
        5000,
      );
      this.waiters.push({
        type,
        predicate,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });
    });
  }
  send(type, payload = {}) {
    this.ws.send(
      JSON.stringify({ type, requestId: crypto.randomUUID(), payload }),
    );
  }
  close() {
    this.ws.close();
  }
}

const host = new Peer("房主");
const hostWelcome = await host.wait("session.welcome");
await host.wait("rooms.snapshot");
await host.wait("packages.snapshot");
await host.wait("replays.snapshot");
host.send("session.login", { name: "甲" });
host.send("room.create", {
  name: "端到端测试",
  playerName: "甲",
  maxPlayers: 8,
  packages: [],
});
const hostRoomMessage = await host.wait("room.snapshot");
const roomId = hostRoomMessage.payload.room.id;
const hostId = hostRoomMessage.payload.selfPlayerId;
const guest = new Peer("客人");
const guestWelcome = await guest.wait("session.welcome");
await guest.wait("rooms.snapshot");
await guest.wait("packages.snapshot");
await guest.wait("replays.snapshot");
guest.send("session.login", { name: "乙" });
guest.send("room.join", { roomId, playerName: "乙" });
const guestRoomMessage = await guest.wait("room.snapshot");
const guestId = guestRoomMessage.payload.selfPlayerId;
guest.send("room.ready", { ready: true });
await guest.wait("room.snapshot");
host.send("room.start");
let hostGame = (await host.wait("game.snapshot")).payload;
let guestGame = (await guest.wait("game.snapshot")).payload;
let replayCommandCount = 0;
for (let selected = 0; selected < 2; selected += 1) {
  const chooserView =
    hostGame.pending?.kind === "selectGeneral" ? hostGame : guestGame;
  const chooser = chooserView === hostGame ? host : guest;
  assert.equal(chooserView.pending?.kind, "selectGeneral");
  assert.ok(chooserView.pending.choices.length > 0);
  chooser.send("game.action", {
    action: "chooseGeneral",
    generalId: chooserView.pending.choices[0].id,
  });
  replayCommandCount += 1;
  [hostGame, guestGame] = await Promise.all([
    host.wait("game.snapshot").then((message) => message.payload),
    guest.wait("game.snapshot").then((message) => message.payload),
  ]);
}
for (let decisions = 0; hostGame.phase !== "play" && decisions < 8; decisions += 1) {
  const decisionView = hostGame.pending ? hostGame : guestGame;
  const decisionPeer = decisionView === hostGame ? host : guest;
  assert.ok(decisionView.pending, "非出牌阶段必须有可处理的权威决策");
  decisionPeer.send("game.action", { action: "respond" });
  replayCommandCount += 1;
  [hostGame, guestGame] = await Promise.all([
    host.wait("game.snapshot").then((message) => message.payload),
    guest.wait("game.snapshot").then((message) => message.payload),
  ]);
}
assert.equal(hostGame.phase, "play");
assert.equal(guestGame.phase, "play");
assert.equal(
  hostGame.players.find((player) => player.id === guestId).hand,
  undefined,
  "房主不能看到客人手牌",
);
assert.equal(
  guestGame.players.find((player) => player.id === hostId).hand,
  undefined,
  "客人不能看到房主手牌",
);
guest.close();
const resumed = new Peer("重连客人", guestWelcome.payload.sessionToken);
const resumedWelcome = await resumed.wait("session.welcome");
assert.equal(resumedWelcome.payload.resumed, true);
const resumedRoom = await resumed.wait("room.snapshot");
assert.equal(resumedRoom.payload.selfPlayerId, guestId);
await resumed.wait("game.snapshot");
const currentPeer = hostGame.currentPlayerId === hostId ? host : resumed;
currentPeer.send("game.action", { action: "endTurn" });
replayCommandCount += 1;
await currentPeer.wait("game.snapshot");
const replayList = await currentPeer.wait(
  "replays.snapshot",
  (message) => message.payload[0]?.commands.length === replayCommandCount,
);
const replay = replayList.payload[0];
assert.equal(replay.commands.length, replayCommandCount);
currentPeer.send("replay.open", { id: replay.id, step: replayCommandCount });
const playback = await currentPeer.wait("replay.snapshot");
assert.equal(playback.payload.step, replayCommandCount);
assert.equal(playback.payload.total, replayCommandCount);
host.close();
resumed.close();
console.log(
  JSON.stringify({
    ok: true,
    roomId,
    hostId,
    guestId,
    resumed: true,
    hiddenViews: true,
    generalSelection: true,
    replayCommands: replayCommandCount,
  }),
);
