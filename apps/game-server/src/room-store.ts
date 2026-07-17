import { randomUUID } from "node:crypto";
import type { ContentLock, RoomState, RoomSummary } from "@sgs/protocol";

interface InternalRoom extends RoomState {
  password?: string;
  updatedAt: number;
}
interface Membership {
  roomId: string;
  playerId: string;
  statusBeforeOffline?: "not_ready" | "ready" | "playing";
}

export class RoomStore {
  private rooms = new Map<string, InternalRoom>();
  private sessions = new Map<string, Membership>();
  list(): RoomSummary[] {
    return [...this.rooms.values()].map(
      ({
        players,
        contentLock: _,
        password: __,
        revision: ___,
        updatedAt: ____,
        ...room
      }) => ({
        ...room,
        playerCount: players.length,
      }),
    );
  }
  create(
    sessionToken: string,
    input: {
      name: string;
      playerName: string;
      maxPlayers: number;
      password?: string;
      contentLock?: ContentLock[];
      modeId?: string;
    },
  ): RoomState {
    this.leave(sessionToken);
    const roomId = randomUUID().slice(0, 8);
    const playerId = randomUUID();
    const room: InternalRoom = {
      id: roomId,
      name: input.name.trim() || "未命名房间",
      mode: input.modeId ?? "identity",
      modeId: input.modeId,
      visibility: input.password ? "private" : "public",
      playerCount: 1,
      maxPlayers: Math.min(8, Math.max(2, input.maxPlayers)),
      state: "waiting",
      password: input.password,
      contentLock: input.contentLock ?? [],
      revision: 1,
      updatedAt: Date.now(),
      players: [
        {
          id: playerId,
          name: input.playerName.trim() || "玩家",
          seat: 1,
          status: "not_ready",
          isHost: true,
        },
      ],
    };
    this.rooms.set(roomId, room);
    this.sessions.set(sessionToken, { roomId, playerId });
    return this.publicState(room);
  }
  join(
    sessionToken: string,
    roomId: string,
    playerName: string,
    password?: string,
  ): RoomState {
    const existing = this.sessions.get(sessionToken);
    if (existing?.roomId === roomId)
      return this.publicState(this.requireRoom(roomId));
    this.leave(sessionToken);
    const room = this.requireRoom(roomId);
    if (room.state !== "waiting")
      throw new RoomError("ROOM_STARTED", "游戏已经开始");
    if (room.players.length >= room.maxPlayers)
      throw new RoomError("ROOM_FULL", "房间已满");
    if (room.password && room.password !== password)
      throw new RoomError("BAD_PASSWORD", "房间密码错误");
    const playerId = randomUUID();
    room.players.push({
      id: playerId,
      name: playerName.trim() || "玩家",
      seat: room.players.length + 1,
      status: "not_ready",
      isHost: false,
    });
    room.playerCount = room.players.length;
    room.revision++;
    this.touch(room);
    this.sessions.set(sessionToken, { roomId, playerId });
    return this.publicState(room);
  }
  ready(token: string, ready: boolean) {
    const { room, player } = this.requireMembership(token);
    if (room.state !== "waiting")
      throw new RoomError("ROOM_STARTED", "游戏已经开始");
    player.status = ready ? "ready" : "not_ready";
    room.revision++;
    this.touch(room);
    return this.publicState(room);
  }
  start(token: string) {
    const { room, player } = this.requireMembership(token);
    if (!player.isHost) throw new RoomError("NOT_HOST", "只有房主可以开始游戏");
    const guests = room.players.filter((item) => !item.isHost);
    if (!guests.length || guests.some((item) => item.status !== "ready"))
      throw new RoomError("NOT_READY", "至少需要一名已准备的其他玩家");
    room.state = "playing";
    room.players.forEach((item) => (item.status = "playing"));
    room.revision++;
    this.touch(room);
    return this.publicState(room);
  }
  rollbackStart(roomId: string) {
    const room = this.requireRoom(roomId);
    if (room.state !== "playing") return this.publicState(room);
    room.state = "waiting";
    room.players.forEach((player) => {
      player.status = player.isHost ? "not_ready" : "ready";
    });
    room.revision++;
    this.touch(room);
    return this.publicState(room);
  }
  leave(token: string): { roomId?: string; state?: RoomState } {
    const membership = this.sessions.get(token);
    if (!membership) return {};
    this.sessions.delete(token);
    const room = this.rooms.get(membership.roomId);
    if (!room) return {};
    room.players = room.players.filter(
      (player) => player.id !== membership.playerId,
    );
    if (!room.players.length) {
      this.rooms.delete(room.id);
      return { roomId: room.id };
    }
    if (!room.players.some((player) => player.isHost))
      room.players[0].isHost = true;
    room.players.forEach((player, index) => (player.seat = index + 1));
    room.playerCount = room.players.length;
    room.revision++;
    this.touch(room);
    return { roomId: room.id, state: this.publicState(room) };
  }
  disconnect(token: string) {
    const membership = this.sessions.get(token);
    if (!membership) return;
    const room = this.rooms.get(membership.roomId);
    const player = room?.players.find(
      (item) => item.id === membership.playerId,
    );
    if (!room || !player) return;
    membership.statusBeforeOffline =
      player.status === "offline"
        ? membership.statusBeforeOffline
        : player.status;
    player.status = "offline";
    room.revision++;
    this.touch(room);
  }
  reconnect(token: string) {
    const membership = this.sessions.get(token);
    if (!membership) return;
    const room = this.rooms.get(membership.roomId);
    const player = room?.players.find(
      (item) => item.id === membership.playerId,
    );
    if (!room || !player) return;
    player.status =
      membership.statusBeforeOffline ??
      (room.state === "playing" ? "playing" : "not_ready");
    delete membership.statusBeforeOffline;
    room.revision++;
    this.touch(room);
  }
  roomIdFor(token: string) {
    return this.sessions.get(token)?.roomId;
  }
  playerIdFor(token: string) {
    return this.sessions.get(token)?.playerId;
  }
  state(roomId: string) {
    return this.publicState(this.requireRoom(roomId));
  }
  cleanupIdle(
    now = Date.now(),
    waitingMs = 30 * 60_000,
    playingMs = 2 * 60 * 60_000,
  ) {
    const removed: string[] = [];
    for (const room of this.rooms.values()) {
      const limit = room.state === "playing" ? playingMs : waitingMs;
      if (
        room.players.every((player) => player.status === "offline") &&
        now - room.updatedAt >= limit
      ) {
        this.rooms.delete(room.id);
        for (const [token, membership] of this.sessions)
          if (membership.roomId === room.id) this.sessions.delete(token);
        removed.push(room.id);
      }
    }
    return removed;
  }
  private touch(room: InternalRoom) {
    room.updatedAt = Date.now();
  }
  private requireRoom(id: string) {
    const room = this.rooms.get(id);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "房间不存在");
    return room;
  }
  private requireMembership(token: string) {
    const membership = this.sessions.get(token);
    if (!membership) throw new RoomError("NOT_IN_ROOM", "尚未加入房间");
    const room = this.requireRoom(membership.roomId);
    const player = room.players.find((item) => item.id === membership.playerId);
    if (!player) throw new RoomError("NOT_IN_ROOM", "玩家不在房间内");
    return { room, player };
  }
  private publicState(room: InternalRoom): RoomState {
    const { password: _, updatedAt: __, ...state } = room;
    return structuredClone(state);
  }
}
export class RoomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
