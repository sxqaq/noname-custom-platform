import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import type { AssetKind, ClientMessage, ServerMessage } from "@sgs/protocol";
import { RoomError, RoomStore } from "./room-store.js";
import { PackageError, PackageRegistry } from "./package-registry.js";
import { GameManager } from "./game-manager.js";
import {
  resolveHostConfig,
  parseHostArgs,
  type HostRuntimeOverrides,
  type HostRuntimeOptions,
} from "./host-config.js";
import { loadOrCreateNodeIdentity } from "./node-identity.js";
import {
  advertiseLanNode,
  discoverLanNodes,
  type LanAdvertisement,
} from "./lan-discovery.js";
import { AssetError, AssetStore } from "./asset-store.js";

export interface HostRuntime {
  config: HostRuntimeOptions;
  ready: Promise<{ address: string; port: number; url: string }>;
  close(): Promise<void>;
}

export function startHostRuntime(
  overrides: HostRuntimeOverrides = {},
): HostRuntime {
  const config = resolveHostConfig(overrides);
  const identity = loadOrCreateNodeIdentity(config.dataDir);
  const adminToken = randomUUID();
  const assets = new AssetStore(resolve(config.dataDir, "assets"));
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  const rooms = new RoomStore();
  const registry = new PackageRegistry(
    resolve(config.dataDir, "packages.json"),
    (hash) => assets.hasBlob(hash),
  );
  const games = new GameManager();
  app.get("/health", (_req, res) =>
    res.json({
      ok: true,
      service: "host-runtime",
      engine: "headless-authoritative",
      nodeName: config.nodeName,
      nodeId: identity.nodeId,
    }),
  );
  app.get("/api/host", (_req, res) => {
    const address = server.address() as AddressInfo | null;
    res.json({
      protocolVersion: 1,
      nodeName: config.nodeName,
      nodeId: identity.nodeId,
      fingerprint: identity.fingerprint,
      publicKey: identity.publicKey,
      authority: "room-host",
      port: address?.port ?? config.port,
      capabilities: [
        "authoritative-rooms",
        "package-locks",
        "content-addressed-assets",
        "replays",
        "same-origin-web",
        ...(config.lanDiscovery ? ["lan-advertisement"] : []),
      ],
    });
  });
  app.get("/api/packages", (_req, res) => res.json(registry.list()));
  app.get("/api/admin/token", (req, res) => {
    if (
      !isLoopback(req.socket.remoteAddress) ||
      !isTrustedLocalHost(req.hostname)
    ) {
      res
        .status(403)
        .json({ error: "Only the local host may administer content" });
      return;
    }
    res.json({ adminToken });
  });
  app.post(
    "/api/assets/images",
    express.raw({
      type: ["image/jpeg", "image/png", "image/webp", "image/avif"],
      limit: "10mb",
    }),
    async (req, res) => {
      try {
        requireAdmin(
          req.socket.remoteAddress,
          req.header("x-admin-token"),
          adminToken,
        );
        if (!Buffer.isBuffer(req.body))
          throw new AssetError("Unsupported image media type");
        const record = await assets.storeImage(req.body, {
          originalName: decodeHeader(req.header("x-file-name")),
          kind: parseImageKind(decodeHeader(req.header("x-asset-kind"))),
          author: decodeHeader(req.header("x-asset-author")),
          license: decodeHeader(req.header("x-asset-license")),
        });
        res.status(201).json(record);
      } catch (error) {
        const forbidden = error instanceof AdminError;
        const known = forbidden || error instanceof AssetError;
        res.status(forbidden ? 403 : known ? 400 : 500).json({
          code: known ? error.code : "ASSET_STORE_ERROR",
          error: error instanceof Error ? error.message : "Asset upload failed",
        });
      }
    },
  );
  app.get("/api/assets/:hash/meta", async (req, res) => {
    try {
      res.json(await assets.readRecord(req.params.hash));
    } catch {
      res.status(404).json({ error: "Asset not found" });
    }
  });
  app.get("/api/assets/:hash", async (req, res) => {
    try {
      const blob = await assets.readBlob(req.params.hash);
      res.set({
        "Content-Type": "image/webp",
        "Content-Length": String(blob.byteLength),
        ETag: `"sha256-${req.params.hash}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      res.send(blob);
    } catch {
      res.status(404).json({ error: "Asset not found" });
    }
  });
  app.get("/api/lan/nodes", async (req, res) => {
    const requestedTimeout = Number(req.query.timeout ?? 900);
    const nodes = await discoverLanNodes(
      Number.isFinite(requestedTimeout) ? requestedTimeout : 900,
    );
    res.json(nodes.filter((node) => node.nodeId !== identity.nodeId));
  });
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
  const webDist = config.webDist;
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.use((req, res, next) =>
      req.method === "GET" && req.accepts("html")
        ? res.sendFile(resolve(webDist, "index.html"))
        : next(),
    );
  }
  const server = app.listen(config.port, config.bindAddress);
  const ready = new Promise<{ address: string; port: number; url: string }>(
    (resolveReady, reject) => {
      server.once("error", reject);
      server.once("listening", () => {
        const address = server.address() as AddressInfo;
        const printableAddress =
          config.bindAddress === "0.0.0.0" || config.bindAddress === "::"
            ? "localhost"
            : config.bindAddress;
        const url = `http://${printableAddress}:${address.port}`;
        console.log(`${config.nodeName} listening on ${url}`);
        resolveReady({
          address: config.bindAddress,
          port: address.port,
          url,
        });
      });
    },
  );
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Map<string, WebSocket>();
  const names = new Map<string, string>();
  let lanAdvertisement: LanAdvertisement | undefined;
  const lanReady = ready.then(({ port }) => {
    if (!config.lanDiscovery) return;
    lanAdvertisement = advertiseLanNode({
      nodeId: identity.nodeId,
      fingerprint: identity.fingerprint,
      name: config.nodeName,
      port,
      onError: (error) => console.warn("LAN discovery unavailable", error),
    });
  });
  const cleanupTimer = setInterval(() => {
    if (rooms.cleanupIdle().length) broadcastLobby();
  }, 60_000).unref();
  const automationTimer = setInterval(() => {
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
            names.set(
              token,
              message.payload.name.trim().slice(0, 20) || "游客",
            );
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
            requireAdmin(
              request.socket.remoteAddress,
              message.payload.adminToken,
              adminToken,
            );
            registry.publish(message.payload.package);
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
        const known =
          error instanceof RoomError ||
          error instanceof PackageError ||
          error instanceof AssetError ||
          error instanceof AdminError;
        send(socket, {
          type: "error",
          requestId: message.requestId,
          payload: {
            code: known ? error.code : "RULE_ERROR",
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

  return {
    config,
    ready,
    async close() {
      clearInterval(cleanupTimer);
      clearInterval(automationTimer);
      await lanReady;
      await lanAdvertisement?.close();
      clients.forEach((socket) => socket.terminate());
      await new Promise<void>((resolveClose) =>
        wss.close(() => resolveClose()),
      );
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
    },
  };
}

function isLoopback(address: string | undefined) {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address?.startsWith("::ffff:127.") === true
  );
}

function isTrustedLocalHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function requireAdmin(
  remoteAddress: string | undefined,
  suppliedToken: string | undefined,
  adminToken: string,
) {
  if (!isLoopback(remoteAddress) || suppliedToken !== adminToken)
    throw new AdminError("Only the local host may modify installed content");
}

function decodeHeader(value: string | undefined) {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AssetError("Asset metadata header is malformed");
  }
}

function parseImageKind(value: string | undefined): AssetKind {
  if (!value) return "portrait";
  if (value === "portrait" || value === "card-face" || value === "other")
    return value;
  throw new AssetError("Unsupported image asset kind");
}

class AdminError extends Error {
  code = "FORBIDDEN";
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entryUrl === import.meta.url)
  startHostRuntime(parseHostArgs(process.argv.slice(2))).ready.catch(
    (error) => {
      console.error("host runtime failed to start", error);
      process.exitCode = 1;
    },
  );
