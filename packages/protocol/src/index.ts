export type PlayerStatus = "not_ready" | "ready" | "playing" | "offline";
export interface HostInfoDto {
  protocolVersion: 1;
  nodeName: string;
  nodeId: string;
  fingerprint: string;
  publicKey: string;
  authority: "room-host";
  port: number;
  capabilities: string[];
}
export interface LanNodeDto {
  nodeId: string;
  fingerprint: string;
  name: string;
  host: string;
  port: number;
  addresses: string[];
  urls: string[];
  protocolVersion: number;
}
export type AssetKind = "portrait" | "card-face" | "audio" | "other";
export interface AssetRecordDto {
  hash: string;
  thumbnailHash?: string;
  mediaType: string;
  bytes: number;
  width?: number;
  height?: number;
  originalName: string;
  kind: AssetKind;
  author?: string;
  license?: string;
}
export interface ExtensionAssetDto extends AssetRecordDto {
  id: string;
}
export interface ContentLock {
  packageId: string;
  name: string;
  version: string;
  hash: string;
}
export interface RoomPlayer {
  id: string;
  name: string;
  seat: number;
  status: PlayerStatus;
  isHost: boolean;
}
export interface RoomSummary {
  id: string;
  name: string;
  mode: string;
  visibility: "public" | "private";
  playerCount: number;
  maxPlayers: number;
  state: "waiting" | "playing";
}
export interface RoomState extends RoomSummary {
  players: RoomPlayer[];
  contentLock: ContentLock[];
  modeId?: string;
  revision: number;
}

export type EffectTarget = "self" | "source" | "selected" | "allOthers";
export interface EffectDto {
  id?: string;
  type: "draw" | "recover" | "damage" | "addMark" | "discard" | "judge";
  count?: number;
  amount?: number;
  mark?: string;
  target: EffectTarget;
  next?: string;
  successSuits?: Array<"spade" | "heart" | "club" | "diamond">;
  success?: EffectDto[];
  failure?: EffectDto[];
}
export interface SkillSelectionDto {
  id: string;
  prompt: string;
  kind: "target" | "card";
  min: number;
  max: number;
  targetFilter?: "self" | "other" | "any" | "wounded";
  cardZone?: "hand" | "own";
  consume?: "none" | "discard";
}
export interface SkillDto {
  id: string;
  name: string;
  kind?: "trigger" | "active";
  event?: "turnStart" | "afterDamage" | "afterUseSha";
  usage?: "unlimited" | "oncePerTurn";
  selections?: SkillSelectionDto[];
  effects: EffectDto[];
  graph?: { entry: string; nodes: EffectDto[] };
}
export interface GeneralDto {
  id: string;
  name: string;
  faction: string;
  hp: number;
  skills: string[];
  gender?: "male" | "female";
  portraitAssetId?: string;
}
export interface CardDefinitionDto {
  id: string;
  name: string;
  type: "basic" | "trick" | "equipment";
  target: "self" | "other" | "any";
  effects: EffectDto[];
  description?: string;
  subtype?:
    "weapon" | "armor" | "offensiveHorse" | "defensiveHorse" | "delayed";
  range?: number;
}
export interface DeckDefinitionDto {
  id: string;
  name: string;
  cards: Array<{ cardId: string; count: number }>;
}
export interface ModeDefinitionDto {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  initialHand: number;
  drawPerTurn: number;
  winCondition: "identity" | "lastAlive" | "lordSurvives";
  deckId?: string;
}
export interface ExtensionTestDto {
  id: string;
  name: string;
  seed: number;
  players: number;
  commands?: Array<{ type: "endTurn"; playerIndex: number }>;
  expect: {
    noError?: boolean;
    firstGeneral?: string;
    firstHandAtLeast?: number;
  };
}
export interface ExtensionPackageDto {
  schemaVersion: 2 | 3;
  id: string;
  name: string;
  version: string;
  generals: GeneralDto[];
  skills: SkillDto[];
  cards: CardDefinitionDto[];
  decks: DeckDefinitionDto[];
  modes: ModeDefinitionDto[];
  tests: ExtensionTestDto[];
  assets?: ExtensionAssetDto[];
}
export interface PublishedPackage {
  content: ExtensionPackageDto;
  hash: string;
  publishedAt: string;
  shareId: string;
}

