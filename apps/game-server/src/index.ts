import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "@sgs/protocol";
import { RoomError, RoomStore } from "./room-store.js";
import { PackageError, PackageRegistry } from "./package-registry.js";
import { GameManager } from "./game-manager.js";

const port = Number(process.env.PORT ?? 3001);
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
const rooms = new RoomStore();
const registry = new PackageRegistry(
  resolve(process.env.DATA_DIR ?? "data", "packages.json"),
);
const games = new GameManager();
app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    service: "game-server",
    engine: "headless-authoritative",
  }),
);
app.get("/api/packages", (_req, res) => res.json(registry.list()));
app.get("/api/share/:shareId", (req, res) => {
  try {
    res.json(registry.byShareId(req.params.shareId));
  } catch (error) {
    res
      .status(404)
      .json({ error: error instanceof Error ? error.message : "扩展不存在" });
  }
});
app.get("/api/replays", (_req, res) => res.json(games.listReplays()));
const webDist = process.env.WEB_DIST
  ? resolve(process.env.WEB_DIST)
  : fileURLToPath(new URL("../../web/dist/", import.meta.url));
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.use((req, res, next) =>
    req.method === "GET" && req.accepts("html")
      ? res.sendFile(resolve(webDist, "index.html"))
      : next(),
  );
}
const server = app.listen(port, () =>
  console.log(`game-server listening on http://localhost:${port}`),
);
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Map<string, WebSocket>();
const names = new Map<string, string>();
setInterval(() => {
  if (rooms.cleanupIdle().length) broadcastLobby();
}, 60_000).unref();
setInterval(() => {
  for (const summary of rooms.list()) {
    if (summary.state !== "playing") continue;
    const room = rooms.state(summary.id);
    try {
      if (games.automationDue(room) && games.automate(room.id))
        broadcastRoom(room.id);
    } catch (error) {
      console.error("automation failed", error);
    }
  }
}, 1_000).unref();
function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify(message));
}
function broadcastLobby() {
  const message: ServerMessage = {
    type: "rooms.snapshot",
    payload: rooms.list(),
  };
  clients.forEach((socket) => send(socket, message));
}
function broadcastPackages() {
  const message: ServerMessage = {
    type: "packages.snapshot",
    payload: registry.list(),
  };
  clients.forEach((socket) => send(socket, message));
}
function broadcastReplays() {
  const message: ServerMessage = {
    type: "replays.snapshot",
    payload: games.listReplays(),
  };
  clients.forEach((socket) => send(socket, message));
}
function pushRoom(token: string) {
  const socket = clients.get(token);
  const roomId = rooms.roomIdFor(token);
  const playerId = rooms.playerIdFor(token);
  if (!socket || !roomId || !playerId) return;
  send(socket, {
    type: "room.snapshot",
    payload: { room: rooms.state(roomId), selfPlayerId: playerId },
  });
  if (rooms.state(roomId).state === "playing")
    send(socket, {
      type: "game.snapshot",
      payload: games.view(roomId, playerId),
    });
}
function broadcastRoom(roomId: string) {
  clients.forEach((_socket, token) => {
    if (rooms.roomIdFor(token) === roomId) pushRoom(token);
  });
}

wss.on("connection", (socket, request) => {
  const url = new URL(
    request.url ?? "/ws",
    `http://${request.headers.host ?? "localhost"}`,
  );
  const supplied = url.searchParams.get("token");
  const token =
    supplied && /^[a-f0-9-]{20,}$/i.test(supplied) ? supplied : randomUUID();
  const resumed = Boolean(
    supplied && (rooms.roomIdFor(token) || names.has(token)),
  );
  clients.get(token)?.close();
  clients.set(token, socket);
  rooms.reconnect(token);
  send(socket, {
    type: "session.welcome",
    payload: { sessionToken: token, name: names.get(token), resumed },
  });
  send(socket, { type: "rooms.snapshot", payload: rooms.list() });
  send(socket, { type: "packages.snapshot", payload: registry.list() });
  send(socket, { type: "replays.snapshot", payload: games.listReplays() });
  pushRoom(token);
  const roomIdOnConnect = rooms.roomIdFor(token);
  if (roomIdOnConnect) broadcastRoom(roomIdOnConnect);

  socket.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send(socket, {
        type: "error",
        payload: { code: "BAD_MESSAGE", message: "消息不是合法 JSON" },
      });
      return;
    }
    try {
      let roomId: string | undefined;
      switch (message.type) {
        case "session.login":
          names.set(token, message.payload.name.trim().slice(0, 20) || "游客");
          break;
        case "room.create": {
          const selected = registry.resolve(message.payload.packages);
          roomId = rooms.create(token, {
            ...message.payload,
            playerName: names.get(token) ?? message.payload.playerName,
            contentLock: selected.locks,
          }).id;
          break;
        }
        case "room.join":
          roomId = rooms.join(
            token,
            message.payload.roomId,
            names.get(token) ?? message.payload.playerName,
            message.payload.password,
          ).id;
          break;
        case "room.ready":
          roomId = rooms.ready(token, message.payload.ready).id;
          break;
        case "room.start": {
          const room = rooms.start(token);
          roomId = room.id;
          games.start(room, registry.packagesFor(room.contentLock));
          break;
        }
        case "room.leave": {
          const result = rooms.leave(token);
          roomId = result.roomId;
          break;
        }
        case "game.action": {
          roomId = rooms.roomIdFor(token);
          const playerId = rooms.playerIdFor(token);
          if (!roomId || !playerId)
            throw new RoomError("NOT_IN_ROOM", "尚未加入对局");
          games.action(roomId, playerId, message.payload);
          break;
        }
        case "package.publish":
          registry.publish(message.payload);
          broadcastPackages();
          break;
        case "package.test":
          send(socket, {
            type: "package.test-result",
            payload: registry.test(message.payload),
          });
          break;
        case "replay.open":
          send(socket, {
            type: "replay.snapshot",
            payload: games.replay(message.payload.id, message.payload.step),
          });
          break;
      }
      send(socket, { type: "ack", requestId: message.requestId });
      if (roomId && rooms.roomIdFor(token)) broadcastRoom(roomId);
      broadcastLobby();
      broadcastReplays();
    } catch (error) {
      const known = error instanceof RoomError || error instanceof PackageError;
      send(socket, {
        type: "error",
        requestId: message.requestId,
        payload: {
          code: known ? (error as RoomError).code : "RULE_ERROR",
          message: error instanceof Error ? error.message : "服务器处理失败",
        },
      });
    }
  });
  socket.on("close", () => {
    if (clients.get(token) !== socket) return;
    clients.delete(token);
    const roomId = rooms.roomIdFor(token);
    rooms.disconnect(token);
    if (roomId) broadcastRoom(roomId);
    broadcastLobby();
  });
});
