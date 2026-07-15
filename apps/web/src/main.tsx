import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  ClientMessage,
  GameView,
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
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}${location.port === "5173" ? ":3001" : location.port ? `:${location.port}` : ""}/ws`;
const id = () => crypto.randomUUID();
type Tab = "lobby" | "editor" | "replays";
function App() {
  const socket = useRef<WebSocket | undefined>(undefined);
  const retry = useRef(0);
  const inviteAttempted = useRef(false);
  const [connected, setConnected] = useState(false);
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
    connect();
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
  return (
    <main>
      <header>
        <div>
          <h1>无名杀自定义联机平台</h1>
          <p>服务端权威身份局 · 可复现回放 · 自定义武将 DSL</p>
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
            send({ type: "package.publish", requestId: id(), payload })
          }
          runTests={(payload) =>
            send({ type: "package.test", requestId: id(), payload })
          }
          testResult={packageTestResult}
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
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      `${location.origin}/?room=${room.id}`,
                    )
                  }
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
              game && <GameTable game={game} selfId={selfId} act={act} />
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
}: {
  game: GameView;
  selfId: string;
  act: (
    payload: Extract<ClientMessage, { type: "game.action" }>["payload"],
  ) => void;
}) {
  const [selectedCard, setSelectedCard] = useState<string>();
  const [discardSelection, setDiscardSelection] = useState<string[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string>();
  const [skillCards, setSkillCards] = useState<string[]>([]);
  const [skillTargets, setSkillTargets] = useState<string[]>([]);
  const [cardTargets, setCardTargets] = useState<string[]>([]);
  const [guanxingTop, setGuanxingTop] = useState<string[]>([]);
  const [guanxingBottom, setGuanxingBottom] = useState<string[]>([]);
  const me = game.players.find((player) => player.id === selfId);
  const selected = me?.hand?.find((card) => card.id === selectedCard);
  const myTurn = game.currentPlayerId === selfId && game.phase === "play";
  const choosingTuxi = game.pending?.kind === "tuxi";
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
              (choosingTuxi && player.id !== selfId && player.handCount > 0)) &&
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
              } else if (selectedSkill) {
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
        {selectedSkill &&
          ["zhiheng", "lijian", "wusheng", "qixi", "guose"].includes(
            selectedSkill,
          ) &&
          Object.values(me?.equipment ?? {}).map((card) => (
            <button
              className={skillCards.includes(card.id) ? "card selected" : "card"}
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
            .filter((card) => game.pending?.kind === "guanshi" && game.pending.cardIds.includes(card.id))
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
                  ：{cardId === "random-hand" ? "随机手牌" : visibleCard?.displayName}
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
                  skillId: game.pending?.kind === "phaseSkill"
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
                    onClick={() =>
                      act({ action: "respond", cardId: card.id })
                    }
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
            <button onClick={() => act({ action: "respond" })}>不发动流离</button>
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
                  guanxingTop.includes(card.id) || guanxingBottom.includes(card.id);
                return (
                  <div key={card.id} className="card">
                    {card.displayName} {card.suit} {card.rank}
                    <button
                      disabled={assigned}
                      onClick={() => setGuanxingTop((items) => [...items, card.id])}
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
                onClick={() =>
                  act({ action: "respond", cardId: card.id })
                }
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