export interface CardView {
  id: string;
  name: string;
  displayName: string;
  suit: string;
  rank: number;
  type?: "basic" | "trick" | "equipment";
  subtype?:
    "weapon" | "armor" | "offensiveHorse" | "defensiveHorse" | "delayed";
  range?: number;
  virtualName?: string;
  target?: "self" | "other" | "any";
}
export interface GamePlayerView {
  id: string;
  name: string;
  identity: string;
  general: GeneralDto;
  hp: number;
  maxHp: number;
  alive: boolean;
  handCount: number;
  hand?: CardView[];
  equipment?: Record<string, CardView>;
  judgment?: CardView[];
  distance?: number;
  marks: Record<string, number>;
}
export interface GameView {
  status: "playing" | "finished";
  winner?: string;
  sequence: number;
  currentPlayerId: string;
  turn: number;
  phase: string;
  pending?:
    | {
        playerId: string;
        kind: "selectGeneral";
        choices: GeneralDto[];
      }
    | {
        playerId: string;
        kind: "shan";
        sourceId: string;
        cardId: string;
        required?: number;
        answered?: number;
        remainingTargetIds?: string[];
      }
    | {
        playerId: string;
        kind: "dying";
        sourceId?: string;
        responders: string[];
        responderIndex: number;
      }
    | {
        playerId: string;
        kind: "duel";
        opponentId: string;
        sourceId: string;
        cardId: string;
        required?: number;
        answered?: number;
      }
    | {
        playerId: string;
        kind: "nanman" | "wanjian";
        sourceId: string;
        responders: string[];
        responderIndex: number;
      }
    | {
        playerId: string;
        kind: "wugu";
        sourceId: string;
        responders: string[];
        responderIndex: number;
        cards: CardView[];
      }
    | {
        playerId: string;
        kind: "jiedao";
        sourceId: string;
        targetId: string;
      }
    | {
        playerId: string;
        kind: "wuxie";
        responders: string[];
        responderIndex: number;
        passes: number;
        negated: boolean;
        resolution: { card: CardView; sourceId: string; targetIds: string[] };
      }
    | { playerId: string; kind: "qinglong"; targetId: string }
    | {
        playerId: string;
        kind: "guanshi";
        targetId: string;
        count: 2;
        cardIds: string[];
      }
    | { playerId: string; kind: "cixiong"; sourceId: string; next: unknown }
    | {
        playerId: string;
        kind: "qilin";
        targetId: string;
        cardIds: string[];
      }
    | {
        playerId: string;
        kind: "hanbing";
        targetId: string;
        cardIds: string[];
        remaining: number;
      }
    | {
        playerId: string;
        kind: "otherCard";
        sourceId: string;
        targetId: string;
        cardIds: string[];
        operation: "gain" | "discard";
      }
    | {
        playerId: string;
        kind: "phaseSkill";
        skillId: "luoyi" | "yingzi" | "keji" | "biyue";
        continuation: "draw" | "discard" | "end";
      }
    | {
        playerId: string;
        kind: "yiji";
        cards: CardView[];
      }
    | {
        playerId: string;
        kind: "liuli";
        sourceId: string;
        card: CardView;
        cardIds: string[];
        targetIds: string[];
      }
    | {
        playerId: string;
        kind: "fanjian";
        sourceId: string;
        cardId: string;
      }
    | { playerId: string; kind: "tuxi"; maxTargets: 2 }
    | {
        playerId: string;
        kind: "fankui";
        sourceId: string;
        cardIds: string[];
      }
    | {
        playerId: string;
        kind: "ganglie";
        sourceId: string;
        count: 2;
      }
    | {
        playerId: string;
        kind: "judgment";
        ownerId: string;
        card: CardView;
        stage: "guicai" | "tiandu";
        controllers: string[];
        controllerIndex: number;
        context: unknown;
      }
    | {
        playerId: string;
        kind: "judgmentSkill";
        skillId: "tieji" | "bagua" | "ganglie" | "luoshen";
        context: unknown;
      }
    | {
        playerId: string;
        kind: "optionalTrigger";
        skillId: "jizhi" | "lianying" | "xiaoji";
        drawCount: number;
      }
    | { playerId: string; kind: "jianxiong"; cardId: string }
    | { playerId: string; kind: "yijiChoice"; cardCount: number }
    | {
        playerId: string;
        kind: "hujia";
        lordId: string;
        sourceId: string;
        responders: string[];
        responderIndex: number;
        required: number;
        answered: number;
      }
    | {
        playerId: string;
        kind: "jijiang";
        lordId: string;
        targetId: string;
        responders: string[];
        responderIndex: number;
      }
    | { playerId: string; kind: "guanxing"; cards: CardView[] }
    | {
        playerId: string;
        kind: "customSkill";
        skillId: string;
        skillName: string;
        stepIndex: number;
        selection: SkillSelectionDto;
        selectedCardIds: string[];
        selectedTargetIds: string[];
      }
    | { playerId: string; kind: "discard"; count: number };
  deckCount: number;
  discard: CardView[];
  players: GamePlayerView[];
  log: Array<{ sequence: number; type: string; text: string }>;
}
export interface ReplayDto {
  id: string;
  roomName: string;
  createdAt: string;
  seed: number;
  players: Array<{ id: string; name: string }>;
  commands: unknown[];
  finalSequence: number;
}

