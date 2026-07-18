import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import WebSocket from "ws";
import type { ExtensionPackageDto, GameView } from "@sgs/protocol";
import { startHostRuntime } from "../src/index.js";

interface Message {
  type: string;
  payload: any;
}

class Peer {
  private readonly queue: Message[] = [];
  private readonly waiters: Array<{
    type: string;
    predicate(message: Message): boolean;
    resolve(message: Message): void;
    reject(error: Error): void;
    timer: NodeJS.Timeout;
  }> = [];
  private sequence = 0;
  readonly socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as Message;
      const index = this.waiters.findIndex(
        (waiter) => waiter.type === message.type && waiter.predicate(message),
      );
      if (index < 0) this.queue.push(message);
      else {
        const waiter = this.waiters.splice(index, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    });
  }

  wait(type: string, predicate: (message: Message) => boolean = () => true) {
    const index = this.queue.findIndex(
      (message) => message.type === type && predicate(message),
    );
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]);
    return new Promise<Message>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `等待 ${type} 超时；已缓存消息：${JSON.stringify(this.queue)}`,
            ),
          ),
        10_000,
      );
      this.waiters.push({ type, predicate, resolve, reject, timer });
    });
  }

  send(type: string, payload: unknown = {}) {
    this.socket.send(
      JSON.stringify({ type, requestId: `e2e-${++this.sequence}`, payload }),
    );
  }

  close() {
    this.socket.close();
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("连接已关闭"));
    }
  }
}

const pack = (): ExtensionPackageDto => ({
  schemaVersion: 4,
  id: "test.lan_compat",
  name: "局域网高级 Mod",
  version: "1.0.0",
  assets: [],
  generals: [],
  skills: [],
  cards: [],
  decks: [],
  modes: [],
  tests: [],
  runtime: {
    kind: "noname-compat",
    apiVersion: "noname-compat/v1",
    upstreamCommit: "632d2d3c8da2893466a8c440a18861c9ed49813d",
    permissions: ["game-state", "player-choice"],
    limits: { timeoutMs: 500, memoryMb: 32 },
    source: `(input) => ({
      state: { calls: (input.state?.calls ?? 0) + 1 },
      effects: [{
        type: "addMark",
        target: "self",
        mark: input.hook === "roomStart"
          ? "compat_started"
          : input.hook === "choiceResponse"
            ? "compat_choice"
            : "compat_actions",
        count: 1,
      }],
      request: input.hook === "afterCommand" ? {
        playerId: input.context.actorPlayerId,
        selection: {
          id: "lan_choice", prompt: "选择联机测试路线", kind: "option", min: 1, max: 1,
          options: [{ id: "continue", label: "继续" }, { id: "pause", label: "暂停" }],
        },
      } : undefined,
    })`,
  },
});

