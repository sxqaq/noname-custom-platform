import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  AssetKind,
  AssetRecordDto,
  ClientMessage,
  GameView,
  HostInfoDto,
  LanNodeDto,
  PublishedPackage,
  ReplayDto,
  RoomState,
  RoomSummary,
  ServerMessage,
} from "@sgs/protocol";
import { ExtensionEditor } from "./editor";
import "./styles.css";
import "./workshop.css";

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
const HOST_HTTP_ORIGIN = import.meta.env.VITE_HOST_URL ?? location.origin;
const id = () => crypto.randomUUID();
type Tab = "lobby" | "editor" | "replays";
function App() {
  const socket = useRef<WebSocket | undefined>(undefined);
  const retry = useRef(0);
  const inviteAttempted = useRef(false);
  const [connected, setConnected] = useState(false);
  const [hostInfo, setHostInfo] = useState<HostInfoDto>();
  const [adminToken, setAdminToken] = useState("");
  const [lanNodes, setLanNodes] = useState<LanNodeDto[]>([]);
  const [discoveringLan, setDiscoveringLan] = useState(false);
  const [manualNodeAddress, setManualNodeAddress] = useState("");
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [room, setRoom] = useState<RoomState>();
  const [selfId, setSelfId] = useState("");
  const [game, setGame] = useState<GameView>();
  const [packages, setPackages] = useState<PublishedPackage[]>([]);
  const [replays, setReplays] = useState<ReplayDto[]>([]);
  const [replayView, setReplayView] = useState<{
    id: string;
    step: number;
    total: number;
    view: GameView;
  }>();
  const [tab, setTab] = useState<Tab>("lobby");
  const [name, setName] = useState(
    localStorage.getItem("playerName") ??
      `游客${Math.floor(Math.random() * 9999)}`,
  );
  const [roomName, setRoomName] = useState("欢乐身份局");
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState("identity");
  const [packageTestResult, setPackageTestResult] =
    useState<
      Extract<ServerMessage, { type: "package.test-result" }>["payload"]
    >();
  const [error, setError] = useState("");
  const send = useCallback((message: ClientMessage) => {
    setError("");
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify(message));
  }, []);
  useEffect(() => {
    let disposed = false;
    let timer: number;
    const connect = () => {
      const token = localStorage.getItem("sessionToken");
      const ws = new WebSocket(
        `${WS_URL}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
      );
      socket.current = ws;
      ws.onopen = () => {
        retry.current = 0;
        setConnected(true);
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.type === "session.welcome") {
          localStorage.setItem("sessionToken", message.payload.sessionToken);
          ws.send(
            JSON.stringify({
              type: "session.login",
              requestId: id(),
              payload: { name },
            } satisfies ClientMessage),
          );
          const invitedRoom = new URLSearchParams(location.search).get("room");
          if (invitedRoom && !inviteAttempted.current) {
            inviteAttempted.current = true;
            ws.send(
              JSON.stringify({
                type: "room.join",
                requestId: id(),
                payload: { roomId: invitedRoom, playerName: name },
              } satisfies ClientMessage),
            );
          }
        }
        if (message.type === "rooms.snapshot") setRooms(message.payload);
        if (message.type === "room.snapshot") {
          setRoom(message.payload.room);
          setSelfId(message.payload.selfPlayerId);
        }
        if (message.type === "game.snapshot") setGame(message.payload);
        if (message.type === "packages.snapshot") {
          setPackages(message.payload);
          const shared = new URLSearchParams(location.search).get("extension");
          const found = message.payload.find((item) => item.shareId === shared);
          if (found)
            setSelectedPackages([
              `${found.content.id}@${found.content.version}`,
            ]);
        }
        if (message.type === "package.test-result")
          setPackageTestResult(message.payload);
        if (message.type === "replays.snapshot") setReplays(message.payload);
        if (message.type === "replay.snapshot") setReplayView(message.payload);
        if (message.type === "error") setError(message.payload.message);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!disposed)
          timer = window.setTimeout(
            connect,
            Math.min(8000, 500 * 2 ** retry.current++),
          );
      };
    };
    const initialize = async () => {
      try {
        const response = await fetch(`${HOST_HTTP_ORIGIN}/api/host`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const info = (await response.json()) as HostInfoDto;
        const expectedFingerprint = new URLSearchParams(location.search).get(
          "fingerprint",
        );
        if (expectedFingerprint && expectedFingerprint !== info.fingerprint) {
          setError(
            `节点指纹不匹配：邀请为 ${expectedFingerprint}，实际为 ${info.fingerprint}`,
          );
          return;
        }
        if (!disposed) {
          setHostInfo(info);
          const adminResponse = await fetch(
            `${HOST_HTTP_ORIGIN}/api/admin/token`,
          );
          if (adminResponse.ok) {
            const admin = (await adminResponse.json()) as {
              adminToken: string;
            };
            setAdminToken(admin.adminToken);
          }
          connect();
        }
      } catch (hostError) {
        if (!disposed)
          setError(
            `无法读取本地主机：${hostError instanceof Error ? hostError.message : "未知错误"}`,
          );
      }
    };
    void initialize();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket.current?.close();
    };
  }, []);
  const login = () => {
    localStorage.setItem("playerName", name);
    send({ type: "session.login", requestId: id(), payload: { name } });
  };
  const discoverLan = async () => {
    setDiscoveringLan(true);
    setError("");
    try {
      const response = await fetch(
        `${HOST_HTTP_ORIGIN}/api/lan/nodes?timeout=1200`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setLanNodes((await response.json()) as LanNodeDto[]);
    } catch (discoveryError) {
      setError(
        `局域网扫描失败：${discoveryError instanceof Error ? discoveryError.message : "未知错误"}`,
      );
    } finally {
      setDiscoveringLan(false);
    }
  };
  const me = room?.players.find((player) => player.id === selfId);
  const createRoom = () => {
    login();
    send({
      type: "room.create",
      requestId: id(),
      payload: {
        name: roomName,
        playerName: name,
        maxPlayers: 8,
        packages: selectedPackages.map((key) => {
          const [packageId, version] = key.split("@");
          return { id: packageId, version };
        }),
        modeId: selectedMode === "identity" ? undefined : selectedMode,
      },
    });
  };
  const act = (
    payload: Extract<ClientMessage, { type: "game.action" }>["payload"],
  ) => send({ type: "game.action", requestId: id(), payload });
  const uploadImage = async (file: File, kind: AssetKind) => {
    if (!adminToken)
      throw new Error("只有运行这台主机的本地用户可以安装创作资源");
    const response = await fetch(`${HOST_HTTP_ORIGIN}/api/assets/images`, {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "X-Admin-Token": adminToken,
        "X-File-Name": encodeURIComponent(file.name),
        "X-Asset-Kind": kind,
      },
      body: file,
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        result.error ?? `图片上传失败（HTTP ${response.status}）`,
      );
    }
    return (await response.json()) as AssetRecordDto;
  };
  const installPack = async (file: File) => {
    if (!adminToken)
      throw new Error("只有运行这台主机的本地用户可以安装扩展包");
    const response = await fetch(`${HOST_HTTP_ORIGIN}/api/packages/install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sgspack",
        "X-Admin-Token": adminToken,
      },
      body: file,
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      throw new Error(result.error ?? "扩展包安装失败");
    }
  };
  const uninstallPackage = async (packageId: string, version: string) => {
    if (!adminToken)
      throw new Error("只有运行这台主机的本地用户可以卸载扩展包");
    const response = await fetch(
      `${HOST_HTTP_ORIGIN}/api/packages/${encodeURIComponent(packageId)}/${encodeURIComponent(version)}`,
      { method: "DELETE", headers: { "X-Admin-Token": adminToken } },
    );
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      throw new Error(result.error ?? "扩展卸载失败");
    }
  };
  return (
    <main>
      <header>
        <div>
          <h1>无名杀自定义联机平台</h1>
          <p>服务端权威身份局 · 可复现回放 · 自定义武将 DSL</p>
          {hostInfo && (
            <small>
              当前节点：{hostInfo.nodeName} · 指纹 {hostInfo.fingerprint}
            </small>
          )}
        </div>
        <span className={connected ? "online" : "offline"}>
          {connected ? "已连接" : "重连中"}
        </span>
      </header>
      <nav>
        <button
          className={tab === "lobby" ? "active" : "secondary"}
          onClick={() => setTab("lobby")}
        >
          大厅与对局
        </button>
        <button
          className={tab === "editor" ? "active" : "secondary"}
          onClick={() => setTab("editor")}
        >
          武将工坊
        </button>
        <button
          className={tab === "replays" ? "active" : "secondary"}
          onClick={() => setTab("replays")}
        >
          回放记录
        </button>
      </nav>
      {error && <div className="error">{error}</div>}
      {tab === "editor" && (
        <ExtensionEditor
          packages={packages}
          publish={(payload) =>
            send({
              type: "package.publish",
              requestId: id(),
              payload: { package: payload, adminToken },
            })
          }
          runTests={(payload) =>
            send({ type: "package.test", requestId: id(), payload })
          }
          testResult={packageTestResult}
          uploadImage={uploadImage}
          installPack={installPack}
          uninstallPackage={uninstallPackage}
        />
      )}
      {tab === "replays" && (
        <section className="panel">
          <h2>基础回放</h2>
          <p className="muted">
            每条命令、初始种子和最终事件序号均由服务器记录，可用于确定性复演。
          </p>
          {replays.map((item) => (
            <article className="room" key={item.id}>
              <div>
                <strong>{item.roomName}</strong>
                <small>
                  {new Date(item.createdAt).toLocaleString()} · 种子 {item.seed}{" "}
                  · {item.commands.length} 条操作 · 序号 {item.finalSequence}
                </small>
              </div>
              <button
                onClick={() =>
                  send({
                    type: "replay.open",
                    requestId: id(),
                    payload: { id: item.id },
                  })
                }
              >
                播放
              </button>
            </article>
          ))}
          {!replays.length && (
            <p className="muted">完成一局操作后会显示记录。</p>
          )}
          {replayView && (
            <div className="replay">
              <div className="actions">
                <button
                  className="secondary"
                  disabled={replayView.step === 0}
                  onClick={() =>
                    send({
                      type: "replay.open",
                      requestId: id(),
                      payload: { id: replayView.id, step: replayView.step - 1 },
                    })
                  }
                >
                  上一步
                </button>
                <span>
                  {replayView.step}/{replayView.total}
                </span>
                <button
                  disabled={replayView.step === replayView.total}
                  onClick={() =>
                    send({
                      type: "replay.open",
                      requestId: id(),
                      payload: { id: replayView.id, step: replayView.step + 1 },
                    })
                  }
                >
                  下一步
                </button>
              </div>
              <GameTable
                game={replayView.view}
                selfId=""
                act={() => undefined}
                packages={packages}
              />
            </div>
          )}
        </section>
      )}
      {tab === "lobby" &&
        (!room ? (
          <section className="layout">
            <div className="panel">
              <h2>游客身份</h2>
              <label>
                昵称
                <input
                  value={name}
                  maxLength={20}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={login}
                />
              </label>
              <label>
                房间名
                <input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              </label>
              <fieldset>
                <legend>启用扩展版本</legend>
                {packages.map((item) => {
                  const key = `${item.content.id}@${item.content.version}`;
                  return (
                    <label className="check" key={key}>
                      <input
                        type="checkbox"
                        checked={selectedPackages.includes(key)}
                        onChange={(e) =>
                          setSelectedPackages((current) =>
                            e.target.checked
                              ? [...current, key]
                              : current.filter((value) => value !== key),
                          )
                        }
                      />
                      {item.content.name} {item.content.version}
                    </label>
                  );
                })}
                <span className="muted">
                  {packages.length
                    ? "开局时锁定版本与 SHA-256"
                    : "尚未发布扩展"}
                </span>
              </fieldset>
              <label>
                游戏模式
                <select
                  value={selectedMode}
                  onChange={(event) => setSelectedMode(event.target.value)}
                >
                  <option value="identity">标准身份局</option>
                  {packages
                    .filter((item) =>
                      selectedPackages.includes(
                        `${item.content.id}@${item.content.version}`,
                      ),
                    )
                    .flatMap((item) => item.content.modes)
                    .map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.name}
                      </option>
                    ))}
                </select>
              </label>
              <button disabled={!connected} onClick={createRoom}>
                创建身份局
              </button>
            </div>
            <div className="panel grow">
              <h2>房间大厅</h2>
              {rooms.map((candidate) => (
                <article className="room" key={candidate.id}>
                  <div>
                    <strong>{candidate.name}</strong>
                    <small>
                      {candidate.id} · {candidate.playerCount}/
                      {candidate.maxPlayers} ·{" "}
                      {candidate.state === "waiting" ? "等待中" : "游戏中"}
                    </small>
                  </div>
                  <button
                    disabled={candidate.state !== "waiting"}
                    onClick={() => {
                      login();
                      send({
                        type: "room.join",
                        requestId: id(),
                        payload: { roomId: candidate.id, playerName: name },
                      });
                    }}
                  >
                    加入
                  </button>
                </article>
              ))}
              {!rooms.length && <p className="muted">暂无房间。</p>}
            </div>
            <div className="panel grow">
              <div className="roomHeader">
                <div>
                  <h2>局域网节点</h2>
                  <p className="muted">
                    扫描同一网络中明确开启 LAN 模式的个人主机。
                  </p>
                </div>
                <button disabled={discoveringLan} onClick={discoverLan}>
                  {discoveringLan ? "扫描中…" : "扫描节点"}
                </button>
              </div>
              <div className="actions">
                <input
                  value={manualNodeAddress}
                  placeholder="192.168.1.20:3001"
                  onChange={(event) => setManualNodeAddress(event.target.value)}
                />
                <button
                  className="secondary"
                  disabled={!manualNodeAddress.trim()}
                  onClick={() => {
                    const value = manualNodeAddress.trim();
                    location.assign(
                      /^https?:\/\//i.test(value) ? value : `http://${value}`,
                    );
                  }}
                >
                  手动连接
                </button>
              </div>
              {lanNodes.map((node) => (
                <article className="room" key={node.nodeId}>
                  <div>
                    <strong>{node.name}</strong>
                    <small>
                      {node.urls[0] ?? node.host} · 指纹 {node.fingerprint}
                    </small>
                  </div>
                  <button
                    disabled={!node.urls.length}
                    onClick={() => {
                      const target = new URL(node.urls[0]);
                      target.searchParams.set("fingerprint", node.fingerprint);
                      location.assign(target);
                    }}
                  >
                    打开节点
                  </button>
                </article>
              ))}
              {!discoveringLan && !lanNodes.length && (
                <p className="muted">尚未发现其他节点，也可以手动输入地址。</p>
              )}
            </div>
          </section>
        ) : (
          <section className="panel">
            <div className="roomHeader">
              <div>
                <h2>{room.name}</h2>
                <p>
                  房间 {room.id} · {room.players.length}/{room.maxPlayers} ·
                  修订 {room.revision}
                </p>
              </div>
              <div className="actions">
                <button
                  onClick={() => {
                    const target = new URL(location.origin);
                    target.searchParams.set("room", room.id);
                    if (hostInfo)
                      target.searchParams.set(
                        "fingerprint",
                        hostInfo.fingerprint,
                      );
                    void navigator.clipboard?.writeText(target.href);
                  }}
                >
                  复制邀请链接
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    send({ type: "room.leave", requestId: id() });
                    setRoom(undefined);
                    setGame(undefined);
                  }}
                >
                  退出
                </button>
              </div>
            </div>
            <div className="locks">
              {room.contentLock.map((lock) => (
                <code key={lock.packageId}>
                  {lock.name}@{lock.version} #{lock.hash.slice(0, 8)}
                </code>
              ))}
            </div>
            {room.state === "waiting" ? (
              <>
                <div className="seats">
                  {room.players.map((player) => (
                    <article className="seat" key={player.id}>
                      <b>{player.seat}</b>
                      <div>
                        <strong>
                          {player.name}
                          {player.isHost ? "（房主）" : ""}
                        </strong>
                        <small>
                          {
                            {
                              ready: "已准备",
                              not_ready: "未准备",
                              offline: "离线",
                              playing: "游戏中",
                            }[player.status]
                          }
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="actions">
                  {!me?.isHost && (
                    <button
                      onClick={() =>
                        send({
                          type: "room.ready",
                          requestId: id(),
                          payload: { ready: me?.status !== "ready" },
                        })
                      }
                    >
                      {me?.status === "ready" ? "取消准备" : "准备"}
                    </button>
                  )}
                  {me?.isHost && (
                    <button
                      onClick={() =>
                        send({ type: "room.start", requestId: id() })
                      }
                    >
                      开始游戏
                    </button>
                  )}
                </div>
              </>
            ) : (
              game && (
                <GameTable
                  game={game}
                  selfId={selfId}
                  act={act}
                  packages={packages}
                />
              )
            )}
          </section>
        ))}
    </main>
  );
}