export type ClientMessage =
  | { type: "session.login"; requestId: string; payload: { name: string } }
  | {
      type: "room.create";
      requestId: string;
      payload: {
        name: string;
        playerName: string;
        maxPlayers: number;
        password?: string;
        packages?: Array<{ id: string; version: string }>;
        modeId?: string;
      };
    }
  | {
      type: "room.join";
      requestId: string;
      payload: { roomId: string; playerName: string; password?: string };
    }
  | { type: "room.ready"; requestId: string; payload: { ready: boolean } }
  | { type: "room.leave"; requestId: string }
  | { type: "room.start"; requestId: string }
  | {
      type: "game.action";
      requestId: string;
      payload:
        | { action: "chooseGeneral"; generalId: string }
        | {
            action: "useCard";
            cardId: string;
            targetId?: string;
            targetIds?: string[];
          }
        | { action: "respond"; cardId?: string }
        | { action: "chooseCard"; cardId: string }
        | { action: "chooseSuit"; suit: "spade" | "heart" | "club" | "diamond" }
        | { action: "arrangeCards"; topIds: string[]; bottomIds: string[] }
        | {
            action: "activateSkill";
            skillId: string;
            cardIds?: string[];
            targetIds?: string[];
          }
        | { action: "discardCards"; cardIds: string[] }
        | { action: "endTurn" };
    }
  | {
      type: "package.publish";
      requestId: string;
      payload: { package: ExtensionPackageDto; adminToken: string };
    }
  | { type: "package.test"; requestId: string; payload: ExtensionPackageDto }
  | {
      type: "replay.open";
      requestId: string;
      payload: { id: string; step?: number };
    };

export type ServerMessage =
  | { type: "rooms.snapshot"; payload: RoomSummary[] }
  | {
      type: "room.snapshot";
      payload: { room: RoomState; selfPlayerId: string };
    }
  | { type: "game.snapshot"; payload: GameView }
  | { type: "packages.snapshot"; payload: PublishedPackage[] }
  | {
      type: "package.test-result";
      payload: {
        passed: number;
        failed: number;
        results: Array<{ id: string; ok: boolean; message: string }>;
      };
    }
  | { type: "replays.snapshot"; payload: ReplayDto[] }
  | {
      type: "replay.snapshot";
      payload: { id: string; step: number; total: number; view: GameView };
    }
  | {
      type: "session.welcome";
      payload: { sessionToken: string; name?: string; resumed: boolean };
    }
  | { type: "ack"; requestId: string }
  | {
      type: "error";
      requestId?: string;
      payload: { code: string; message: string };
    };