test(
  "两个局域网客户端使用房主分发的高级 Mod 开局并执行权威钩子",
  { timeout: 30_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "noname-compat-lan-"));
    const runtime = startHostRuntime({
      port: 0,
      bindAddress: "127.0.0.1",
      dataDir: root,
      webDist: join(root, "missing-web"),
      nodeName: "兼容测试节点",
    });
    let host: Peer | undefined;
    let guest: Peer | undefined;
    try {
      const ready = await runtime.ready;
      const wsUrl = ready.url.replace(/^http/, "ws") + "/ws";
      const { adminToken } = (await fetch(`${ready.url}/api/admin/token`).then(
        (response) => response.json(),
      )) as { adminToken: string };

      host = new Peer(wsUrl);
      const hostWelcome = await host.wait("session.welcome");
      await host.wait("packages.snapshot");
      const content = pack();
      host.send("package.publish", { package: content, adminToken });
      await host.wait("packages.snapshot", (message) =>
        message.payload.some(
          (item: { content: ExtensionPackageDto }) =>
            item.content.id === content.id,
        ),
      );
      host.send("room.create", {
        name: "高级 Mod 房",
        playerName: "甲",
        maxPlayers: 2,
        packages: [{ id: content.id, version: content.version }],
      });
      const hostRoom = await host.wait("room.snapshot");

      guest = new Peer(wsUrl);
      const guestWelcome = await guest.wait("session.welcome");
      await guest.wait("packages.snapshot");
      guest.send("room.join", {
        roomId: hostRoom.payload.room.id,
        playerName: "乙",
      });
      await guest.wait("room.snapshot");
      guest.send("room.ready", { ready: true });
      await Promise.all([
        host.wait("room.snapshot", (message) =>
          message.payload.room.players
            .filter((player: { isHost: boolean }) => !player.isHost)
            .every((player: { status: string }) => player.status === "ready"),
        ),
        guest.wait("room.snapshot", (message) =>
          message.payload.room.players
            .filter((player: { isHost: boolean }) => !player.isHost)
            .every((player: { status: string }) => player.status === "ready"),
        ),
      ]);

      host.send("room.start");
      let [hostView, guestView] = await Promise.all([
        host
          .wait("game.snapshot")
          .then((message) => message.payload as GameView),
        guest
          .wait("game.snapshot")
          .then((message) => message.payload as GameView),
      ]);
      assert.equal(
        hostView.players.find(
          (player) => player.id === hostView.currentPlayerId,
        )?.marks.compat_started,
        1,
      );

      const chooserView = hostView.pending ? hostView : guestView;
      const chooser = chooserView === hostView ? host : guest;
      assert.equal(chooserView.pending?.kind, "selectGeneral");
      chooser.send("game.action", {
        action: "chooseGeneral",
        generalId:
          chooserView.pending?.kind === "selectGeneral"
            ? chooserView.pending.choices[0].id
            : "",
      });
      [hostView, guestView] = await Promise.all([
        host
          .wait("game.snapshot")
          .then((message) => message.payload as GameView),
        guest
          .wait("game.snapshot")
          .then((message) => message.payload as GameView),
      ]);
      assert.equal(
        hostView.players.find(
          (player) => player.id === hostView.currentPlayerId,
        )?.marks.compat_actions,
        1,
      );
      assert.deepEqual(
        hostView.players.map((player) => player.marks),
        guestView.players.map((player) => player.marks),
      );

      const choiceView =
        hostView.pending?.kind === "modChoice" ? hostView : guestView;
      assert.equal(choiceView.pending?.kind, "modChoice");
      const chooserWasHost = choiceView === hostView;
      const chooserToken = (
        chooserWasHost ? hostWelcome.payload : guestWelcome.payload
      ).sessionToken as string;
      if (chooserWasHost) {
        host.close();
        host = new Peer(`${wsUrl}?token=${chooserToken}`);
        assert.equal(
          (await host.wait("session.welcome")).payload.resumed,
          true,
        );
        await host.wait("packages.snapshot");
        await host.wait("room.snapshot");
        hostView = (await host.wait("game.snapshot")).payload as GameView;
      } else {
        guest.close();
        guest = new Peer(`${wsUrl}?token=${chooserToken}`);
        assert.equal(
          (await guest.wait("session.welcome")).payload.resumed,
          true,
        );
        await guest.wait("packages.snapshot");
        await guest.wait("room.snapshot");
        guestView = (await guest.wait("game.snapshot")).payload as GameView;
      }
      const resumedChoice = chooserWasHost ? hostView : guestView;
      assert.equal(resumedChoice.pending?.kind, "modChoice");
      const requestId =
        resumedChoice.pending?.kind === "modChoice"
          ? resumedChoice.pending.requestId
          : "";
      (chooserWasHost ? host : guest).send("game.action", {
        action: "modChoice",
        requestId,
        optionId: "continue",
      });
      [hostView, guestView] = await Promise.all([
        host
          .wait("game.snapshot", (message) =>
            (message.payload as GameView).players.some(
              (player) => player.marks.compat_choice === 1,
            ),
          )
          .then((message) => message.payload as GameView),
        guest
          .wait("game.snapshot", (message) =>
            (message.payload as GameView).players.some(
              (player) => player.marks.compat_choice === 1,
            ),
          )
          .then((message) => message.payload as GameView),
      ]);
      assert.equal(
        hostView.players.find(
          (player) => player.id === choiceView.currentPlayerId,
        )?.marks.compat_choice,
        1,
      );
      assert.deepEqual(
        hostView.players.map((player) => player.marks),
        guestView.players.map((player) => player.marks),
      );
    } finally {
      host?.close();
      guest?.close();
      await runtime.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