function GameTable({
  game,
  selfId,
  act,
  packages,
}: {
  game: GameView;
  selfId: string;
  packages: PublishedPackage[];
  act: (
    payload: Extract<ClientMessage, { type: "game.action" }>["payload"],
  ) => void;
}) {
  const [selectedCard, setSelectedCard] = useState<string>();
  const [discardSelection, setDiscardSelection] = useState<string[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string>();
  const [skillCards, setSkillCards] = useState<string[]>([]);
  const [skillTargets, setSkillTargets] = useState<string[]>([]);
  const [skillOption, setSkillOption] = useState<string>();
  const [skillNumber, setSkillNumber] = useState<number>();
  const [skillSuit, setSkillSuit] = useState<
    "spade" | "heart" | "club" | "diamond"
  >();
  const [cardTargets, setCardTargets] = useState<string[]>([]);
  const [guanxingTop, setGuanxingTop] = useState<string[]>([]);
  const [guanxingBottom, setGuanxingBottom] = useState<string[]>([]);
  const me = game.players.find((player) => player.id === selfId);
  const portraitUrl = (generalId: string) => {
    for (const item of packages) {
      const general = item.content.generals.find(
        (candidate) => candidate.id === generalId,
      );
      const asset = item.content.assets?.find(
        (candidate) => candidate.id === general?.portraitAssetId,
      );
      if (asset) return `/api/assets/${asset.thumbnailHash ?? asset.hash}`;
    }
    return undefined;
  };
  const selected = me?.hand?.find((card) => card.id === selectedCard);
  const myTurn = game.currentPlayerId === selfId && game.phase === "play";
  const choosingTuxi = game.pending?.kind === "tuxi";
  const customSkillPending =
    game.pending?.kind === "customSkill" ? game.pending : undefined;
  const modChoicePending =
    game.pending?.kind === "modChoice" ? game.pending : undefined;
  const interactiveChoice = customSkillPending ?? modChoicePending;
  const choosingCustomTarget = interactiveChoice?.selection.kind === "target";
  const choosingCustomCard = interactiveChoice?.selection.kind === "card";
  const mustRespond = Boolean(
    game.pending &&
    game.pending.kind !== "discard" &&
    game.pending.kind !== "wugu" &&
    game.pending.kind !== "fanjian" &&
    game.pending.kind !== "tuxi" &&
    game.pending.kind !== "guanxing" &&
    game.pending.kind !== "otherCard" &&
    game.pending.kind !== "phaseSkill" &&
    game.pending.kind !== "yiji" &&
    game.pending.kind !== "liuli" &&
    game.pending.kind !== "judgment" &&
    game.pending.kind !== "judgmentSkill" &&
    game.pending.kind !== "optionalTrigger" &&
    game.pending.kind !== "jianxiong" &&
    game.pending.kind !== "yijiChoice" &&
    game.pending.kind !== "customSkill" &&
    game.pending.kind !== "modChoice" &&
    game.pending.kind !== "selectGeneral",
  );
  const mustChooseWugu = game.pending?.kind === "wugu";
  const wuguCards = game.pending?.kind === "wugu" ? game.pending.cards : [];
  const qilinTargetId =
    game.pending?.kind === "qilin" ? game.pending.targetId : undefined;
  const qilinCards =
    game.pending?.kind === "qilin"
      ? Object.values(
          game.players.find((player) => player.id === qilinTargetId)
            ?.equipment ?? {},
        ).filter(
          (card) =>
            game.pending?.kind === "qilin" &&
            game.pending.cardIds.includes(card.id),
        )
      : [];
  const fankuiSourceId =
    game.pending?.kind === "fankui" ? game.pending.sourceId : undefined;
  const fankuiSource = game.players.find(
    (player) => player.id === fankuiSourceId,
  );
  const hanbingTargetId =
    game.pending?.kind === "hanbing" ? game.pending.targetId : undefined;
  const hanbingTarget = game.players.find(
    (player) => player.id === hanbingTargetId,
  );
  const otherCardTargetId =
    game.pending?.kind === "otherCard" ? game.pending.targetId : undefined;
  const otherCardTarget = game.players.find(
    (player) => player.id === otherCardTargetId,
  );
  const mustDiscard =
    game.pending?.kind === "discard" ||
    game.pending?.kind === "guanshi" ||
    game.pending?.kind === "ganglie";
  const discardCount =
    game.pending?.kind === "discard" ||
    game.pending?.kind === "guanshi" ||
    game.pending?.kind === "ganglie"
      ? game.pending.count
      : 0;
  const responseCard =
    game.pending?.kind === "wuxie"
      ? "wuxie"
      : game.pending?.kind === "shan" ||
          game.pending?.kind === "wanjian" ||
          game.pending?.kind === "hujia"
        ? "shan"
        : game.pending?.kind === "duel" ||
            game.pending?.kind === "nanman" ||
            game.pending?.kind === "jiedao" ||
            game.pending?.kind === "qinglong" ||
            game.pending?.kind === "jijiang"
          ? "sha"
          : "tao";
  const phaseNames: Record<string, string> = {
    prepare: "准备阶段",
    judge: "判定阶段",
    draw: "摸牌阶段",
    play: "出牌阶段",
    discard: "弃牌阶段",
    end: "结束阶段",
    response: "等待响应",
    dying: "濒死救援",
    finished: "游戏结束",
  };
  const activeSkills = [
    ...(me?.general.skills.filter((id) =>
      [
        "wusheng",
        "longdan",
        "qixi",
        "guose",
        "zhiheng",
        "kurou",
        "rende",
        "qingnang",
        "jieyin",
        "fanjian",
        "lijian",
        "jijiang",
      ].includes(id),
    ) ?? []),
    ...(me?.equipment?.weapon?.name === "zhangba" ? ["zhangba"] : []),
  ];
  const customActiveSkills = packages
    .flatMap((item) => item.content.skills)
    .filter(
      (skill, index, all) =>
        skill.kind === "active" &&
        me?.general.skills.includes(skill.id) &&
        all.findIndex((candidate) => candidate.id === skill.id) === index,
    );
  return (
    <div className="game">
      <div className="gameMeta">
        第 {game.turn} 回合 · {phaseNames[game.phase] ?? game.phase} · 牌堆{" "}
        {game.deckCount}
      </div>
      <div className="players">
        {game.players.map((player) => (
          <article
            className={`player ${game.currentPlayerId === player.id ? "current" : ""} ${!player.alive ? "dead" : ""}`}
            key={player.id}
          >
            {portraitUrl(player.general.id) && (
              <img
                className="generalPortrait"
                src={portraitUrl(player.general.id)}
                alt={`${player.general.name}立绘`}
                style={{
                  objectPosition: `${player.general.cardStyle?.portraitX ?? 50}% ${player.general.cardStyle?.portraitY ?? 45}%`,
                  transform: `scale(${player.general.cardStyle?.portraitScale ?? 1})`,
                }}
              />
            )}
            <strong>
              {player.general.name} · {player.name}
            </strong>
            <span>
              {player.identity === "hidden" ? "身份未知" : player.identity} ·{" "}
              {player.hp}/{player.maxHp} 体力 · {player.handCount} 手牌
            </span>
            {player.distance !== undefined && player.id !== selfId && (
              <small>与你距离 {player.distance}</small>
            )}
            {player.equipment && Object.keys(player.equipment).length > 0 && (
              <small>
                装备：
                {Object.values(player.equipment)
                  .map((card) => card.displayName)
                  .join("、")}
              </small>
            )}
            {player.judgment && player.judgment.length > 0 && (
              <small>
                判定区：
                {player.judgment.map((card) => card.displayName).join("、")}
              </small>
            )}
            {((myTurn && selectedSkill) ||
              (choosingTuxi && player.id !== selfId && player.handCount > 0) ||
              (choosingCustomTarget &&
                interactiveChoice &&
                (interactiveChoice.selection.targetFilter !== "self" ||
                  player.id === selfId) &&
                (interactiveChoice.selection.targetFilter !== "other" ||
                  player.id !== selfId) &&
                (interactiveChoice.selection.targetFilter !== "wounded" ||
                  player.hp < player.maxHp))) &&
              player.alive && (
                <button
                  className={
                    skillTargets.includes(player.id) ? "selected" : "secondary"
                  }
                  onClick={() =>
                    setSkillTargets((current) =>
                      current.includes(player.id)
                        ? current.filter((id) => id !== player.id)
                        : [...current, player.id],
                    )
                  }
                >
                  {skillTargets.includes(player.id)
                    ? "已选技能目标"
                    : "选择技能目标"}
                </button>
              )}
            {(selected?.name === "sha" ||
              selected?.target === "other" ||
              selected?.target === "any") &&
              myTurn &&
              player.id !== selfId &&
              player.alive && (
                <button
                  className={
                    cardTargets.includes(player.id) ? "selected" : undefined
                  }
                  onClick={() => {
                    if (
                      selected.name === "jiedao" ||
                      (selected.name === "sha" &&
                        me?.equipment?.weapon?.name === "fangtian" &&
                        me.handCount === 1)
                    ) {
                      setCardTargets((current) =>
                        current.includes(player.id)
                          ? current.filter((id) => id !== player.id)
                          : current.length <
                              (selected.name === "jiedao" ? 2 : 3)
                            ? [...current, player.id]
                            : [player.id],
                      );
                      return;
                    }
                    act({
                      action: "useCard",
                      cardId: selected.id,
                      targetId: player.id,
                    });
                    setSelectedCard(undefined);
                    setCardTargets([]);
                  }}
                >
                  以此为目标
                </button>
              )}
          </article>
        ))}
      </div>
      <h3>我的手牌</h3>
      <div className="hand">
        {me?.hand?.map((card) => (
          <button
            className={
              selectedCard === card.id ||
              discardSelection.includes(card.id) ||
              skillCards.includes(card.id)
                ? "card selected"
                : "card"
            }
            key={card.id}
            onClick={() => {
              if (mustDiscard) {
                setDiscardSelection((current) =>
                  current.includes(card.id)
                    ? current.filter((id) => id !== card.id)
                    : [...current, card.id],
                );
              } else if (selectedSkill || choosingCustomCard) {
                setSkillCards((current) =>
                  current.includes(card.id)
                    ? current.filter((id) => id !== card.id)
                    : [...current, card.id],
                );
              } else {
                setSelectedCard(card.id);
                setCardTargets([]);
              }
            }}
          >
            {card.displayName}
            <small>
              {card.suit} {card.rank}
            </small>
          </button>
        ))}
        {((selectedSkill &&
          ["zhiheng", "lijian", "wusheng", "qixi", "guose"].includes(
            selectedSkill,
          )) ||
          (choosingCustomCard &&
            interactiveChoice?.selection.cardZone === "own")) &&
          Object.values(me?.equipment ?? {}).map((card) => (
            <button
              className={
                skillCards.includes(card.id) ? "card selected" : "card"
              }
              key={`skill-equipment-${card.id}`}
              onClick={() =>
                setSkillCards((current) =>
                  current.includes(card.id)
                    ? current.filter((id) => id !== card.id)
                    : [...current, card.id],
                )
              }
            >
              装备素材：{card.displayName}
              <small>
                {card.suit} {card.rank}
              </small>
            </button>
          ))}
        {game.pending?.kind === "guanshi" &&
          Object.values(me?.equipment ?? {})
            .filter(
              (card) =>
                game.pending?.kind === "guanshi" &&
                game.pending.cardIds.includes(card.id),
            )
            .map((card) => (
              <button
                className={
                  discardSelection.includes(card.id) ? "card selected" : "card"
                }
                key={`guanshi-equipment-${card.id}`}
                onClick={() =>
                  setDiscardSelection((current) =>
                    current.includes(card.id)
                      ? current.filter((id) => id !== card.id)
                      : [...current, card.id],
                  )
                }
              >
                贯石斧素材：{card.displayName}
                <small>
                  {card.suit} {card.rank}
                </small>
              </button>
            ))}
      </div>
      <div className="actions">
        {game.pending?.kind === "selectGeneral" && (
          <div className="actions">
            <p>请选择本局武将：</p>
            {game.pending.choices.map((general) => (
              <button
                key={general.id}
                onClick={() =>
                  act({ action: "chooseGeneral", generalId: general.id })
                }
              >
                {portraitUrl(general.id) && (
                  <img
                    className="choicePortrait"
                    src={portraitUrl(general.id)}
                    alt=""
                    style={{
                      objectPosition: `${general.cardStyle?.portraitX ?? 50}% ${general.cardStyle?.portraitY ?? 45}%`,
                    }}
                  />
                )}
                {general.name} · {general.faction} · {general.hp}体力 ·{" "}
                {general.skills.join(" / ")}
              </button>
            ))}
          </div>
        )}
        {mustChooseWugu && (
          <div className="hand">
            {wuguCards.map((card) => (
              <button
                className="card"
                key={card.id}
                onClick={() => act({ action: "chooseCard", cardId: card.id })}
              >
                {card.displayName}
                <small>
                  {card.suit} {card.rank}
                </small>
              </button>
            ))}
          </div>
        )}
        {game.pending?.kind === "qilin" && (
          <div className="hand">
            {qilinCards.map((card) => (
              <button
                className="card"
                key={card.id}
                onClick={() => act({ action: "chooseCard", cardId: card.id })}
              >
                麒麟弓弃置：{card.displayName}
              </button>
            ))}
          </div>
        )}
        {game.pending?.kind === "fanjian" && (
          <div className="actions">
            {(["spade", "heart", "club", "diamond"] as const).map((suit) => (
              <button
                key={suit}
                onClick={() => act({ action: "chooseSuit", suit })}
              >
                反间选择：{suit}
              </button>
            ))}
          </div>
        )}
        {game.pending?.kind === "fankui" && (
          <div className="actions">
            {game.pending.cardIds.map((cardId) => {
              const equipment = fankuiSource?.equipment
                ? Object.values(fankuiSource.equipment).find(
                    (card) => card.id === cardId,
                  )
                : undefined;
              return (
                <button
                  key={cardId}
                  onClick={() => act({ action: "chooseCard", cardId })}
                >
                  {cardId === "random-hand"
                    ? "反馈：随机获得一张手牌"
                    : `反馈：获得${equipment?.displayName ?? "装备牌"}`}
                </button>
              );
            })}
          </div>
        )}
        {game.pending?.kind === "hanbing" && (
          <div className="actions">
            {game.pending.cardIds.map((cardId) => {
              const visibleCard = [
                ...Object.values(hanbingTarget?.equipment ?? {}),
                ...(hanbingTarget?.judgment ?? []),
              ].find((card) => card.id === cardId);
              return (
                <button
                  key={cardId}
                  onClick={() => act({ action: "chooseCard", cardId })}
                >
                  {cardId === "random-hand"
                    ? `寒冰剑：弃置随机手牌（还可弃${game.pending?.kind === "hanbing" ? game.pending.remaining : 0}张）`
                    : `寒冰剑：弃置${visibleCard?.displayName ?? "场上牌"}`}
                </button>
              );
            })}
          </div>
        )}
        {game.pending?.kind === "otherCard" && (
          <div className="actions">
            {game.pending.cardIds.map((cardId) => {
              const visibleCard = [
                ...Object.values(otherCardTarget?.equipment ?? {}),
                ...(otherCardTarget?.judgment ?? []),
              ].find((card) => card.id === cardId);
              return (
                <button
                  key={cardId}
                  onClick={() => act({ action: "chooseCard", cardId })}
                >
                  {game.pending?.kind === "otherCard" &&
                  game.pending.operation === "gain"
                    ? "获得"
                    : "弃置"}
                  ：
                  {cardId === "random-hand"
                    ? "随机手牌"
                    : visibleCard?.displayName}
                </button>
              );
            })}
          </div>
        )}
        {game.pending?.kind === "phaseSkill" && (
          <div className="actions">
            <button
              onClick={() =>
                act({
                  action: "activateSkill",
                  skillId:
                    game.pending?.kind === "phaseSkill"
                      ? game.pending.skillId
                      : "",
                })
              }
            >
              发动{game.pending.skillId}
            </button>
            <button onClick={() => act({ action: "respond" })}>
              不发动{game.pending.skillId}
            </button>
          </div>
        )}
        {game.pending?.kind === "judgment" && (
          <div className="actions">
            <p>
              判定牌：{game.pending.card.displayName} {game.pending.card.suit}{" "}
              {game.pending.card.rank}
            </p>
            {game.pending.stage === "guicai" ? (
              <>
                {(me?.hand ?? []).map((card) => (
                  <button
                    key={`guicai-${card.id}`}
                    onClick={() => act({ action: "respond", cardId: card.id })}
                  >
                    鬼才改判为{card.displayName}（{card.suit} {card.rank}）
                  </button>
                ))}
                <button onClick={() => act({ action: "respond" })}>
                  不发动鬼才
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() =>
                    act({ action: "activateSkill", skillId: "tiandu" })
                  }
                >
                  发动天妒获得判定牌
                </button>
                <button onClick={() => act({ action: "respond" })}>
                  不发动天妒
                </button>
              </>
            )}
          </div>
        )}
        {game.pending?.kind === "judgmentSkill" && (
          <div className="actions">
            <button
              onClick={() =>
                act({
                  action: "activateSkill",
                  skillId:
                    game.pending?.kind === "judgmentSkill"
                      ? game.pending.skillId
                      : "",
                })
              }
            >
              发动{game.pending.skillId}
            </button>
            <button onClick={() => act({ action: "respond" })}>
              不发动{game.pending.skillId}
            </button>
          </div>
        )}
        {game.pending?.kind === "optionalTrigger" && (
          <div className="actions">
            <button
              onClick={() =>
                act({
                  action: "activateSkill",
                  skillId:
                    game.pending?.kind === "optionalTrigger"
                      ? game.pending.skillId
                      : "",
                })
              }
            >
              发动{game.pending.skillId}摸{game.pending.drawCount}张牌
            </button>
            <button onClick={() => act({ action: "respond" })}>
              不发动{game.pending.skillId}
            </button>
          </div>
        )}
        {(game.pending?.kind === "jianxiong" ||
          game.pending?.kind === "yijiChoice") && (
          <div className="actions">
            <button
              onClick={() =>
                act({
                  action: "activateSkill",
                  skillId:
                    game.pending?.kind === "jianxiong" ? "jianxiong" : "yiji",
                })
              }
            >
              {game.pending.kind === "jianxiong"
                ? "发动奸雄获得伤害牌"
                : `发动遗计展示${game.pending.cardCount}张牌`}
            </button>
            <button onClick={() => act({ action: "respond" })}>不发动</button>
          </div>
        )}
        {game.pending?.kind === "yiji" && (
          <div className="actions">
            <p>遗计：为每张展示牌选择获得者</p>
            {game.pending.cards.map((card) => (
              <div key={card.id} className="hand">
                <span>
                  {card.displayName} {card.suit} {card.rank}
                </span>
                {game.players
                  .filter((player) => player.alive)
                  .map((player) => (
                    <button
                      key={player.id}
                      onClick={() =>
                        act({
                          action: "activateSkill",
                          skillId: "yiji",
                          cardIds: [card.id],
                          targetIds: [player.id],
                        })
                      }
                    >
                      交给{player.name}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
        {game.pending?.kind === "liuli" && (
          <div className="actions">
            <p>流离：选择弃置牌和转移目标</p>
            {game.pending.cardIds.flatMap((cardId) => {
              const cost = [
                ...(me?.hand ?? []),
                ...Object.values(me?.equipment ?? {}),
              ].find((card) => card.id === cardId);
              return game.pending?.kind === "liuli"
                ? game.pending.targetIds.map((targetId) => {
                    const target = game.players.find(
                      (player) => player.id === targetId,
                    );
                    return (
                      <button
                        key={`${cardId}:${targetId}`}
                        onClick={() =>
                          act({
                            action: "activateSkill",
                            skillId: "liuli",
                            cardIds: [cardId],
                            targetIds: [targetId],
                          })
                        }
                      >
                        弃{cost?.displayName ?? "一张牌"}，转移给{target?.name}
                      </button>
                    );
                  })
                : [];
            })}
            <button onClick={() => act({ action: "respond" })}>
              不发动流离
            </button>
          </div>
        )}
        {game.pending?.kind === "guanxing" && (
          <div className="actions">
            <p>
              观星：按加入顺序排列牌堆顶和牌堆底（顶 {guanxingTop.length} / 底{" "}
              {guanxingBottom.length}）
            </p>
            <div className="hand">
              {game.pending.cards.map((card) => {
                const assigned =
                  guanxingTop.includes(card.id) ||
                  guanxingBottom.includes(card.id);
                return (
                  <div key={card.id} className="card">
                    {card.displayName} {card.suit} {card.rank}
                    <button
                      disabled={assigned}
                      onClick={() =>
                        setGuanxingTop((items) => [...items, card.id])
                      }
                    >
                      置于牌堆顶
                    </button>
                    <button
                      disabled={assigned}
                      onClick={() =>
                        setGuanxingBottom((items) => [...items, card.id])
                      }
                    >
                      置于牌堆底
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => {
                setGuanxingTop([]);
                setGuanxingBottom([]);
              }}
            >
              重新排列
            </button>
            <button
              onClick={() => {
                act({ action: "respond" });
                setGuanxingTop([]);
                setGuanxingBottom([]);
              }}
            >
              不发动观星
            </button>
            <button
              disabled={
                guanxingTop.length + guanxingBottom.length !==
                game.pending.cards.length
              }
              onClick={() => {
                act({
                  action: "arrangeCards",
                  topIds: guanxingTop,
                  bottomIds: guanxingBottom,
                });
                setGuanxingTop([]);
                setGuanxingBottom([]);
              }}
            >
              确认观星排列
            </button>
          </div>
        )}
        {myTurn && selected?.name === "jiedao" && (
          <button
            disabled={cardTargets.length !== 2}
            onClick={() => {
              act({
                action: "useCard",
                cardId: selected.id,
                targetIds: cardTargets,
              });
              setSelectedCard(undefined);
              setCardTargets([]);
            }}
          >
            使用借刀杀人（先选持武器者，再选被杀目标）
          </button>
        )}
        {myTurn &&
          selected?.name === "sha" &&
          me?.equipment?.weapon?.name === "fangtian" &&
          me.handCount === 1 && (
            <button
              disabled={cardTargets.length < 1 || cardTargets.length > 3}
              onClick={() => {
                act({
                  action: "useCard",
                  cardId: selected.id,
                  targetIds: cardTargets,
                });
                setSelectedCard(undefined);
                setCardTargets([]);
              }}
            >
              方天画戟使用杀（已选 {cardTargets.length}/3 个目标）
            </button>
          )}
        {myTurn &&
          customActiveSkills.map((skill) => (
            <button
              className="secondary"
              key={skill.id}
              disabled={Boolean(me?.marks[`used.${skill.id}`])}
              onClick={() =>
                act({ action: "activateSkill", skillId: skill.id })
              }
            >
              插件技能：{skill.name}
            </button>
          ))}
        {myTurn &&
          activeSkills.map((skill) => (
            <button
              className={selectedSkill === skill ? "selected" : "secondary"}
              key={skill}
              onClick={() => {
                setSelectedSkill(selectedSkill === skill ? undefined : skill);
                setSkillCards([]);
                setSkillTargets([]);
              }}
            >
              技能：{skill}
            </button>
          ))}
        {myTurn && selectedSkill && (
          <button
            onClick={() => {
              act({
                action: "activateSkill",
                skillId: selectedSkill,
                cardIds: skillCards,
                targetIds: skillTargets,
              });
              setSelectedSkill(undefined);
              setSkillCards([]);
              setSkillTargets([]);
            }}
          >
            发动{selectedSkill}（{skillCards.length}牌/{skillTargets.length}
            目标）
          </button>
        )}
        {choosingTuxi && (
          <button
            disabled={skillTargets.length > 2}
            onClick={() => {
              act({
                action: "activateSkill",
                skillId: "tuxi",
                targetIds: skillTargets,
              });
              setSkillTargets([]);
            }}
          >
            发动突袭（已选 {skillTargets.length}/2 个目标，可选 0 个）
          </button>
        )}
        {interactiveChoice && (
          <div className="notice">
            <strong>
              {customSkillPending?.skillName ?? modChoicePending?.packageName}
            </strong>
            <span>{interactiveChoice.selection.prompt}</span>
            {interactiveChoice.selection.kind === "option" && (
              <select
                value={
                  skillOption ?? interactiveChoice.selection.options?.[0]?.id
                }
                onChange={(event) => setSkillOption(event.target.value)}
              >
                {interactiveChoice.selection.options?.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            {interactiveChoice.selection.kind === "number" && (
              <input
                type="number"
                min={interactiveChoice.selection.min}
                max={interactiveChoice.selection.max}
                value={skillNumber ?? interactiveChoice.selection.min}
                onChange={(event) => setSkillNumber(Number(event.target.value))}
              />
            )}
            {interactiveChoice.selection.kind === "suit" && (
              <select
                value={
                  skillSuit ?? interactiveChoice.selection.suits?.[0] ?? "spade"
                }
                onChange={(event) =>
                  setSkillSuit(
                    event.target.value as
                      "spade" | "heart" | "club" | "diamond",
                  )
                }
              >
                {(
                  interactiveChoice.selection.suits ?? [
                    "spade",
                    "heart",
                    "club",
                    "diamond",
                  ]
                ).map((suit) => (
                  <option key={suit} value={suit}>
                    {
                      {
                        spade: "黑桃",
                        heart: "红桃",
                        club: "梅花",
                        diamond: "方块",
                      }[suit]
                    }
                  </option>
                ))}
              </select>
            )}
            <button
              disabled={
                (interactiveChoice.selection.kind === "card" ||
                  interactiveChoice.selection.kind === "target") &&
                ((interactiveChoice.selection.kind === "card"
                  ? skillCards.length
                  : skillTargets.length) < interactiveChoice.selection.min ||
                  (interactiveChoice.selection.kind === "card"
                    ? skillCards.length
                    : skillTargets.length) > interactiveChoice.selection.max)
              }
              onClick={() => {
                act({
                  ...(modChoicePending
                    ? {
                        action: "modChoice" as const,
                        requestId: modChoicePending.requestId,
                      }
                    : {
                        action: "activateSkill" as const,
                        skillId: customSkillPending!.skillId,
                      }),
                  cardIds:
                    interactiveChoice.selection.kind === "card"
                      ? skillCards
                      : undefined,
                  targetIds:
                    interactiveChoice.selection.kind === "target"
                      ? skillTargets
                      : undefined,
                  optionId:
                    interactiveChoice.selection.kind === "option"
                      ? (skillOption ??
                        interactiveChoice.selection.options?.[0]?.id)
                      : undefined,
                  numberValue:
                    interactiveChoice.selection.kind === "number"
                      ? (skillNumber ?? interactiveChoice.selection.min)
                      : undefined,
                  suit:
                    interactiveChoice.selection.kind === "suit"
                      ? (skillSuit ??
                        interactiveChoice.selection.suits?.[0] ??
                        "spade")
                      : undefined,
                });
                setSkillCards([]);
                setSkillTargets([]);
                setSkillOption(undefined);
                setSkillNumber(undefined);
                setSkillSuit(undefined);
              }}
            >
              {interactiveChoice.selection.kind === "card" ||
              interactiveChoice.selection.kind === "target"
                ? `确认选择（${
                    interactiveChoice.selection.kind === "card"
                      ? skillCards.length
                      : skillTargets.length
                  }/${interactiveChoice.selection.min}–${interactiveChoice.selection.max}）`
                : "确认选择"}
            </button>
          </div>
        )}
        {mustRespond &&
          Object.values(me?.equipment ?? {})
            .filter((card) => {
              const red = card.suit === "heart" || card.suit === "diamond";
              return (
                red &&
                ((responseCard === "sha" &&
                  me?.general.skills.includes("wusheng")) ||
                  (responseCard === "tao" &&
                    me?.general.skills.includes("jijiu")))
              );
            })
            .map((card) => (
              <button
                key={`response-equipment-${card.id}`}
                onClick={() => act({ action: "respond", cardId: card.id })}
              >
                以装备{card.displayName}响应为
                {responseCard === "sha" ? "杀" : "桃"}
              </button>
            ))}
        {mustRespond && (
          <>
            <button
              onClick={() =>
                act({
                  action: "respond",
                  cardId:
                    game.pending?.kind === "cixiong"
                      ? selected?.id
                      : selected?.name === responseCard
                        ? selected.id
                        : undefined,
                })
              }
            >
              {game.pending?.kind === "guanshi"
                ? "不发动贯石斧"
                : game.pending?.kind === "ganglie"
                  ? "不弃牌，受到刚烈伤害"
                  : game.pending?.kind === "hanbing"
                    ? "不发动寒冰剑，照常造成伤害"
                    : game.pending?.kind === "fankui"
                      ? "不发动反馈"
                      : game.pending?.kind === "qilin"
                        ? "不发动麒麟弓"
                        : game.pending?.kind === "cixiong"
                          ? selected
                            ? "弃置所选手牌"
                            : "不弃牌，令来源摸牌"
                          : selected?.name === responseCard
                            ? responseCard === "shan"
                              ? "打出闪"
                              : responseCard === "sha"
                                ? "打出杀"
                                : responseCard === "wuxie"
                                  ? "使用无懈可击"
                                  : "使用桃救援"
                            : responseCard === "tao"
                              ? "放弃救援"
                              : "放弃响应"}
            </button>
          </>
        )}
        {mustDiscard && (
          <button
            disabled={discardSelection.length !== discardCount}
            onClick={() => {
              act({ action: "discardCards", cardIds: discardSelection });
              setDiscardSelection([]);
            }}
          >
            弃置所选牌（{discardSelection.length}/{discardCount}）
          </button>
        )}
        {myTurn &&
          selected &&
          selected.name !== "shan" &&
          selected.name !== "sha" &&
          selected.target === "self" && (
            <button
              onClick={() => act({ action: "useCard", cardId: selected.id })}
            >
              使用{selected.displayName}
            </button>
          )}
        {myTurn && (
          <button
            className="secondary"
            onClick={() => act({ action: "endTurn" })}
          >
            结束回合
          </button>
        )}
      </div>
      <div className="log">
        <h3>对局日志</h3>
        {game.log.map((item) => (
          <p key={item.sequence}>
            <b>#{item.sequence}</b> {item.text}
          </p>
        ))}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js");
