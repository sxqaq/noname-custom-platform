import assert from "node:assert/strict";
import test from "node:test";
import { RoomError, RoomStore } from "../src/room-store.js";

test("两个会话可以创建、加入、准备并开始房间", () => {
  const store = new RoomStore();
  const created = store.create("host-session", { name: "测试房", playerName: "甲", maxPlayers: 8 });
  assert.equal(created.players.length, 1);
  store.join("guest-session", created.id, "乙");
  const ready = store.ready("guest-session", true);
  assert.equal(ready.players[1].status, "ready");
  const started = store.start("host-session");
  assert.equal(started.state, "playing");
  assert.ok(started.players.every((player) => player.status === "playing"));
});

test("私密房间不暴露密码并拒绝错误密码", () => {
  const store = new RoomStore();
  const created = store.create("host-session", { name: "私密房", playerName: "甲", maxPlayers: 2, password: "secret" });
  assert.equal("password" in created, false);
  assert.equal("password" in store.list()[0], false);
  assert.throws(() => store.join("guest-session", created.id, "乙", "wrong"), (error) => error instanceof RoomError && error.code === "BAD_PASSWORD");
});

test("房主离开后自动转移房主", () => {
  const store = new RoomStore();
  const created = store.create("host-session", { name: "测试房", playerName: "甲", maxPlayers: 8 });
  store.join("guest-session", created.id, "乙");
  const left = store.leave("host-session");
  assert.equal(left.state?.players[0].isHost, true);
  assert.equal(left.state?.players[0].seat, 1);
});

test("断线保留座位并能恢复原玩家身份", () => {
  const store = new RoomStore();
  const created = store.create("stable-token", { name: "重连房", playerName: "甲", maxPlayers: 8 });
  const playerId = created.players[0].id;
  store.disconnect("stable-token");
  assert.equal(store.state(created.id).players[0].status, "offline");
  store.reconnect("stable-token");
  assert.equal(store.playerIdFor("stable-token"), playerId);
  assert.equal(store.state(created.id).players[0].status, "not_ready");
});

test("长期全员离线房间会被清理", () => {
  const store = new RoomStore(); const created = store.create("token", { name: "临时房", playerName: "甲", maxPlayers: 2 }); store.disconnect("token"); const removed = store.cleanupIdle(Date.now() + 31 * 60_000); assert.deepEqual(removed, [created.id]); assert.equal(store.list().length, 0);
});
