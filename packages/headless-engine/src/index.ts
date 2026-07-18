export type Suit = "spade" | "heart" | "club" | "diamond";
export type Identity = "lord" | "loyalist" | "rebel" | "renegade";
export type EffectTarget = "self" | "source" | "selected" | "allOthers";
export type SkillEvent =
  | "turnStart"
  | "turnEnd"
  | "playPhaseStart"
  | "discardPhaseStart"
  | "afterDamage"
  | "afterUseSha";
export type RuleSubject = "self" | "source" | "selected" | "current";
export type RuleValue =
  | { kind: "number"; value: number }
  | {
      kind: "property";
      subject: RuleSubject;
      property:
        | "hp"
        | "maxHp"
        | "lostHp"
        | "handCount"
        | "mark"
        | "state"
        | "selection";
      key?: string;
    };
export type RuleCondition =
  | { op: "and" | "or"; conditions: RuleCondition[] }
  | { op: "not"; condition: RuleCondition }
  | {
      op: "compare";
      comparator: "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
      left: RuleValue;
      right: RuleValue;
    }
  | {
      op: "predicate";
      predicate: "alive" | "wounded" | "hasSkill";
      subject: RuleSubject;
      skillId?: string;
    };
export interface Effect {
  id?: string;
  type:
    | "draw"
    | "recover"
    | "damage"
    | "addMark"
    | "removeMark"
    | "discard"
    | "judge"
    | "if"
    | "repeat"
    | "setState"
    | "changeState"
    | "loseHp"
    | "changeMaxHp"
    | "grantSkill"
    | "removeSkill"
    | "skipPhase"
    | "moveCards";
  count?: number;
  amount?: number;
  mark?: string;
  target: EffectTarget;
  /** Advanced runtimes can address an exact authoritative player. */
  targetPlayerId?: string;
  next?: string;
  successSuits?: Suit[];
  success?: Effect[];
  failure?: Effect[];
  condition?: RuleCondition;
  then?: Effect[];
  else?: Effect[];
  body?: Effect[];
  times?: number;
  stateKey?: string;
  value?: number;
  skillId?: string;
  duration?: "turn" | "game";
  phase?: "judge" | "draw" | "play" | "discard" | "end";
  fromZone?: "hand" | "own";
  to?: RuleSubject;
  /** Exact destination for advanced card-movement effects. */
  toPlayerId?: string;
  toZone?: "hand" | "discard";
}
export interface SkillSelection {
  id: string;
  prompt: string;
  kind: "target" | "card" | "option" | "number" | "suit";
  min: number;
  max: number;
  targetFilter?: "self" | "other" | "any" | "wounded";
  cardZone?: "hand" | "own";
  consume?: "none" | "discard";
  options?: Array<{ id: string; label: string; value?: number }>;
  suits?: Suit[];
}
export interface SkillModifier {
  type:
    "handLimit" | "drawCount" | "attackRange" | "distanceFrom" | "distanceTo";
  amount: number;
  when?: RuleCondition;
}
export interface General {
  id: string;
  name: string;
  faction: string;
  hp: number;
  skills: string[];
  gender?: "male" | "female";
}
export interface CustomSkill {
  id: string;
  name: string;
  runtimeOnly?: boolean;
  kind?: "trigger" | "active";
  event?: SkillEvent;
  when?: RuleCondition;
  modifiers?: SkillModifier[];
  usage?: "unlimited" | "oncePerTurn";
  selections?: SkillSelection[];
  effects: Effect[];
  graph?: { entry: string; nodes: Effect[] };
}
export interface CardDefinition {
  id: string;
  name: string;
  type: "basic" | "trick" | "equipment";
  target: "self" | "other" | "any";
  effects: Effect[];
  description?: string;
  subtype?: EquipmentSlot | "delayed";
  range?: number;
}
export interface DeckDefinition {
  id: string;
  name: string;
  cards: Array<{ cardId: string; count: number }>;
}
export interface ModeDefinition {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  initialHand: number;
  drawPerTurn: number;
  winCondition: "identity" | "lastAlive" | "lordSurvives";
  deckId?: string;
}
export interface ContentPackage {
  id: string;
  name: string;
  version: string;
  generals: General[];
  skills: CustomSkill[];
  cards?: CardDefinition[];
  decks?: DeckDefinition[];
  modes?: ModeDefinition[];
  hash?: string;
}
export type EquipmentSlot =
  "weapon" | "armor" | "offensiveHorse" | "defensiveHorse";
export interface Card {
  id: string;
  name: string;
  displayName: string;
  suit: Suit;
  rank: number;
  type?: "basic" | "trick" | "equipment";
  subtype?: EquipmentSlot | "delayed";
  range?: number;
  /** Effective delayed-trick name while this physical card is in judgment. */
  virtualName?: string;
}
export type DamageRuleEventName =
  | "damageBegin1"
  | "damageBegin2"
  | "damageBegin3"
  | "damageBegin4"
  | "damageSource"
  | "damageEnd";
export type UseCardRuleEventName =
  | "useCard"
  | "useCard1"
  | "useCard2"
  | "useCardToTarget"
  | "useCardToPlayered"
  | "useCardToTargeted";
export type ExternalRuleEventName =
  "phaseDrawBegin2" | DamageRuleEventName | UseCardRuleEventName;
export interface ExternalRuleEvent {
  id: string;
  name: ExternalRuleEventName;
  playerId: string;
  data: Record<string, unknown>;
}
export interface ExternalRuleEventResolution {
  eventId: string;
  cancelled?: boolean;
  data?: Record<string, unknown>;
}
export interface PlayerState {
  id: string;
  name: string;
  identity: Identity;
  general: General;
  hp: number;
  maxHp: number;
  hand: Card[];
  equipment: Partial<Record<EquipmentSlot, Card>>;
  judgment: Card[];
  alive: boolean;
  marks: Record<string, number>;
  grantedSkills: Record<string, "turn" | "game">;
}
export interface TrickResolution {
  card: Card;
  cardName?: string;
  sourceId: string;
  targetIds: string[];
  groupKind?: "nanman" | "wanjian" | "taoyuan" | "wugu";
  remainingTargetIds?: string[];
  groupCards?: Card[];
  directHitTargetIds?: string[];
  excludedTargetIds?: string[];
}
export interface CardUseOptions {
  directHitTargetIds?: string[];
  excludedTargetIds?: string[];
}
export type JudgmentContext =
  | { kind: "delayed"; ownerId: string; delayed: Card }
  | {
      kind: "ganglie";
      ownerId: string;
      sourceId: string;
      resumePhase: "play";
      resumePending?: PendingResponse;
    }
  | {
      kind: "bagua";
      ownerId: string;
      shaPending: Extract<PendingResponse, { kind: "shan" }>;
    }
  | {
      kind: "tieji";
      ownerId: string;
      sourceId: string;
      targetId: string;
      card: Card;
      remainingTargetIds: string[];
      resumePhase: "play";
      directHitTargetIds?: string[];
    }
  | { kind: "luoshen"; ownerId: string }
  | {
      kind: "custom";
      ownerId: string;
      selfId: string;
      sourceId?: string;
      selectedId?: string;
      skillId?: string;
      successSuits: Suit[];
      success: Effect[];
      failure: Effect[];
      after: Effect[];
      resumePhase: GameState["phase"];
    };
export type PendingResponse =
  | {
      playerId: string;
      kind: "selectGeneral";
      choices: General[];
      pool: General[];
      remainingPlayerIds: string[];
    }
  | {
      playerId: string;
      kind: "shan";
      sourceId: string;
      cardId: string;
      card?: Card;
      resumePhase: "play";
      required?: number;
      answered?: number;
      remainingTargetIds?: string[];
      directHitTargetIds?: string[];
    }
  | {
      playerId: string;
      kind: "shaNext";
      sourceId: string;
      targetId: string;
      card: Card;
      remainingTargetIds: string[];
      resumePhase: "play";
      directHitTargetIds?: string[];
    }
  | {
      playerId: string;
      kind: "phaseContinuation";
      phase: "judge";
    }
  | {
      playerId: string;
      kind: "trickNext";
      resolution: TrickResolution;
    }
  | {
      playerId: string;
      kind: "dying";
      sourceId?: string;
      responders: string[];
      responderIndex: number;
      resumePhase: "play";
      resumePending?: PendingResponse;
    }
  | {
      playerId: string;
      kind: "duel";
      opponentId: string;
      sourceId: string;
      cardId: string;
      resumePhase: "play";
      required?: number;
      answered?: number;
    }
  | {
      playerId: string;
      kind: "nanman" | "wanjian";
      sourceId: string;
      responders: string[];
      responderIndex: number;
      resumePhase: "play";
      cardId?: string;
      resumePending?: PendingResponse;
    }
  | {
      playerId: string;
      kind: "wugu";
      sourceId: string;
      responders: string[];
      responderIndex: number;
      cards: Card[];
      card?: Card;
      cardName?: string;
      remainingTargetIds?: string[];
      directHitTargetIds?: string[];
      excludedTargetIds?: string[];
    }
  | {
      playerId: string;
      kind: "jiedao";
      sourceId: string;
      targetId: string;
      resumePhase: "play";
    }
  | {
      playerId: string;
      kind: "wuxie";
      responders: string[];
      responderIndex: number;
      passes: number;
      negated: boolean;
      resolution: TrickResolution;
    }
  | {
      playerId: string;
      kind: "qinglong";
      targetId: string;
      resumePhase: "play";
    }
  | {
      playerId: string;
      kind: "guanshi";
      targetId: string;
      count: 2;
      cardIds: string[];
      resumePhase: "play";
    }
  | {
      playerId: string;
      kind: "cixiong";
      sourceId: string;
      next: PendingResponse;
    }
  | {
      playerId: string;
      kind: "qilin";
      targetId: string;
      cardIds: string[];
      resumePhase: "play";
      resumePending?: PendingResponse;
    }
  | {
      playerId: string;
      kind: "hanbing";
      targetId: string;
      cardIds: string[];
      remaining: number;
      causeCardId: string;
      resumePhase: "play";
      resumePending?: PendingResponse;
    }
  | {
      playerId: string;
      kind: "otherCard";
      sourceId: string;
      targetId: string;
      cardIds: string[];
      operation: "gain" | "discard";
      resumePhase: "play";
    }
  | {
      playerId: string;
      kind: "phaseSkill";
      skillId: "luoyi" | "yingzi" | "keji" | "biyue";
      continuation: "draw" | "discard" | "end";
      remainingSkills?: Array<"luoyi" | "yingzi">;
      drawCount?: number;
    }
  | {
      playerId: string;
      kind: "yiji";
      cards: Card[];
      resumePhase: "play";
      resumePending?: PendingResponse;
    }
  | {
      playerId: string;
      kind: "liuli";
      sourceId: string;
      card: Card;
      cardIds: string[];
      targetIds: string[];
      remainingTargetIds?: string[];
      resumePhase: "play";
      directHitTargetIds?: string[];
    }
  | {
      playerId: string;
      kind: "fanjian";
      sourceId: string;
      cardId: string;
      resumePhase: "play";
    }
  | { playerId: string; kind: "tuxi"; maxTargets: 2; drawCount?: number }
  | {
      playerId: string;
      kind: "externalRuleEvent";
      event: ExternalRuleEvent;
      continuation:
        | { kind: "draw" }
        | {
            kind: "damage";
            stage: DamageRuleEventName;
            sourceId?: string;
            targetId: string;
            amount: number;
            resumePhase: "play";
            resumePending?: PendingResponse;
            causeCardId?: string;
          }
        | {
            kind: "useCard";
            stage: UseCardRuleEventName;
            command: Extract<GameCommand, { type: "useCard" }>;
            effectiveName: string;
            suppressLianying: boolean;
            directHitTargetIds: string[];
            excludedTargetIds: string[];
            targetIndex?: number;
          };
    }
  | {
      playerId: string;
      kind: "effectContinuation";
      effects: Effect[];
      sourceId?: string;
      selectedId?: string;
      skillId?: string;
      resumePhase: GameState["phase"];
    }
  | {
      playerId: string;
      kind: "fankui";
      sourceId: string;
      cardIds: string[];
      resumePhase: "play";
      resumePending?: PendingResponse;
    }
  | {
      playerId: string;
      kind: "ganglie";
      sourceId: string;
      count: 2;
      resumePhase: "play";
      resumePending?: PendingResponse;
    }
  | {
      playerId: string;
      kind: "judgment";
      ownerId: string;
      card: Card;
      stage: "guicai" | "tiandu";
      controllers: string[];
      controllerIndex: number;
      context: JudgmentContext;
    }
  | {
      playerId: string;
      kind: "judgmentSkill";
      skillId: "tieji" | "bagua" | "ganglie" | "luoshen";
      context: JudgmentContext;
    }
  | {
      playerId: string;
      kind: "optionalTrigger";
      skillId: "jizhi" | "lianying" | "xiaoji";
      drawCount: number;
      resumePhase: GameState["phase"];
      resumePending?: PendingResponse;
    }
  | {
      playerId: string;
      kind: "jianxiong";
      cardId: string;
      resumePhase: "play";
      resumePending?: PendingResponse;
    }
  | {
      playerId: string;
      kind: "yijiChoice";
      cardCount: number;
      resumePhase: "play";
      resumePending?: PendingResponse;
    }
  | {
      playerId: string;
      kind: "hujia";
      lordId: string;
      sourceId: string;
      cardId: string;
      card?: Card;
      responders: string[];
      responderIndex: number;
      required: number;
      answered: number;
      remainingTargetIds?: string[];
      directHitTargetIds?: string[];
      resumePhase: "play";
    }
  | {
      playerId: string;
      kind: "jijiang";
      lordId: string;
      targetId: string;
      responders: string[];
      responderIndex: number;
      resumePhase: "play";
    }
  | { playerId: string; kind: "guanxing"; cards: Card[] }
  | {
      playerId: string;
      kind: "customSkill";
      skillId: string;
      skillName: string;
      stepIndex: number;
      selection: SkillSelection;
      selectedCardIds: string[];
      selectedTargetIds: string[];
      selectedValues: Record<string, number>;
    }
  | { playerId: string; kind: "discard"; count: number };
export interface GameLog {
  sequence: number;
  type: string;
  text: string;
  data?: unknown;
}
export interface GameState {
  version: 2;
  seed: number;
  rngState: number;
  sequence: number;
  status: "playing" | "finished";
  winner?: string;
  players: PlayerState[];
  deck: Card[];
  discard: Card[];
  currentPlayerId: string;
  turn: number;
  phase:
    | "selectGeneral"
    | "prepare"
    | "judge"
    | "draw"
    | "play"
    | "discard"
    | "end"
    | "response"
    | "dying"
    | "finished";
  shaUsed: boolean;
  mode: ModeDefinition;
  pending?: PendingResponse;
  log: GameLog[];
  externalRuleEvents?: boolean;
  ruleEventSequence?: number;
}
export type GameCommand =
  | { type: "chooseGeneral"; playerId: string; generalId: string }
  | {
      type: "useCard";
      playerId: string;
      cardId: string;
      targetId?: string;
      targetIds?: string[];
    }
  | { type: "respond"; playerId: string; cardId?: string }
  | { type: "chooseCard"; playerId: string; cardId: string }
  | { type: "chooseSuit"; playerId: string; suit: Suit }
  | {
      type: "arrangeCards";
      playerId: string;
      topIds: string[];
      bottomIds: string[];
    }
  | {
      type: "activateSkill";
      playerId: string;
      skillId: string;
      cardIds?: string[];
      targetIds?: string[];
      optionId?: string;
      numberValue?: number;
      suit?: Suit;
    }
  | { type: "discardCards"; playerId: string; cardIds: string[] }
  | { type: "endTurn"; playerId: string };
export interface GameConfig {
  seed: number;
  players: Array<{ id: string; name: string }>;
  packages?: ContentPackage[];
  modeId?: string;
  /** Test/scenario fixture only. Production callers omit this for seeded random identities. */
  fixedLordId?: string;
  /** Enables the server-authoritative identity-mode general selection stage. */
  generalSelection?: boolean;
  /** Pauses at serializable rule-event boundaries for the authoritative host. */
  externalRuleEvents?: boolean;
}

const standardGenerals: General[] = [
  {
    id: "caocao",
    name: "曹操",
    faction: "wei",
    hp: 4,
    skills: ["jianxiong", "hujia"],
  },
  {
    id: "simayi",
    name: "司马懿",
    faction: "wei",
    hp: 3,
    skills: ["fankui", "guicai"],
  },
  {
    id: "xiahoudun",
    name: "夏侯惇",
    faction: "wei",
    hp: 4,
    skills: ["ganglie"],
  },
  { id: "zhangliao", name: "张辽", faction: "wei", hp: 4, skills: ["tuxi"] },
  { id: "xuzhu", name: "许褚", faction: "wei", hp: 4, skills: ["luoyi"] },
  {
    id: "guojia",
    name: "郭嘉",
    faction: "wei",
    hp: 3,
    skills: ["tiandu", "yiji"],
  },
  {
    id: "zhenji",
    name: "甄姬",
    faction: "wei",
    hp: 3,
    skills: ["luoshen", "qingguo"],
    gender: "female",
  },
  {
    id: "liubei",
    name: "刘备",
    faction: "shu",
    hp: 4,
    skills: ["rende", "jijiang"],
  },
  { id: "guanyu", name: "关羽", faction: "shu", hp: 4, skills: ["wusheng"] },
  { id: "zhangfei", name: "张飞", faction: "shu", hp: 4, skills: ["paoxiao"] },
  {
    id: "zhugeliang",
    name: "诸葛亮",
    faction: "shu",
    hp: 3,
    skills: ["guanxing", "kongcheng"],
  },
  { id: "zhaoyun", name: "赵云", faction: "shu", hp: 4, skills: ["longdan"] },
  {
    id: "machao",
    name: "马超",
    faction: "shu",
    hp: 4,
    skills: ["mashu", "tieji"],
  },
  {
    id: "huangyueying",
    name: "黄月英",
    faction: "shu",
    hp: 3,
    skills: ["jizhi", "qicai"],
    gender: "female",
  },
  {
    id: "sunquan",
    name: "孙权",
    faction: "wu",
    hp: 4,
    skills: ["zhiheng", "jiuyuan"],
  },
  { id: "ganning", name: "甘宁", faction: "wu", hp: 4, skills: ["qixi"] },
  { id: "huanggai", name: "黄盖", faction: "wu", hp: 4, skills: ["kurou"] },
  {
    id: "zhouyu",
    name: "周瑜",
    faction: "wu",
    hp: 3,
    skills: ["yingzi", "fanjian"],
  },
  {
    id: "daqiao",
    name: "大乔",
    faction: "wu",
    hp: 3,
    skills: ["guose", "liuli"],
    gender: "female",
  },
  {
    id: "luxun",
    name: "陆逊",
    faction: "wu",
    hp: 3,
    skills: ["qianxun", "lianying"],
  },
  {
    id: "sunshangxiang",
    name: "孙尚香",
    faction: "wu",
    hp: 3,
    skills: ["xiaoji", "jieyin"],
    gender: "female",
  },
  { id: "lvmeng", name: "吕蒙", faction: "wu", hp: 4, skills: ["keji"] },
  {
    id: "huatuo",
    name: "华佗",
    faction: "qun",
    hp: 3,
    skills: ["qingnang", "jijiu"],
  },
  { id: "lvbu", name: "吕布", faction: "qun", hp: 4, skills: ["wushuang"] },
  {
    id: "diaochan",
    name: "貂蝉",
    faction: "qun",
    hp: 3,
    skills: ["lijian", "biyue"],
    gender: "female",
  },
];
const defaultMode: ModeDefinition = {
  id: "identity",
  name: "身份局",
  minPlayers: 2,
  maxPlayers: 8,
  initialHand: 4,
  drawPerTurn: 2,
  winCondition: "identity",
};
const standardCards: CardDefinition[] = [
  { id: "sha", name: "杀", type: "basic", target: "other", effects: [] },
  { id: "shan", name: "闪", type: "basic", target: "self", effects: [] },
  {
    id: "tao",
    name: "桃",
    type: "basic",
    target: "self",
    effects: [{ type: "recover", target: "self", amount: 1 }],
  },
  { id: "wuxie", name: "无懈可击", type: "trick", target: "self", effects: [] },
  {
    id: "wuzhong",
    name: "无中生有",
    type: "trick",
    target: "self",
    effects: [{ type: "draw", target: "self", count: 2 }],
  },
  {
    id: "guohe",
    name: "过河拆桥",
    type: "trick",
    target: "other",
    effects: [{ type: "discard", target: "selected", count: 1 }],
  },
  {
    id: "shunshou",
    name: "顺手牵羊",
    type: "trick",
    target: "other",
    effects: [],
  },
  { id: "juedou", name: "决斗", type: "trick", target: "other", effects: [] },
  {
    id: "nanman",
    name: "南蛮入侵",
    type: "trick",
    target: "self",
    effects: [],
  },
  {
    id: "wanjian",
    name: "万箭齐发",
    type: "trick",
    target: "self",
    effects: [],
  },
  {
    id: "taoyuan",
    name: "桃园结义",
    type: "trick",
    target: "self",
    effects: [],
  },
  { id: "wugu", name: "五谷丰登", type: "trick", target: "self", effects: [] },
  {
    id: "jiedao",
    name: "借刀杀人",
    type: "trick",
    target: "other",
    effects: [],
  },
  {
    id: "lebu",
    name: "乐不思蜀",
    type: "trick",
    target: "other",
    effects: [],
    subtype: "delayed",
  },
  {
    id: "shandian",
    name: "闪电",
    type: "trick",
    target: "self",
    effects: [],
    subtype: "delayed",
  },
  {
    id: "zhuge",
    name: "诸葛连弩",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "weapon",
    range: 1,
  },
  {
    id: "cixiong",
    name: "雌雄双股剑",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "weapon",
    range: 2,
  },
  {
    id: "qinggang",
    name: "青釭剑",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "weapon",
    range: 2,
  },
  {
    id: "qinglong",
    name: "青龙偃月刀",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "weapon",
    range: 3,
  },
  {
    id: "zhangba",
    name: "丈八蛇矛",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "weapon",
    range: 3,
  },
  {
    id: "guanshi",
    name: "贯石斧",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "weapon",
    range: 3,
  },
  {
    id: "fangtian",
    name: "方天画戟",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "weapon",
    range: 4,
  },
  {
    id: "qilin",
    name: "麒麟弓",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "weapon",
    range: 5,
  },
  {
    id: "hanbing",
    name: "寒冰剑",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "weapon",
    range: 2,
  },
  {
    id: "bagua",
    name: "八卦阵",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "armor",
  },
  {
    id: "renwang",
    name: "仁王盾",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "armor",
  },
  {
    id: "chitu",
    name: "赤兔",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "offensiveHorse",
  },
  {
    id: "dawan",
    name: "大宛",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "offensiveHorse",
  },
  {
    id: "zixin",
    name: "紫骍",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "offensiveHorse",
  },
  {
    id: "jueying",
    name: "绝影",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "defensiveHorse",
  },
  {
    id: "dilu",
    name: "的卢",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "defensiveHorse",
  },
  {
    id: "zhuahuang",
    name: "爪黄飞电",
    type: "equipment",
    target: "self",
    effects: [],
    subtype: "defensiveHorse",
  },
];

/**
 * libnoname/noname apps/core/card/standard.js `list` at the pinned upstream
 * commit. Keep individual copies: duplicate suit/rank/name triples are real
 * physical cards and must not be collapsed into counts.
 */
const standardDeck: ReadonlyArray<readonly [Suit, number, string]> = [
  ["spade", 7, "sha"],
  ["spade", 8, "sha"],
  ["spade", 8, "sha"],
  ["spade", 9, "sha"],
  ["spade", 9, "sha"],
  ["spade", 10, "sha"],
  ["spade", 10, "sha"],
  ["club", 2, "sha"],
  ["club", 3, "sha"],
  ["club", 4, "sha"],
  ["club", 5, "sha"],
  ["club", 6, "sha"],
  ["club", 7, "sha"],
  ["club", 8, "sha"],
  ["club", 8, "sha"],
  ["club", 9, "sha"],
  ["club", 9, "sha"],
  ["club", 10, "sha"],
  ["club", 10, "sha"],
  ["club", 11, "sha"],
  ["club", 11, "sha"],
  ["heart", 10, "sha"],
  ["heart", 10, "sha"],
  ["heart", 11, "sha"],
  ["diamond", 6, "sha"],
  ["diamond", 7, "sha"],
  ["diamond", 8, "sha"],
  ["diamond", 9, "sha"],
  ["diamond", 10, "sha"],
  ["diamond", 13, "sha"],
  ["heart", 2, "shan"],
  ["heart", 2, "shan"],
  ["heart", 13, "shan"],
  ["diamond", 2, "shan"],
  ["diamond", 2, "shan"],
  ["diamond", 3, "shan"],
  ["diamond", 4, "shan"],
  ["diamond", 5, "shan"],
  ["diamond", 6, "shan"],
  ["diamond", 7, "shan"],
  ["diamond", 8, "shan"],
  ["diamond", 9, "shan"],
  ["diamond", 10, "shan"],
  ["diamond", 11, "shan"],
  ["diamond", 11, "shan"],
  ["heart", 3, "tao"],
  ["heart", 4, "tao"],
  ["heart", 6, "tao"],
  ["heart", 7, "tao"],
  ["heart", 8, "tao"],
  ["heart", 9, "tao"],
  ["heart", 12, "tao"],
  ["diamond", 12, "tao"],
  ["spade", 2, "bagua"],
  ["club", 2, "bagua"],
  ["spade", 5, "jueying"],
  ["club", 5, "dilu"],
  ["heart", 13, "zhuahuang"],
  ["heart", 5, "chitu"],
  ["spade", 13, "dawan"],
  ["diamond", 13, "zixin"],
  ["club", 1, "zhuge"],
  ["diamond", 1, "zhuge"],
  ["spade", 2, "cixiong"],
  ["spade", 6, "qinggang"],
  ["spade", 5, "qinglong"],
  ["spade", 12, "zhangba"],
  ["diamond", 5, "guanshi"],
  ["diamond", 12, "fangtian"],
  ["heart", 5, "qilin"],
  ["heart", 3, "wugu"],
  ["heart", 4, "wugu"],
  ["heart", 1, "taoyuan"],
  ["spade", 7, "nanman"],
  ["spade", 13, "nanman"],
  ["club", 7, "nanman"],
  ["heart", 1, "wanjian"],
  ["spade", 1, "juedou"],
  ["club", 1, "juedou"],
  ["diamond", 1, "juedou"],
  ["heart", 7, "wuzhong"],
  ["heart", 8, "wuzhong"],
  ["heart", 9, "wuzhong"],
  ["heart", 11, "wuzhong"],
  ["spade", 3, "shunshou"],
  ["spade", 4, "shunshou"],
  ["spade", 11, "shunshou"],
  ["diamond", 3, "shunshou"],
  ["diamond", 4, "shunshou"],
  ["spade", 3, "guohe"],
  ["spade", 4, "guohe"],
  ["spade", 12, "guohe"],
  ["club", 3, "guohe"],
  ["club", 4, "guohe"],
  ["heart", 12, "guohe"],
  ["club", 12, "jiedao"],
  ["club", 13, "jiedao"],
  ["spade", 11, "wuxie"],
  ["club", 12, "wuxie"],
  ["club", 13, "wuxie"],
  ["spade", 6, "lebu"],
  ["club", 6, "lebu"],
  ["heart", 6, "lebu"],
  ["spade", 1, "shandian"],
  ["spade", 2, "hanbing"],
  ["club", 2, "renwang"],
  ["heart", 12, "shandian"],
  ["diamond", 12, "wuxie"],
];

class SeededRandom {
  constructor(public state: number) {
    if (!state) this.state = 0x6d2b79f5;
  }
  next() {
    let x = this.state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }
  int(max: number) {
    return Math.floor(this.next() * max);
  }
  shuffle<T>(items: T[]) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}
function identities(count: number): Identity[] {
  const table: Record<number, Identity[]> = {
    2: ["lord", "rebel"],
    3: ["lord", "rebel", "renegade"],
    4: ["lord", "loyalist", "rebel", "renegade"],
    5: ["lord", "loyalist", "rebel", "rebel", "renegade"],
    6: ["lord", "loyalist", "rebel", "rebel", "rebel", "renegade"],
    7: ["lord", "loyalist", "loyalist", "rebel", "rebel", "rebel", "renegade"],
    8: [
      "lord",
      "loyalist",
      "loyalist",
      "rebel",
      "rebel",
      "rebel",
      "rebel",
      "renegade",
    ],
  };
  return table[count] ?? table[8];
}

export class HeadlessGame {
  private rng: SeededRandom;
  private skills = new Map<string, CustomSkill>();
  private cards = new Map<string, CardDefinition>();
  private suppressLianying = new Set<string>();
  private queuedOptionalDraws: Array<{
    playerId: string;
    skillId: "jizhi" | "lianying" | "xiaoji";
    drawCount: number;
  }> = [];
  constructor(public state: GameState) {
    this.rng = new SeededRandom(state.rngState);
    standardCards.forEach((card) => this.cards.set(card.id, card));
  }
  static create(config: GameConfig) {
    const packages = config.packages ?? [];
    const modes = packages.flatMap((pack) => pack.modes ?? []);
    const mode = structuredClone(
      modes.find((item) => item.id === config.modeId) ?? defaultMode,
    );
    if (
      config.players.length < mode.minPlayers ||
      config.players.length > mode.maxPlayers
    )
      throw new Error(
        `${mode.name}需要 ${mode.minPlayers}–${mode.maxPlayers} 名玩家`,
      );
    const rng = new SeededRandom(config.seed);
    const customGenerals = packages.flatMap((pack) => pack.generals);
    const generals = customGenerals.length
      ? [...rng.shuffle(customGenerals), ...rng.shuffle([...standardGenerals])]
      : rng.shuffle([...standardGenerals]);
    const rolePool = identities(config.players.length);
    let roles: Identity[];
    if (config.fixedLordId) {
      const lordIndex = config.players.findIndex(
        (player) => player.id === config.fixedLordId,
      );
      if (lordIndex < 0) throw new Error("fixedLordId 不属于本局玩家");
      const others = rng.shuffle(rolePool.filter((role) => role !== "lord"));
      roles = config.players.map((_, index) =>
        index === lordIndex ? "lord" : others.shift()!,
      );
    } else roles = rng.shuffle(rolePool);
    const players = config.players.map((player, index): PlayerState => {
      const general = structuredClone(generals[index % generals.length]);
      const bonus =
        mode.winCondition === "identity" &&
        roles[index] === "lord" &&
        config.players.length >= 5
          ? 1
          : 0;
      return {
        ...player,
        identity: roles[index],
        general,
        hp: general.hp + bonus,
        maxHp: general.hp + bonus,
        hand: [],
        equipment: {},
        judgment: [],
        alive: true,
        marks: {},
        grantedSkills: {},
      };
    });
    const definitions = new Map(
      [...standardCards, ...packages.flatMap((pack) => pack.cards ?? [])].map(
        (card) => [card.id, card],
      ),
    );
    const selectedDeck = packages
      .flatMap((pack) => pack.decks ?? [])
      .find((item) => item.id === mode.deckId);
    const deck = rng.shuffle(buildDeck(selectedDeck, definitions));
    if (!config.generalSelection)
      players.forEach((player) =>
        player.hand.push(...deck.splice(0, mode.initialHand)),
      );
    const lord = players.find((player) => player.identity === "lord")!;
    const game = new HeadlessGame({
      version: 2,
      seed: config.seed,
      rngState: rng.state,
      sequence: 0,
      status: "playing",
      players,
      deck,
      discard: [],
      currentPlayerId: lord.id,
      turn: 1,
      phase: config.generalSelection ? "selectGeneral" : "play",
      shaUsed: false,
      mode,
      log: [],
      externalRuleEvents: config.externalRuleEvents ?? false,
      ruleEventSequence: 0,
    });
    packages
      .flatMap((pack) => pack.skills)
      .forEach((skill) => game.skills.set(skill.id, skill));
    definitions.forEach((card) => game.cards.set(card.id, card));
    if (config.generalSelection) {
      const selectionOrder = [
        lord.id,
        ...players
          .filter((player) => player.id !== lord.id)
          .map((player) => player.id),
      ];
      const pool = structuredClone(generals);
      game.state.pending = {
        playerId: selectionOrder[0],
        kind: "selectGeneral",
        choices: pool.slice(0, Math.min(5, pool.length)),
        pool,
        remainingPlayerIds: selectionOrder.slice(1),
      };
      game.log("game.general-selection", `主公${lord.name}开始选择武将`);
      return game;
    }
    game.log("game.start", `游戏开始，主公${lord.name}先手`);
    game.beginTurn(lord);
    return game;
  }
  static restore(snapshot: string, packages: ContentPackage[] = []) {
    const game = new HeadlessGame(JSON.parse(snapshot) as GameState);
    game.state.players.forEach((player) => {
      player.grantedSkills ??= {};
    });
    game.state.externalRuleEvents ??= false;
    game.state.ruleEventSequence ??= 0;
    packages
      .flatMap((pack) => pack.skills)
      .forEach((skill) => game.skills.set(skill.id, skill));
    packages
      .flatMap((pack) => pack.cards ?? [])
      .forEach((card) => game.cards.set(card.id, card));
    return game;
  }
  snapshot() {
    this.state.rngState = this.rng.state;
    return JSON.stringify(this.state);
  }
  externalRuleEvent() {
    return this.state.pending?.kind === "externalRuleEvent"
      ? structuredClone(this.state.pending.event)
      : undefined;
  }
  resumeExternalRuleEvent(resolution: ExternalRuleEventResolution) {
    const stateBefore = structuredClone(this.state);
    const rngBefore = this.rng.state;
    const queuedBefore = structuredClone(this.queuedOptionalDraws);
    const suppressedBefore = new Set(this.suppressLianying);
    const before = this.state.sequence;
    try {
      const pending = this.state.pending;
      if (!pending || pending.kind !== "externalRuleEvent")
        throw new Error("No authoritative rule event is waiting");
      if (resolution.eventId !== pending.event.id)
        throw new Error("Authoritative rule event ID does not match");
      const cancelled =
        resolution.cancelled === true || resolution.data?.cancelled === true;
      delete this.state.pending;
      if (pending.continuation.kind === "draw") {
        const num = resolution.data?.num ?? pending.event.data.num;
        if (!Number.isInteger(num) || Number(num) < 0 || Number(num) > 20)
          throw new Error("Rule event count must be an integer from 0 to 20");
        this.continueDrawPhase(
          this.player(pending.playerId),
          Number(num),
          cancelled,
        );
      } else if (pending.continuation.kind === "damage") {
        const num = resolution.data?.num ?? pending.event.data.num;
        if (!Number.isInteger(num) || Number(num) < 0 || Number(num) > 100)
          throw new Error("Rule event count must be an integer from 0 to 100");
        this.continueDamageRuleEvent(
          pending.continuation,
          Number(num),
          cancelled,
        );
      } else
        this.continueUseCardRuleEvent(
          pending.continuation,
          resolution.data,
          cancelled,
        );
      this.flushOptionalDraws();
      this.state.rngState = this.rng.state;
      return this.state.log.filter((item) => item.sequence > before);
    } catch (error) {
      this.state = stateBefore;
      this.rng.state = rngBefore;
      this.queuedOptionalDraws = queuedBefore;
      this.suppressLianying = suppressedBefore;
      throw error;
    }
  }
  dispatch(command: GameCommand, options: { atomic?: boolean } = {}) {
    if (this.state.status !== "playing") throw new Error("游戏已经结束");
    const atomic = options.atomic !== false;
    const stateBefore = atomic ? structuredClone(this.state) : undefined;
    const rngBefore = this.rng.state;
    const queuedBefore = atomic
      ? structuredClone(this.queuedOptionalDraws)
      : undefined;
    const suppressedBefore = atomic
      ? new Set(this.suppressLianying)
      : undefined;
    this.queuedOptionalDraws = [];
    const before = this.state.sequence;
    try {
      if (command.type === "chooseGeneral")
        this.chooseGeneral(command.playerId, command.generalId);
      else if (command.type === "useCard") this.useCard(command);
      else if (command.type === "respond") this.respond(command);
      else if (command.type === "chooseCard")
        this.chooseCard(command.playerId, command.cardId);
      else if (command.type === "chooseSuit")
        this.chooseSuit(command.playerId, command.suit);
      else if (command.type === "arrangeCards")
        this.arrangeCards(command.playerId, command.topIds, command.bottomIds);
      else if (command.type === "activateSkill") this.activateSkill(command);
      else if (command.type === "discardCards")
        this.discardCards(command.playerId, command.cardIds);
      else this.endTurn(command.playerId);
      this.flushOptionalDraws();
      this.state.rngState = this.rng.state;
      return this.state.log.filter((item) => item.sequence > before);
    } catch (error) {
      if (stateBefore && queuedBefore && suppressedBefore) {
        this.state = stateBefore;
        this.rng.state = rngBefore;
        this.queuedOptionalDraws = queuedBefore;
        this.suppressLianying = suppressedBefore;
      }
      throw error;
    }
  }
  applyExternalEffects(
    effects: Effect[],
    sourceId = this.state.currentPlayerId,
    selectedId?: string,
    hookId = "external-mod",
    selfId = sourceId,
  ) {
    if (this.state.status !== "playing") throw new Error("游戏已经结束");
    const stateBefore = structuredClone(this.state);
    const rngBefore = this.rng.state;
    const queuedBefore = structuredClone(this.queuedOptionalDraws);
    const suppressedBefore = new Set(this.suppressLianying);
    const before = this.state.sequence;
    try {
      const self = this.player(selfId);
      const source = this.player(sourceId);
      const selected = selectedId ? this.player(selectedId) : undefined;
      this.applyEffects(
        structuredClone(effects),
        self,
        source,
        selected,
        hookId,
      );
      this.flushOptionalDraws();
      this.state.rngState = this.rng.state;
      this.log("mod.hook", `${hookId} 已由权威引擎执行`);
      return this.state.log.filter((item) => item.sequence > before);
    } catch (error) {
      this.state = stateBefore;
      this.rng.state = rngBefore;
      this.queuedOptionalDraws = queuedBefore;
      this.suppressLianying = suppressedBefore;
      throw error;
    }
  }
  viewFor(playerId?: string) {
    const viewer = this.player(playerId ?? "", false);
    const pendingViewer =
      this.state.pending?.kind === "dying"
        ? this.state.pending.responders[this.state.pending.responderIndex]
        : this.state.pending?.playerId;
    const visiblePending =
      this.state.pending?.kind === "externalRuleEvent"
        ? undefined
        : pendingViewer !== playerId
          ? undefined
          : this.state.pending?.kind === "selectGeneral"
            ? {
                playerId: this.state.pending.playerId,
                kind: this.state.pending.kind,
                choices: this.state.pending.choices,
              }
            : this.state.pending;
    return {
      status: this.state.status,
      winner: this.state.winner,
      sequence: this.state.sequence,
      currentPlayerId: this.state.currentPlayerId,
      turn: this.state.turn,
      phase: this.state.phase,
      pending: visiblePending,
      deckCount: this.state.deck.length,
      discard: this.state.discard.slice(-10),
      log: this.state.log.slice(-60),
      players: this.state.players.map((player) => ({
        id: player.id,
        name: player.name,
        identity:
          player.id === playerId ||
          this.state.status === "finished" ||
          player.identity === "lord"
            ? player.identity
            : "hidden",
        general: { ...player.general, skills: this.skillIds(player) },
        hp: player.hp,
        maxHp: player.maxHp,
        alive: player.alive,
        handCount: player.hand.length,
        hand:
          player.id === viewer?.id
            ? player.hand.map((card) => ({
                ...card,
                target: this.cards.get(card.name)?.target,
              }))
            : undefined,
        equipment: player.equipment,
        judgment: player.judgment,
        distance: viewer ? this.distance(viewer.id, player.id) : undefined,
        marks: player.marks,
      })),
    };
  }
  private chooseGeneral(playerId: string, generalId: string) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.kind !== "selectGeneral" ||
      pending.playerId !== playerId
    )
      throw new Error("当前无需选择武将");
    const selected = pending.choices.find(
      (general) => general.id === generalId,
    );
    if (!selected) throw new Error("所选武将不在候选列表中");
    const player = this.player(playerId);
    player.general = structuredClone(selected);
    const lordBonus =
      this.state.mode.winCondition === "identity" &&
      player.identity === "lord" &&
      this.state.players.length >= 5
        ? 1
        : 0;
    player.maxHp = selected.hp + lordBonus;
    player.hp = player.maxHp;
    this.log("game.general-selected", `${player.name}选择了${selected.name}`);
    const offered = new Set(pending.choices.map((general) => general.id));
    const pool = [
      ...pending.pool.filter(
        (general) => general.id !== selected.id && !offered.has(general.id),
      ),
      ...pending.choices.filter((general) => general.id !== selected.id),
    ];
    const nextPlayerId = pending.remainingPlayerIds.shift();
    if (nextPlayerId) {
      pending.playerId = nextPlayerId;
      pending.pool = pool;
      pending.choices = pool.slice(0, Math.min(3, pool.length));
      return;
    }
    delete this.state.pending;
    for (const candidate of this.state.players)
      candidate.hand.push(
        ...this.state.deck.splice(0, this.state.mode.initialHand),
      );
    const lord = this.state.players.find(
      (candidate) => candidate.identity === "lord",
    )!;
    this.state.currentPlayerId = lord.id;
    this.state.phase = "play";
    this.log("game.start", `游戏开始，主公${lord.name}先手`);
    this.beginTurn(lord);
  }
  private useCard(
    command: Extract<GameCommand, { type: "useCard" }>,
    effectiveName?: string,
    resumeRuleEvent = false,
    options: CardUseOptions = {},
  ) {
    if (this.state.externalRuleEvents && !resumeRuleEvent) {
      const player = this.requireTurn(command.playerId);
      if (this.state.phase !== "play") throw new Error("当前不能出牌");
      const card = player.hand.find((item) => item.id === command.cardId);
      if (!card) throw new Error("手牌不存在");
      const cardName = effectiveName ?? card.name;
      const definition = this.cards.get(cardName);
      if (!definition) throw new Error("卡牌定义不存在");
      if (cardName === "shan" || cardName === "wuxie")
        throw new Error(`${definition.name}只能用于响应`);
      const normalizedCommand = {
        ...structuredClone(command),
        targetId: undefined,
        targetIds: this.defaultUseCardTargetIds(command, cardName, definition),
      };
      this.queueUseCardRuleEvent("useCard", {
        kind: "useCard",
        stage: "useCard",
        command: normalizedCommand,
        effectiveName: cardName,
        suppressLianying: this.suppressLianying.has(command.cardId),
        directHitTargetIds: [],
        excludedTargetIds: [],
      });
      return;
    }
    const player = this.requireTurn(command.playerId);
    if (this.state.phase !== "play") throw new Error("当前不能出牌");
    const card = this.takeCard(player, command.cardId);
    const cardName = effectiveName ?? card.name;
    const definition = this.cards.get(cardName);
    if (!definition) {
      player.hand.push(card);
      throw new Error("卡牌定义不存在");
    }
    if (definition.type === "equipment") {
      const slot = definition.subtype as EquipmentSlot | undefined;
      if (!slot || slot === ("delayed" as EquipmentSlot)) {
        player.hand.push(card);
        throw new Error("装备牌缺少有效装备栏");
      }
      card.type = definition.type;
      card.subtype = definition.subtype;
      card.range = definition.range;
      const replaced = player.equipment[slot];
      if (replaced) {
        this.state.discard.push(replaced);
        if (player.general.skills.includes("xiaoji"))
          this.queueOptionalDraw(player, "xiaoji", 2);
      }
      player.equipment[slot] = card;
      this.log("card.equip", `${player.name}装备了${definition.name}`);
      return;
    }
    if (cardName === "sha") {
      if (
        this.state.shaUsed &&
        player.equipment.weapon?.name !== "zhuge" &&
        !player.general.skills.includes("paoxiao")
      ) {
        player.hand.push(card);
        throw new Error("本回合已经使用过杀");
      }
      const requestedTargets = command.targetIds?.length
        ? command.targetIds
        : command.targetId
          ? [command.targetId]
          : [];
      if (new Set(requestedTargets).size !== requestedTargets.length) {
        player.hand.push(card);
        throw new Error("杀的目标不能重复");
      }
      if (
        requestedTargets.length > 1 &&
        (player.equipment.weapon?.name !== "fangtian" ||
          player.hand.length !== 0 ||
          requestedTargets.length > 3)
      ) {
        player.hand.push(card);
        throw new Error("仅当杀是最后的手牌时，方天画戟才能指定至多三个目标");
      }
      const targets = requestedTargets.map((id) =>
        this.validTarget(player, id, "other"),
      );
      if (!targets.length) {
        player.hand.push(card);
        throw new Error("杀必须指定目标");
      }
      for (const candidate of targets) {
        if (
          candidate.general.skills.includes("kongcheng") &&
          !candidate.hand.length
        ) {
          player.hand.push(card);
          throw new Error("空城：不能成为杀的目标");
        }
        if (this.distance(player.id, candidate.id) > this.attackRange(player)) {
          player.hand.push(card);
          throw new Error("目标不在攻击范围内");
        }
      }
      this.state.shaUsed = true;
      this.state.discard.push(card);
      const resolvingTargets = targets.filter(
        (target) => !options.excludedTargetIds?.includes(target.id),
      );
      if (!resolvingTargets.length) {
        this.log("card.sha.excluded", `${player.name}使用的杀没有有效目标`);
        return;
      }
      this.beginShaTarget(
        player,
        resolvingTargets[0],
        card,
        resolvingTargets.slice(1).map((item) => item.id),
        "play",
        options.directHitTargetIds,
      );
      this.log("card.sha", `${player.name}使用了杀`);
      this.trigger("afterUseSha", player);
      return;
    }
    if (cardName === "shan" || cardName === "wuxie") {
      player.hand.push(card);
      throw new Error(`${definition.name}只能用于响应`);
    }
    const targetIds =
      command.targetIds ??
      (command.targetId
        ? [command.targetId]
        : this.defaultUseCardTargetIds(command, cardName, definition));
    const selected =
      definition.target === "self"
        ? player
        : this.validTarget(player, targetIds[0], definition.target);
    if (
      selected.general.skills.includes("qianxun") &&
      (cardName === "shunshou" || cardName === "lebu")
    ) {
      player.hand.push(card);
      throw new Error("谦逊：不能成为该锦囊的目标");
    }
    if (
      selected.general.skills.includes("kongcheng") &&
      cardName === "juedou" &&
      !selected.hand.length
    ) {
      player.hand.push(card);
      throw new Error("空城：不能成为决斗的目标");
    }
    if (cardName === "tao" && player.hp >= player.maxHp) {
      player.hand.push(card);
      throw new Error("体力已满，不能使用桃");
    }
    if (definition.type === "trick") {
      this.playTrick(
        card,
        cardName,
        definition,
        player,
        selected,
        targetIds,
        options,
      );
      return;
    }
    if (definition.subtype === "delayed") {
      if (
        selected.judgment.some(
          (item) => (item.virtualName ?? item.name) === cardName,
        )
      ) {
        player.hand.push(card);
        throw new Error("目标判定区已有同名延时锦囊");
      }
      card.virtualName = cardName;
      selected.judgment.push(card);
      this.log(
        "card.delayed",
        `${player.name}对${selected.name}使用了${definition.name}`,
      );
      return;
    }
    if (cardName === "shunshou") {
      if (
        this.distance(player.id, selected.id) > 1 &&
        !player.general.skills.includes("qicai")
      ) {
        player.hand.push(card);
        throw new Error("顺手牵羊的目标距离须为一");
      }
      this.state.discard.push(card);
      const gained = this.removeOneCard(selected);
      if (gained) player.hand.push(gained);
      this.log(
        "card.shunshou",
        `${player.name}对${selected.name}使用了顺手牵羊`,
      );
      return;
    }
    if (cardName === "juedou") {
      this.state.discard.push(card);
      this.state.phase = "response";
      this.state.pending = {
        playerId: selected.id,
        kind: "duel",
        opponentId: player.id,
        sourceId: player.id,
        cardId: card.id,
        resumePhase: "play",
        required: player.general.skills.includes("wushuang") ? 2 : 1,
        answered: 0,
      };
      this.log("card.juedou", `${player.name}对${selected.name}发起决斗`);
      return;
    }
    if (cardName === "nanman" || cardName === "wanjian") {
      this.state.discard.push(card);
      const responders = this.aliveAfter(player.id).filter(
        (id) => id !== player.id,
      );
      if (!responders.length) return;
      this.state.phase = "response";
      this.state.pending = {
        playerId: responders[0],
        kind: cardName,
        sourceId: player.id,
        responders,
        responderIndex: 0,
        resumePhase: "play",
        cardId: card.id,
      };
      this.log(`card.${card.name}`, `${player.name}使用了${definition.name}`);
      return;
    }
    if (cardName === "taoyuan") {
      for (const target of this.state.players.filter((item) => item.alive))
        target.hp = Math.min(target.maxHp, target.hp + 1);
    }
    if (cardName === "wugu") {
      this.state.discard.push(card);
      const responders = [
        player.id,
        ...this.aliveAfter(player.id).filter((id) => id !== player.id),
      ];
      const cards: Card[] = [];
      for (let i = 0; i < responders.length; i++) {
        const revealed = this.takeDeckCard();
        if (revealed) cards.push(revealed);
      }
      if (cards.length) {
        this.state.phase = "response";
        this.state.pending = {
          playerId: responders[0],
          kind: "wugu",
          sourceId: player.id,
          responders,
          responderIndex: 0,
          cards,
        };
        this.log(
          "card.wugu",
          `${player.name}使用五谷丰登，展示${cards.length}张牌`,
        );
      }
      return;
    }
    if (cardName === "jiedao") {
      if (targetIds.length !== 2 || targetIds[0] === targetIds[1]) {
        player.hand.push(card);
        throw new Error("借刀杀人需要选择持武器者和被杀目标");
      }
      const holder = selected;
      const victim = this.validTarget(holder, targetIds[1], "other");
      if (!holder.equipment.weapon) {
        player.hand.push(card);
        throw new Error("借刀杀人的首个目标必须装备武器");
      }
      if (this.distance(holder.id, victim.id) > this.attackRange(holder)) {
        player.hand.push(card);
        throw new Error("被杀目标不在持武器者攻击范围内");
      }
      this.state.discard.push(card);
      this.state.phase = "response";
      this.state.pending = {
        playerId: holder.id,
        kind: "jiedao",
        sourceId: player.id,
        targetId: victim.id,
        resumePhase: "play",
      };
      this.log(
        "card.jiedao",
        `${player.name}令${holder.name}对${victim.name}使用杀`,
      );
      return;
    }
    this.state.discard.push(card);
    this.applyEffects(definition.effects, player, undefined, selected);
    this.log(
      "card.custom",
      `${player.name}使用了${definition.name}${selected.id !== player.id ? `，目标是${selected.name}` : ""}`,
    );
  }
  private queueUseCardRuleEvent(
    stage: UseCardRuleEventName,
    continuation: Extract<
      Extract<PendingResponse, { kind: "externalRuleEvent" }>["continuation"],
      { kind: "useCard" }
    >,
  ) {
    const targetIds = continuation.command.targetIds?.length
      ? continuation.command.targetIds
      : continuation.command.targetId
        ? [continuation.command.targetId]
        : [];
    const event: ExternalRuleEvent = {
      id: `rule-${++this.state.ruleEventSequence!}`,
      name: stage,
      playerId: continuation.command.playerId,
      data: {
        cardId: continuation.command.cardId,
        cardName: continuation.effectiveName,
        sourceId: continuation.command.playerId,
        targetIds: [...targetIds],
        directHitTargetIds: [...continuation.directHitTargetIds],
        excludedTargetIds: [...continuation.excludedTargetIds],
        ...(continuation.targetIndex === undefined
          ? {}
          : {
              targetId: targetIds[continuation.targetIndex],
              targetIndex: continuation.targetIndex,
            }),
      },
    };
    this.state.pending = {
      playerId: continuation.command.playerId,
      kind: "externalRuleEvent",
      event,
      continuation: { ...structuredClone(continuation), stage },
    };
  }
  private continueUseCardRuleEvent(
    continuation: Extract<
      Extract<PendingResponse, { kind: "externalRuleEvent" }>["continuation"],
      { kind: "useCard" }
    >,
    data: Record<string, unknown> | undefined,
    cancelled: boolean,
  ) {
    const cardName = data?.cardName ?? continuation.effectiveName;
    if (
      typeof cardName !== "string" ||
      !cardName.length ||
      cardName.length > 128
    )
      throw new Error("Rule event cardName must be a non-empty string");
    const rawTargets =
      data?.targetIds ??
      continuation.command.targetIds ??
      (continuation.command.targetId ? [continuation.command.targetId] : []);
    if (
      !Array.isArray(rawTargets) ||
      rawTargets.length > 8 ||
      rawTargets.some(
        (targetId) => typeof targetId !== "string" || !targetId.length,
      ) ||
      new Set(rawTargets).size !== rawTargets.length
    )
      throw new Error("Rule event targetIds must contain unique player IDs");
    if (
      data?.cardId !== undefined &&
      data.cardId !== continuation.command.cardId
    )
      throw new Error("Rule event cannot replace the physical card ID");
    if (
      data?.sourceId !== undefined &&
      data.sourceId !== continuation.command.playerId
    )
      throw new Error("Rule event cannot replace the card source");
    const command = {
      ...structuredClone(continuation.command),
      targetId: undefined,
      targetIds: rawTargets as string[],
    };
    const directHitTargetIds = this.ruleEventPlayerIds(
      data?.directHitTargetIds ?? continuation.directHitTargetIds,
      "directHitTargetIds",
    );
    const excludedTargetIds = this.ruleEventPlayerIds(
      data?.excludedTargetIds ?? continuation.excludedTargetIds,
      "excludedTargetIds",
    );
    if (cancelled) {
      const source = this.requireTurn(command.playerId);
      if (continuation.suppressLianying)
        this.suppressLianying.add(command.cardId);
      try {
        this.state.discard.push(this.takeCard(source, command.cardId));
        this.state.phase = "play";
        this.log("card.cancelled", `${source.name}使用的牌被取消`);
      } finally {
        if (continuation.suppressLianying)
          this.suppressLianying.delete(command.cardId);
      }
      return;
    }
    let next: UseCardRuleEventName | undefined;
    let targetIndex = continuation.targetIndex;
    if (continuation.stage === "useCard") next = "useCard1";
    else if (continuation.stage === "useCard1") next = "useCard2";
    else if (continuation.stage === "useCard2" && command.targetIds.length) {
      next = "useCardToTarget";
      targetIndex = 0;
    } else if (continuation.stage === "useCardToTarget")
      next = "useCardToPlayered";
    else if (continuation.stage === "useCardToPlayered")
      next = "useCardToTargeted";
    else if (
      continuation.stage === "useCardToTargeted" &&
      (targetIndex ?? -1) + 1 < command.targetIds.length
    ) {
      next = "useCardToTarget";
      targetIndex = (targetIndex ?? -1) + 1;
    }
    if (next) {
      this.queueUseCardRuleEvent(next, {
        ...continuation,
        command,
        effectiveName: cardName,
        directHitTargetIds,
        excludedTargetIds,
        targetIndex,
      });
      return;
    }
    if (continuation.suppressLianying)
      this.suppressLianying.add(command.cardId);
    try {
      this.useCard(command, cardName, true, {
        directHitTargetIds,
        excludedTargetIds,
      });
    } finally {
      if (continuation.suppressLianying)
        this.suppressLianying.delete(command.cardId);
    }
  }
  private defaultUseCardTargetIds(
    command: Extract<GameCommand, { type: "useCard" }>,
    cardName: string,
    definition: CardDefinition,
  ) {
    if (command.targetIds?.length) return [...command.targetIds];
    if (command.targetId) return [command.targetId];
    if (cardName === "nanman" || cardName === "wanjian")
      return this.aliveAfter(command.playerId).filter(
        (playerId) => playerId !== command.playerId,
      );
    if (cardName === "taoyuan" || cardName === "wugu")
      return [
        command.playerId,
        ...this.aliveAfter(command.playerId).filter(
          (playerId) => playerId !== command.playerId,
        ),
      ];
    return definition.target === "self" ? [command.playerId] : [];
  }
  private ruleEventPlayerIds(value: unknown, field: string) {
    if (
      !Array.isArray(value) ||
      value.length > 8 ||
      value.some(
        (playerId) =>
          typeof playerId !== "string" ||
          !playerId.length ||
          !this.player(playerId, false),
      ) ||
      new Set(value).size !== value.length
    )
      throw new Error(`Rule event ${field} must contain unique player IDs`);
    return value as string[];
  }
  private beginShaTarget(
    player: PlayerState,
    target: PlayerState,
    card: Card,
    remainingTargetIds: string[],
    resumePhase: "play",
    directHitTargetIds: string[] = [],
  ) {
    const liuliTargets = this.state.players.filter(
      (item) =>
        item.alive &&
        item.id !== player.id &&
        item.id !== target.id &&
        this.distance(target.id, item.id) <= this.attackRange(target),
    );
    const liuliCards = this.ownCardIds(target);
    if (
      target.general.skills.includes("liuli") &&
      liuliCards.length &&
      liuliTargets.length
    ) {
      this.state.phase = "response";
      this.state.pending = {
        playerId: target.id,
        kind: "liuli",
        sourceId: player.id,
        card,
        cardIds: liuliCards,
        targetIds: liuliTargets.map((item) => item.id),
        remainingTargetIds,
        resumePhase,
        directHitTargetIds,
      };
      this.log("skill.liuli.wait", `${target.name}可以发动流离转移杀`);
      return;
    }
    this.beginShaDefense(
      player,
      target,
      card,
      remainingTargetIds,
      resumePhase,
      false,
      directHitTargetIds,
    );
  }
  private beginShaDefense(
    player: PlayerState,
    target: PlayerState,
    card: Card,
    remainingTargetIds: string[],
    resumePhase: "play",
    skipTieji = false,
    directHitTargetIds: string[] = [],
  ) {
    if (
      target.equipment.armor?.name === "renwang" &&
      player.equipment.weapon?.name !== "qinggang" &&
      (card.suit === "spade" || card.suit === "club")
    ) {
      this.log("armor.renwang", `${target.name}的仁王盾抵消了黑色杀`);
      const next = this.nextShaPending(
        player,
        remainingTargetIds,
        resumePhase,
        card,
        directHitTargetIds,
      );
      this.resumeState(next, resumePhase);
      return;
    }
    if (directHitTargetIds.includes(target.id)) {
      this.resolveMissedShan({
        playerId: target.id,
        kind: "shan",
        sourceId: player.id,
        cardId: card.id,
        card,
        resumePhase,
        remainingTargetIds,
        directHitTargetIds,
      });
      return;
    }
    if (!skipTieji && player.general.skills.includes("tieji")) {
      this.state.phase = "response";
      this.state.pending = {
        playerId: player.id,
        kind: "judgmentSkill",
        skillId: "tieji",
        context: {
          kind: "tieji",
          ownerId: player.id,
          sourceId: player.id,
          targetId: target.id,
          card,
          remainingTargetIds,
          resumePhase,
          directHitTargetIds,
        },
      };
      return;
    }
    this.state.phase = "response";
    const shaPending: Extract<PendingResponse, { kind: "shan" }> = {
      playerId: target.id,
      kind: "shan",
      sourceId: player.id,
      cardId: card.id,
      card,
      resumePhase,
      required: player.general.skills.includes("wushuang") ? 2 : 1,
      answered: 0,
      remainingTargetIds,
      directHitTargetIds,
    };
    if (
      player.equipment.weapon?.name === "cixiong" &&
      this.genderOf(player) !== this.genderOf(target)
    ) {
      this.state.pending = {
        playerId: target.id,
        kind: "cixiong",
        sourceId: player.id,
        next: shaPending,
      };
      this.log(
        "weapon.cixiong.wait",
        `${target.name}须弃一张手牌，否则${player.name}摸一张牌`,
      );
    } else this.state.pending = shaPending;
  }
  private playTrick(
    card: Card,
    cardName: string,
    definition: CardDefinition,
    source: PlayerState,
    selected: PlayerState,
    targetIds: string[],
    options: CardUseOptions,
  ) {
    if (
      definition.subtype === "delayed" &&
      selected.judgment.some(
        (item) => (item.virtualName ?? item.name) === cardName,
      )
    ) {
      source.hand.push(card);
      throw new Error("目标判定区已有同名延时锦囊");
    }
    if (
      cardName === "shunshou" &&
      this.distance(source.id, selected.id) > 1 &&
      !source.general.skills.includes("qicai")
    ) {
      source.hand.push(card);
      throw new Error("顺手牵羊的目标距离须为一");
    }
    if (
      (cardName === "shunshou" || cardName === "guohe") &&
      !this.selectableOtherCardIds(selected).length
    ) {
      source.hand.push(card);
      throw new Error("目标区域内没有可选择的牌");
    }
    if (cardName === "jiedao") {
      if (targetIds.length !== 2 || targetIds[0] === targetIds[1]) {
        source.hand.push(card);
        throw new Error("借刀杀人需要选择持武器者和被杀目标");
      }
      const holder = selected;
      const victim = this.validTarget(holder, targetIds[1], "other");
      if (!holder.equipment.weapon) {
        source.hand.push(card);
        throw new Error("借刀杀人的首个目标必须装备武器");
      }
      if (this.distance(holder.id, victim.id) > this.attackRange(holder)) {
        source.hand.push(card);
        throw new Error("被杀目标不在持武器者攻击范围内");
      }
    }
    this.state.discard.push(card);
    if (source.general.skills.includes("jizhi")) {
      this.queueOptionalDraw(source, "jizhi", 1);
      this.log("skill.jizhi.wait", `${source.name}可以发动集智摸一张牌`);
    }
    const groupKind = (["nanman", "wanjian", "taoyuan", "wugu"] as const).find(
      (name) => name === cardName,
    );
    const excluded = new Set(options.excludedTargetIds ?? []);
    const groupTargets = groupKind
      ? targetIds
          .filter((id) => !excluded.has(id))
          .map(
            (id) =>
              this.validTarget(
                source,
                id,
                groupKind === "nanman" || groupKind === "wanjian"
                  ? "other"
                  : "any",
              ).id,
          )
      : undefined;
    const groupCards: Card[] | undefined =
      groupKind === "wugu"
        ? groupTargets
            ?.map(() => this.takeDeckCard())
            .filter((item): item is Card => Boolean(item))
        : undefined;
    const resolution: TrickResolution = {
      card,
      cardName,
      sourceId: source.id,
      targetIds:
        groupTargets !== undefined
          ? groupTargets.length
            ? [groupTargets[0]]
            : []
          : (targetIds.length ? targetIds : [selected.id]).filter(
              (id) => !excluded.has(id),
            ),
      groupKind,
      remainingTargetIds: groupTargets?.slice(1),
      groupCards,
      directHitTargetIds: options.directHitTargetIds,
      excludedTargetIds: options.excludedTargetIds,
    };
    if (!resolution.targetIds.length) {
      this.state.phase = "play";
      this.log("card.trick.excluded", `${source.name}使用的锦囊没有有效目标`);
      return;
    }
    this.beginTrickResolution(resolution);
  }
  private beginTrickResolution(resolution: TrickResolution) {
    const source = this.player(resolution.sourceId, false);
    if (!source?.alive) {
      this.state.phase = "play";
      return;
    }
    if (
      resolution.targetIds.some((targetId) =>
        resolution.directHitTargetIds?.includes(targetId),
      )
    ) {
      this.resolveTrick(resolution);
      return;
    }
    const responders = [
      source.id,
      ...this.aliveAfter(source.id).filter((id) => id !== source.id),
    ];
    if (
      responders.some((id) =>
        this.player(id).hand.some((item) => item.name === "wuxie"),
      )
    ) {
      this.state.phase = "response";
      this.state.pending = {
        playerId: responders[0],
        kind: "wuxie",
        responders,
        responderIndex: 0,
        passes: 0,
        negated: false,
        resolution,
      };
      this.log(
        "card.wuxie.wait",
        `${source.name}使用${resolution.card.displayName}，等待无懈可击响应`,
      );
      return;
    }
    this.resolveTrick(resolution);
  }
  private nextTrickPending(resolution: TrickResolution) {
    const remaining = [...(resolution.remainingTargetIds ?? [])];
    while (remaining.length) {
      const targetId = remaining.shift()!;
      if (!this.player(targetId, false)?.alive) continue;
      return {
        playerId: resolution.sourceId,
        kind: "trickNext" as const,
        resolution: {
          ...resolution,
          targetIds: [targetId],
          remainingTargetIds: remaining,
        },
      };
    }
    return undefined;
  }
  private finishTrickTarget(resolution: TrickResolution) {
    const next = this.nextTrickPending(resolution);
    if (
      !next &&
      resolution.groupKind === "wugu" &&
      resolution.groupCards?.length
    )
      this.state.discard.push(...resolution.groupCards.splice(0));
    this.resumeState(next, "play");
  }
  private resolveTrick(resolution: TrickResolution) {
    const source = this.player(resolution.sourceId, false);
    if (!source?.alive) {
      this.state.phase = "play";
      return;
    }
    const cardName = resolution.cardName ?? resolution.card.name;
    const definition = this.cards.get(cardName);
    if (!definition) throw new Error("锦囊定义不存在");
    const selected = this.player(resolution.targetIds[0], false) ?? source;
    const card = resolution.card;
    if (resolution.groupKind === "wugu") {
      if (!resolution.groupCards?.length) {
        this.finishTrickTarget(resolution);
        return;
      }
      this.state.phase = "response";
      this.state.pending = {
        playerId: selected.id,
        kind: "wugu",
        sourceId: source.id,
        responders: [selected.id],
        responderIndex: 0,
        cards: resolution.groupCards,
        card,
        cardName,
        remainingTargetIds: resolution.remainingTargetIds,
        directHitTargetIds: resolution.directHitTargetIds,
        excludedTargetIds: resolution.excludedTargetIds,
      };
      this.log("card.wugu", `${selected.name}从五谷丰登展示牌中选择一张`);
      return;
    }
    if (resolution.groupKind === "taoyuan") {
      selected.hp = Math.min(selected.maxHp, selected.hp + 1);
      this.finishTrickTarget(resolution);
      return;
    }
    if (
      resolution.groupKind === "nanman" ||
      resolution.groupKind === "wanjian"
    ) {
      if (resolution.directHitTargetIds?.includes(selected.id)) {
        this.damage(
          source,
          selected,
          1,
          "play",
          this.nextTrickPending(resolution),
          card.id,
        );
        return;
      }
      this.state.phase = "response";
      this.state.pending = {
        playerId: selected.id,
        kind: resolution.groupKind,
        sourceId: source.id,
        responders: [selected.id],
        responderIndex: 0,
        resumePhase: "play",
        cardId: card.id,
        resumePending: this.nextTrickPending(resolution),
      };
      this.log(
        `card.${resolution.groupKind}`,
        `${source.name}的${definition.name}结算到${selected.name}`,
      );
      return;
    }
    if (definition.subtype === "delayed") {
      const index = this.state.discard.findIndex((item) => item.id === card.id);
      if (index >= 0) this.state.discard.splice(index, 1);
      card.virtualName = cardName;
      selected.judgment.push(card);
      this.state.phase = "play";
      this.log(
        "card.delayed",
        `${source.name}对${selected.name}使用了${definition.name}`,
      );
      return;
    }
    if (cardName === "shunshou" || cardName === "guohe") {
      const cardIds = this.selectableOtherCardIds(selected);
      if (!cardIds.length) {
        this.state.phase = "play";
        return;
      }
      this.state.phase = "response";
      this.state.pending = {
        playerId: source.id,
        kind: "otherCard",
        sourceId: source.id,
        targetId: selected.id,
        cardIds,
        operation: cardName === "shunshou" ? "gain" : "discard",
        resumePhase: "play",
      };
      this.log(
        `card.${card.name}.wait`,
        `${source.name}对${selected.name}使用了${definition.name}，等待选择目标牌`,
      );
      return;
    }
    if (cardName === "juedou") {
      this.state.phase = "response";
      this.state.pending = {
        playerId: selected.id,
        kind: "duel",
        opponentId: source.id,
        sourceId: source.id,
        cardId: card.id,
        resumePhase: "play",
        required: source.general.skills.includes("wushuang") ? 2 : 1,
        answered: 0,
      };
      this.log("card.juedou", `${source.name}对${selected.name}发起决斗`);
      return;
    }
    if (cardName === "nanman" || cardName === "wanjian") {
      const responders = this.aliveAfter(source.id).filter(
        (id) => id !== source.id,
      );
      if (!responders.length) {
        this.state.phase = "play";
        return;
      }
      this.state.phase = "response";
      this.state.pending = {
        playerId: responders[0],
        kind: cardName,
        sourceId: source.id,
        responders,
        responderIndex: 0,
        resumePhase: "play",
        cardId: card.id,
      };
      this.log(`card.${card.name}`, `${source.name}使用了${definition.name}`);
      return;
    }
    if (cardName === "taoyuan")
      for (const target of this.state.players.filter((item) => item.alive))
        target.hp = Math.min(target.maxHp, target.hp + 1);
    if (cardName === "wugu") {
      const responders = [
        source.id,
        ...this.aliveAfter(source.id).filter((id) => id !== source.id),
      ];
      const cards: Card[] = [];
      for (let i = 0; i < responders.length; i++) {
        const revealed = this.takeDeckCard();
        if (revealed) cards.push(revealed);
      }
      if (cards.length) {
        this.state.phase = "response";
        this.state.pending = {
          playerId: responders[0],
          kind: "wugu",
          sourceId: source.id,
          responders,
          responderIndex: 0,
          cards,
        };
        this.log(
          "card.wugu",
          `${source.name}使用五谷丰登，展示${cards.length}张牌`,
        );
      }
      return;
    }
    if (cardName === "jiedao") {
      const holder = selected;
      const victim = this.player(resolution.targetIds[1]);
      this.state.phase = "response";
      this.state.pending = {
        playerId: holder.id,
        kind: "jiedao",
        sourceId: source.id,
        targetId: victim.id,
        resumePhase: "play",
      };
      this.log(
        "card.jiedao",
        `${source.name}令${holder.name}对${victim.name}使用杀`,
      );
      return;
    }
    this.applyEffects(definition.effects, source, undefined, selected);
    if (!this.state.pending) this.state.phase = "play";
    this.log(
      "card.trick",
      `${source.name}使用了${definition.name}${selected.id !== source.id ? `，目标是${selected.name}` : ""}`,
    );
  }
  private activateSkill(
    command: Extract<GameCommand, { type: "activateSkill" }>,
  ) {
    if (this.state.pending?.kind === "customSkill") {
      this.resolveCustomSkillSelection(command);
      return;
    }
    if (this.state.pending?.kind === "jianxiong") {
      const pending = this.state.pending;
      if (
        pending.playerId !== command.playerId ||
        command.skillId !== "jianxiong"
      )
        throw new Error("当前不能发动奸雄");
      const player = this.player(command.playerId);
      const index = this.state.discard.findIndex(
        (card) => card.id === pending.cardId,
      );
      if (index >= 0) player.hand.push(this.state.discard.splice(index, 1)[0]);
      this.log("skill.jianxiong", `${player.name}发动奸雄获得造成伤害的牌`);
      this.resumeDamageTrigger(pending);
      return;
    }
    if (this.state.pending?.kind === "yijiChoice") {
      const pending = this.state.pending;
      if (pending.playerId !== command.playerId || command.skillId !== "yiji")
        throw new Error("当前不能发动遗计");
      const cards: Card[] = [];
      for (let index = 0; index < pending.cardCount; index++) {
        const card = this.takeDeckCard();
        if (card) cards.push(card);
      }
      if (cards.length) {
        this.state.phase = "response";
        this.state.pending = {
          playerId: pending.playerId,
          kind: "yiji",
          cards,
          resumePhase: pending.resumePhase,
          resumePending: pending.resumePending,
        };
        this.log(
          "skill.yiji",
          `${this.player(command.playerId).name}发动遗计展示${cards.length}张牌`,
        );
      } else this.resumeDamageTrigger(pending);
      return;
    }
    if (this.state.pending?.kind === "optionalTrigger") {
      const pending = this.state.pending;
      if (
        pending.playerId !== command.playerId ||
        pending.skillId !== command.skillId
      )
        throw new Error("当前不能发动该触发技能");
      this.draw(this.player(command.playerId), pending.drawCount);
      this.log(
        `skill.${pending.skillId}`,
        `${this.player(command.playerId).name}发动${pending.skillId}`,
      );
      this.resumeOptionalTrigger(pending);
      return;
    }
    if (this.state.pending?.kind === "judgmentSkill") {
      const pending = this.state.pending;
      if (
        pending.playerId !== command.playerId ||
        pending.skillId !== command.skillId
      )
        throw new Error("当前不能发动该判定技能");
      delete this.state.pending;
      this.startJudgment(this.player(command.playerId), pending.context);
      return;
    }
    if (this.state.pending?.kind === "judgment") {
      const pending = this.state.pending;
      if (
        pending.stage !== "tiandu" ||
        pending.playerId !== command.playerId ||
        command.skillId !== "tiandu"
      )
        throw new Error("当前不能发动天妒");
      this.finishJudgment(pending, true);
      return;
    }
    if (this.state.pending?.kind === "liuli") {
      const pending = this.state.pending;
      if (pending.playerId !== command.playerId || command.skillId !== "liuli")
        throw new Error("当前不能发动流离");
      const cardIds = command.cardIds ?? [];
      const targetIds = command.targetIds ?? [];
      if (
        cardIds.length !== 1 ||
        targetIds.length !== 1 ||
        !pending.cardIds.includes(cardIds[0]) ||
        !pending.targetIds.includes(targetIds[0])
      )
        throw new Error("流离需要弃置一张牌并选择合法转移目标");
      const owner = this.player(command.playerId);
      const cost = this.takeOwnCard(owner, cardIds[0]);
      this.state.discard.push(cost);
      const target = this.player(targetIds[0]);
      delete this.state.pending;
      this.log(
        "skill.liuli",
        `${owner.name}发动流离，将杀转移给${target.name}`,
      );
      this.beginShaDefense(
        this.player(pending.sourceId),
        target,
        pending.card,
        pending.remainingTargetIds ?? [],
        pending.resumePhase,
        false,
        pending.directHitTargetIds,
      );
      return;
    }
    if (this.state.pending?.kind === "yiji") {
      const pending = this.state.pending;
      if (pending.playerId !== command.playerId || command.skillId !== "yiji")
        throw new Error("当前不能进行遗计分配");
      const cardIds = command.cardIds ?? [];
      const targetIds = command.targetIds ?? [];
      if (
        !cardIds.length ||
        new Set(cardIds).size !== cardIds.length ||
        targetIds.length !== 1
      )
        throw new Error("遗计需要选择至少一张展示牌和一名获得者");
      const target = this.player(targetIds[0]);
      if (!target.alive) throw new Error("遗计不能分配给阵亡角色");
      const selected = cardIds.map((id) => {
        const index = pending.cards.findIndex((card) => card.id === id);
        if (index < 0) throw new Error("遗计展示牌不存在");
        return pending.cards.splice(index, 1)[0];
      });
      target.hand.push(...selected);
      this.log(
        "skill.yiji.distribute",
        `${this.player(command.playerId).name}将${selected.length}张遗计牌交给${target.name}`,
      );
      if (pending.cards.length) return;
      this.resumeState(pending.resumePending, pending.resumePhase);
      return;
    }
    const player = this.requireTurn(command.playerId);
    if (this.state.pending?.kind === "phaseSkill") {
      const pending = this.state.pending;
      if (pending.playerId !== player.id || pending.skillId !== command.skillId)
        throw new Error("当前不能确认该阶段技能");
      this.resolvePhaseSkill(player, pending, true);
      return;
    }
    if (this.state.pending?.kind === "tuxi" && command.skillId === "tuxi") {
      const pending = this.state.pending;
      const targets = command.targetIds ?? [];
      if (targets.length > 2 || new Set(targets).size !== targets.length)
        throw new Error("突袭至多选择两名不同角色");
      for (const id of targets) {
        const target = this.validTarget(player, id, "other");
        if (!target.hand.length) throw new Error("突袭目标必须有手牌");
      }
      delete this.state.pending;
      for (const id of targets) {
        const target = this.player(id);
        player.hand.push(
          target.hand.splice(this.rng.int(target.hand.length), 1)[0],
        );
      }
      this.log("skill.tuxi", `${player.name}发动突袭获得${targets.length}张牌`);
      this.completeDrawPhase(
        player,
        Math.max(
          0,
          (pending.drawCount ?? this.state.mode.drawPerTurn) +
            (player.general.skills.includes("yingzi") ? 1 : 0) -
            targets.length,
        ),
      );
      return;
    }
    if (this.state.phase !== "play") throw new Error("当前不能发动主动技能");
    const equipmentSkill =
      command.skillId === "zhangba" &&
      player.equipment.weapon?.name === "zhangba";
    if (!this.hasSkill(player, command.skillId) && !equipmentSkill)
      throw new Error("武将没有该技能");
    const customSkill = this.skills.get(command.skillId);
    if (
      customSkill &&
      !customSkill.runtimeOnly &&
      (customSkill.kind ?? "trigger") === "active"
    ) {
      this.startCustomActiveSkill(player, customSkill, command);
      return;
    }
    const cards = command.cardIds ?? [];
    const targets = command.targetIds ?? [];
    const once = (id: string) => {
      const mark = `used.${id}`;
      if (player.marks[mark]) throw new Error("本回合已经发动过该技能");
      player.marks[mark] = 1;
    };
    const convert = (
      expected: string,
      color?: "red" | "black",
      original?: string,
    ) => {
      if (cards.length !== 1) throw new Error("转换技须选择一张牌");
      let card = player.hand.find((item) => item.id === cards[0]);
      let fromEquipment = false;
      if (!card) {
        card = Object.values(player.equipment).find(
          (item) => item?.id === cards[0],
        );
        fromEquipment = Boolean(card);
      }
      if (!card) throw new Error("手牌不存在");
      if (original && card.name !== original)
        throw new Error("所选牌不符合转换要求");
      const isRed = card.suit === "heart" || card.suit === "diamond";
      if (color && (color === "red") !== isRed)
        throw new Error("所选牌颜色不符合技能要求");
      if (fromEquipment) {
        card = this.takeOwnCard(player, card.id);
        player.hand.push(card);
        this.suppressLianying.add(card.id);
      }
      try {
        this.useCard(
          {
            type: "useCard",
            playerId: player.id,
            cardId: card.id,
            targetId: targets[0],
          },
          expected,
        );
      } finally {
        this.suppressLianying.delete(card.id);
      }
    };
    if (command.skillId === "zhangba") {
      if (
        cards.length !== 2 ||
        new Set(cards).size !== 2 ||
        targets.length !== 1
      )
        throw new Error("丈八蛇矛需要使用两张不同手牌并选择一名目标");
      if (this.state.shaUsed && !player.general.skills.includes("paoxiao"))
        throw new Error("本回合已经使用过杀");
      const target = this.validTarget(player, targets[0], "other");
      if (this.distance(player.id, target.id) > this.attackRange(player))
        throw new Error("目标不在攻击范围内");
      this.state.discard.push(...cards.map((id) => this.takeCard(player, id)));
      this.state.shaUsed = true;
      this.state.phase = "response";
      this.state.pending = {
        playerId: target.id,
        kind: "shan",
        sourceId: player.id,
        cardId: "zhangba",
        resumePhase: "play",
        required: player.general.skills.includes("wushuang") ? 2 : 1,
        answered: 0,
      };
      this.log(
        "weapon.zhangba",
        `${player.name}将两张手牌当杀对${target.name}使用`,
      );
      return;
    }
    if (command.skillId === "wusheng") return convert("sha", "red");
    if (command.skillId === "longdan") return convert("sha", undefined, "shan");
    if (command.skillId === "qixi") return convert("guohe", "black");
    if (command.skillId === "guose") {
      const card = [
        ...player.hand,
        ...Object.values(player.equipment).filter((item): item is Card =>
          Boolean(item),
        ),
      ].find((item) => item.id === cards[0]);
      if (card?.suit !== "diamond") throw new Error("国色必须使用方片牌");
      return convert("lebu");
    }
    if (command.skillId === "jijiang") {
      if (player.identity !== "lord") throw new Error("激将仅主公可以发动");
      if (targets.length !== 1) throw new Error("激将需要一名目标");
      if (this.state.shaUsed && !player.general.skills.includes("paoxiao"))
        throw new Error("本回合已经使用过杀");
      const target = this.validTarget(player, targets[0], "other");
      if (this.distance(player.id, target.id) > this.attackRange(player))
        throw new Error("激将目标不在攻击范围内");
      const responders = this.aliveAfter(player.id).filter(
        (id) => id !== player.id && this.player(id).general.faction === "shu",
      );
      if (!responders.length) throw new Error("没有可响应激将的蜀势力角色");
      this.state.phase = "response";
      this.state.pending = {
        playerId: responders[0],
        kind: "jijiang",
        lordId: player.id,
        targetId: target.id,
        responders,
        responderIndex: 0,
        resumePhase: "play",
      };
      this.log(
        "skill.jijiang.wait",
        `${player.name}发动激将，请求蜀势力角色出杀`,
      );
      return;
    }
    if (command.skillId === "zhiheng") {
      if (
        !cards.length ||
        new Set(cards).size !== cards.length ||
        cards.some((id) => !this.ownCardIds(player).includes(id))
      )
        throw new Error("制衡牌数不合法");
      once("zhiheng");
      this.state.discard.push(
        ...cards.map((id) => this.takeOwnCard(player, id)),
      );
      this.draw(player, cards.length);
    } else if (command.skillId === "kurou") {
      player.hp--;
      this.draw(player, 2);
      if (player.hp <= 0) this.enterDying(player, undefined, "play");
    } else if (command.skillId === "rende") {
      if (!cards.length || targets.length !== 1)
        throw new Error("仁德需要手牌和一名目标");
      const target = this.validTarget(player, targets[0], "other");
      target.hand.push(...cards.map((id) => this.takeCard(player, id)));
      const old = player.marks.rende ?? 0;
      player.marks.rende = old + cards.length;
      if (old < 2 && player.marks.rende >= 2)
        player.hp = Math.min(player.maxHp, player.hp + 1);
    } else if (command.skillId === "qingnang") {
      if (cards.length !== 1 || targets.length !== 1)
        throw new Error("青囊需要弃一张手牌并选择目标");
      const target = this.player(targets[0]);
      if (!target.alive || target.hp >= target.maxHp)
        throw new Error("青囊只能令受伤角色回复体力");
      if (!player.hand.some((card) => card.id === cards[0]))
        throw new Error("青囊只能弃置手牌");
      once("qingnang");
      this.state.discard.push(this.takeCard(player, cards[0]));
      target.hp = Math.min(target.maxHp, target.hp + 1);
    } else if (command.skillId === "jieyin") {
      if (
        cards.length !== 2 ||
        new Set(cards).size !== 2 ||
        targets.length !== 1 ||
        cards.some((id) => !player.hand.some((card) => card.id === id))
      )
        throw new Error("结姻需要弃两张手牌并选择目标");
      const target = this.player(targets[0]);
      if (
        !target.alive ||
        target.id === player.id ||
        this.genderOf(target) !== "male" ||
        target.hp >= target.maxHp
      )
        throw new Error("结姻的目标必须是受伤的男性角色");
      once("jieyin");
      this.state.discard.push(...cards.map((id) => this.takeCard(player, id)));
      player.hp = Math.min(player.maxHp, player.hp + 1);
      target.hp = Math.min(target.maxHp, target.hp + 1);
    } else if (command.skillId === "fanjian") {
      if (targets.length !== 1 || !player.hand.length)
        throw new Error("反间需要一名目标和至少一张手牌");
      const target = this.validTarget(player, targets[0], "other");
      once("fanjian");
      const card = player.hand[this.rng.int(player.hand.length)];
      this.state.phase = "response";
      this.state.pending = {
        playerId: target.id,
        kind: "fanjian",
        sourceId: player.id,
        cardId: card.id,
        resumePhase: "play",
      };
      this.log("skill.fanjian.wait", `${target.name}须为反间选择一种花色`);
      return;
    } else if (command.skillId === "lijian") {
      if (
        cards.length !== 1 ||
        targets.length !== 2 ||
        targets[0] === targets[1] ||
        !this.ownCardIds(player).includes(cards[0])
      )
        throw new Error("离间需要弃一张牌并选择两名不同目标");
      const first = this.player(targets[0]);
      const second = this.player(targets[1]);
      if (
        !first.alive ||
        !second.alive ||
        this.genderOf(first) !== "male" ||
        this.genderOf(second) !== "male"
      )
        throw new Error("离间的两名目标必须都是男性角色");
      once("lijian");
      this.state.discard.push(this.takeOwnCard(player, cards[0]));
      this.state.phase = "response";
      this.state.pending = {
        playerId: second.id,
        kind: "duel",
        opponentId: first.id,
        sourceId: player.id,
        cardId: "lijian",
        resumePhase: "play",
        required: first.general.skills.includes("wushuang") ? 2 : 1,
        answered: 0,
      };
    } else throw new Error("该技能不是可主动发动的技能");
    this.log("skill.active", `${player.name}发动了${command.skillId}`);
  }
  private respond(command: Extract<GameCommand, { type: "respond" }>) {
    const pending = this.state.pending;
    if (!pending) throw new Error("当前无需响应");
    if (pending.kind === "jianxiong" || pending.kind === "yijiChoice") {
      if (pending.playerId !== command.playerId || command.cardId)
        throw new Error("当前只能确认发动或放弃伤害触发技能");
      this.log(
        `skill.${pending.kind === "jianxiong" ? "jianxiong" : "yiji"}.skip`,
        `${this.player(command.playerId).name}放弃发动技能`,
      );
      this.resumeDamageTrigger(pending);
      return;
    }
    if (pending.kind === "optionalTrigger") {
      if (pending.playerId !== command.playerId || command.cardId)
        throw new Error("当前只能确认发动或放弃触发技能");
      this.log(
        `skill.${pending.skillId}.skip`,
        `${this.player(command.playerId).name}不发动${pending.skillId}`,
      );
      this.resumeOptionalTrigger(pending);
      return;
    }
    if (pending.kind === "judgmentSkill") {
      if (pending.playerId !== command.playerId || command.cardId)
        throw new Error("当前只能确认发动或放弃判定技能");
      delete this.state.pending;
      this.declineJudgmentSkill(pending);
      return;
    }
    if (pending.kind === "judgment") {
      this.respondJudgment(command, pending);
      return;
    }
    if (pending.kind === "discard") throw new Error("当前需要弃牌");
    if (pending.kind === "dying") {
      this.respondDying(command, pending);
      return;
    }
    if (pending.kind === "duel") {
      this.respondDuel(command, pending);
      return;
    }
    if (pending.kind === "jiedao") {
      this.respondJiedao(command, pending);
      return;
    }
    if (pending.kind === "wuxie") {
      this.respondWuxie(command, pending);
      return;
    }
    if (pending.kind === "qinglong") {
      this.respondQinglong(command, pending);
      return;
    }
    if (pending.kind === "guanshi") {
      if (command.playerId !== pending.playerId)
        throw new Error("尚未轮到该玩家发动贯石斧");
      if (command.cardId) throw new Error("贯石斧需要选择两张牌或放弃发动");
      delete this.state.pending;
      this.state.phase = pending.resumePhase;
      return;
    }
    if (pending.kind === "cixiong") {
      if (command.playerId !== pending.playerId)
        throw new Error("尚未轮到该玩家响应雌雄双股剑");
      const target = this.player(command.playerId);
      if (command.cardId)
        this.state.discard.push(this.takeCard(target, command.cardId));
      else this.draw(this.player(pending.sourceId), 1);
      this.state.pending = pending.next;
      this.state.phase = "response";
      this.log(
        "weapon.cixiong",
        command.cardId
          ? `${target.name}弃置一张手牌`
          : `${target.name}未弃牌，来源摸一张牌`,
      );
      return;
    }
    if (pending.kind === "qilin") {
      if (command.playerId !== pending.playerId)
        throw new Error("尚未轮到该玩家发动麒麟弓");
      if (command.cardId) throw new Error("请直接选择要弃置的坐骑牌");
      this.resumeState(pending.resumePending, pending.resumePhase);
      return;
    }
    if (pending.kind === "hanbing") {
      if (command.playerId !== pending.playerId)
        throw new Error("尚未轮到该玩家发动寒冰剑");
      if (command.cardId) throw new Error("请直接选择寒冰剑弃置的牌");
      const source = this.player(pending.playerId);
      const target = this.player(pending.targetId);
      delete this.state.pending;
      this.damage(
        source,
        target,
        1,
        pending.resumePhase,
        pending.resumePending,
        pending.causeCardId,
      );
      return;
    }
    if (pending.kind === "otherCard")
      throw new Error("请直接选择要获得或弃置的目标牌");
    if (pending.kind === "phaseSkill") {
      if (command.playerId !== pending.playerId)
        throw new Error("尚未轮到该玩家决定阶段技能");
      this.resolvePhaseSkill(this.player(command.playerId), pending, false);
      return;
    }
    if (pending.kind === "liuli") {
      if (command.playerId !== pending.playerId)
        throw new Error("尚未轮到该玩家决定流离");
      delete this.state.pending;
      this.beginShaDefense(
        this.player(pending.sourceId),
        this.player(pending.playerId),
        pending.card,
        pending.remainingTargetIds ?? [],
        pending.resumePhase,
        false,
        pending.directHitTargetIds,
      );
      return;
    }
    if (pending.kind === "fankui") {
      if (command.playerId !== pending.playerId)
        throw new Error("尚未轮到该玩家发动反馈");
      if (command.cardId) throw new Error("请直接选择反馈获得的牌");
      this.resumeState(pending.resumePending, pending.resumePhase);
      return;
    }
    if (pending.kind === "ganglie") {
      if (command.playerId !== pending.playerId)
        throw new Error("尚未轮到该玩家响应刚烈");
      if (command.cardId) throw new Error("刚烈需要弃置两张手牌或选择受伤");
      const victim = this.player(pending.playerId);
      const retaliator = this.player(pending.sourceId);
      delete this.state.pending;
      this.damage(
        retaliator,
        victim,
        1,
        pending.resumePhase,
        pending.resumePending,
      );
      return;
    }
    if (pending.kind === "hujia") {
      this.respondHujia(command, pending);
      return;
    }
    if (pending.kind === "jijiang") {
      this.respondJijiang(command, pending);
      return;
    }
    if (pending.kind === "guanxing") {
      if (command.playerId !== pending.playerId)
        throw new Error("尚未轮到该玩家决定是否发动观星");
      this.state.deck.unshift(...pending.cards);
      delete this.state.pending;
      const player = this.player(command.playerId);
      this.log("skill.guanxing.skip", `${player.name}不发动观星`);
      this.afterPrepare(player);
      return;
    }
    if (pending.kind === "wugu") throw new Error("当前需要从五谷丰登中选牌");
    if (pending.kind === "nanman" || pending.kind === "wanjian") {
      this.respondAoe(command, pending);
      return;
    }
    if (pending.kind !== "shan") throw new Error("未知响应类型");
    if (pending.playerId !== command.playerId)
      throw new Error("当前无需该玩家响应");
    const target = this.player(command.playerId);
    const source = this.player(pending.sourceId);
    if (command.cardId) {
      const card = this.takeCard(target, command.cardId);
      if (!this.canRespondAs(target, card, "shan")) {
        target.hand.push(card);
        this.state.pending = pending;
        throw new Error("必须使用闪响应");
      }
      this.state.discard.push(card);
      this.log("card.shan", `${target.name}使用闪抵消了杀`);
      pending.answered = (pending.answered ?? 0) + 1;
      if (pending.answered < (pending.required ?? 1)) return;
      delete this.state.pending;
      this.afterShanDodged(
        source,
        target,
        pending.resumePhase,
        pending.remainingTargetIds,
        pending.card ?? this.findPhysicalCard(pending.cardId),
        pending.directHitTargetIds,
      );
    } else {
      if (this.hasSkill(target, "hujia")) {
        const responders = this.aliveAfter(target.id).filter(
          (id) => id !== target.id && this.player(id).general.faction === "wei",
        );
        if (responders.length) {
          this.state.pending = {
            playerId: responders[0],
            kind: "hujia",
            lordId: target.id,
            sourceId: source.id,
            cardId: pending.cardId,
            card: pending.card,
            responders,
            responderIndex: 0,
            required: pending.required ?? 1,
            answered: pending.answered ?? 0,
            remainingTargetIds: pending.remainingTargetIds,
            directHitTargetIds: pending.directHitTargetIds,
            resumePhase: pending.resumePhase,
          };
          this.log(
            "skill.hujia.wait",
            `${target.name}发动护驾，请求魏势力角色出闪`,
          );
          return;
        }
      }
      delete this.state.pending;
      if (
        target.equipment.armor?.name === "bagua" &&
        source.equipment.weapon?.name !== "qinggang"
      ) {
        this.state.phase = "response";
        this.state.pending = {
          playerId: target.id,
          kind: "judgmentSkill",
          skillId: "bagua",
          context: {
            kind: "bagua",
            ownerId: target.id,
            shaPending: structuredClone(pending),
          },
        };
        return;
      }
      const resumePending = this.postShaPending(
        source,
        target,
        this.nextShaPending(
          source,
          pending.remainingTargetIds,
          pending.resumePhase,
          pending.card ?? this.findPhysicalCard(pending.cardId),
          pending.directHitTargetIds,
        ),
        pending.resumePhase,
      );
      const hanbingCards = this.selectableOtherCardIds(target);
      if (source.equipment.weapon?.name === "hanbing" && hanbingCards.length) {
        this.state.pending = {
          playerId: source.id,
          kind: "hanbing",
          targetId: target.id,
          cardIds: hanbingCards,
          remaining: 2,
          causeCardId: pending.cardId,
          resumePhase: pending.resumePhase,
          resumePending,
        };
        this.state.phase = "response";
        this.log("weapon.hanbing.wait", `${source.name}可以发动寒冰剑防止伤害`);
        return;
      }
      this.damage(
        source,
        target,
        1,
        pending.resumePhase,
        resumePending,
        pending.cardId,
      );
    }
  }
  private resolveMissedShan(
    pending: Extract<PendingResponse, { kind: "shan" }>,
  ) {
    const source = this.player(pending.sourceId);
    const target = this.player(pending.playerId);
    const resumePending = this.postShaPending(
      source,
      target,
      this.nextShaPending(
        source,
        pending.remainingTargetIds,
        pending.resumePhase,
        pending.card ?? this.findPhysicalCard(pending.cardId),
        pending.directHitTargetIds,
      ),
      pending.resumePhase,
    );
    const hanbingCards = this.selectableOtherCardIds(target);
    if (source.equipment.weapon?.name === "hanbing" && hanbingCards.length) {
      this.state.pending = {
        playerId: source.id,
        kind: "hanbing",
        targetId: target.id,
        cardIds: hanbingCards,
        remaining: 2,
        causeCardId: pending.cardId,
        resumePhase: pending.resumePhase,
        resumePending,
      };
      this.state.phase = "response";
      this.log("weapon.hanbing.wait", `${source.name}可以发动寒冰剑防止伤害`);
      return;
    }
    this.damage(
      source,
      target,
      1,
      pending.resumePhase,
      resumePending,
      pending.cardId,
    );
  }
  private afterShanDodged(
    source: PlayerState,
    target: PlayerState,
    resumePhase: "play",
    remainingTargetIds?: string[],
    card?: Card,
    directHitTargetIds?: string[],
  ) {
    const next = this.nextShaPending(
      source,
      remainingTargetIds,
      resumePhase,
      card ?? this.findPhysicalCard("fangtian"),
      directHitTargetIds,
    );
    if (next) {
      this.log(
        "weapon.fangtian.next",
        `${source.name}的方天画戟杀继续结算下一个目标`,
      );
      this.resumeState(next, resumePhase);
      return;
    }
    if (
      source.equipment.weapon?.name === "qinglong" &&
      [
        ...source.hand,
        ...Object.values(source.equipment).filter((card): card is Card =>
          Boolean(card),
        ),
      ].some((card) => this.canRespondAs(source, card, "sha"))
    ) {
      this.state.phase = "response";
      this.state.pending = {
        playerId: source.id,
        kind: "qinglong",
        targetId: target.id,
        resumePhase,
      };
      this.log(
        "weapon.qinglong.wait",
        `${source.name}可以发动青龙偃月刀继续出杀`,
      );
      return;
    }
    const guanshiCards = this.ownCardIds(source).filter(
      (id) => id !== source.equipment.weapon?.id,
    );
    if (
      source.equipment.weapon?.name === "guanshi" &&
      guanshiCards.length >= 2
    ) {
      this.state.phase = "response";
      this.state.pending = {
        playerId: source.id,
        kind: "guanshi",
        targetId: target.id,
        count: 2,
        cardIds: guanshiCards,
        resumePhase,
      };
      this.log("weapon.guanshi.wait", `${source.name}可以发动贯石斧强制命中`);
      return;
    }
    this.state.phase = resumePhase;
  }
  private nextShaPending(
    source: PlayerState,
    remainingTargetIds: string[] | undefined,
    resumePhase: "play",
    card: Card,
    directHitTargetIds: string[] = [],
  ) {
    const remaining = [...(remainingTargetIds ?? [])];
    while (remaining.length) {
      const target = this.player(remaining.shift()!, false);
      if (!target?.alive) continue;
      return {
        playerId: source.id,
        kind: "shaNext" as const,
        sourceId: source.id,
        targetId: target.id,
        card,
        resumePhase,
        remainingTargetIds: remaining,
        directHitTargetIds,
      };
    }
    return undefined;
  }
  private postShaPending(
    source: PlayerState,
    target: PlayerState,
    resumePending: PendingResponse | undefined,
    resumePhase: "play",
  ): PendingResponse | undefined {
    if (source.equipment.weapon?.name !== "qilin") return resumePending;
    const cardIds = [
      target.equipment.offensiveHorse?.id,
      target.equipment.defensiveHorse?.id,
    ].filter((id): id is string => Boolean(id));
    if (!cardIds.length) return resumePending;
    return {
      playerId: source.id,
      kind: "qilin",
      targetId: target.id,
      cardIds,
      resumePhase,
      resumePending,
    };
  }
  private respondQinglong(
    command: Extract<GameCommand, { type: "respond" }>,
    pending: Extract<PendingResponse, { kind: "qinglong" }>,
  ) {
    if (command.playerId !== pending.playerId)
      throw new Error("尚未轮到该玩家发动青龙偃月刀");
    const source = this.player(command.playerId);
    if (!command.cardId) {
      delete this.state.pending;
      this.state.phase = pending.resumePhase;
      return;
    }
    const card = this.takeResponseCard(source, command.cardId, "sha");
    if (!this.canRespondAs(source, card, "sha")) {
      source.hand.push(card);
      throw new Error("青龙偃月刀必须继续使用杀");
    }
    this.state.discard.push(card);
    const target = this.player(pending.targetId);
    this.state.pending = {
      playerId: target.id,
      kind: "shan",
      sourceId: source.id,
      cardId: card.id,
      resumePhase: pending.resumePhase,
      required: source.general.skills.includes("wushuang") ? 2 : 1,
      answered: 0,
    };
    this.log(
      "weapon.qinglong",
      `${source.name}发动青龙偃月刀，对${target.name}继续使用杀`,
    );
  }
  private chooseCard(playerId: string, cardId: string) {
    const pending = this.state.pending;
    if (pending?.kind === "otherCard") {
      if (pending.playerId !== playerId || !pending.cardIds.includes(cardId))
        throw new Error("当前不能选择该目标牌");
      const target = this.player(pending.targetId);
      const selected = this.removeSelectedOtherCard(target, cardId);
      if (!selected) throw new Error("所选目标牌已经不存在");
      if (pending.operation === "gain")
        this.player(pending.sourceId).hand.push(selected);
      else this.state.discard.push(selected);
      delete this.state.pending;
      this.state.phase = pending.resumePhase;
      this.log(
        `card.${pending.operation}`,
        `${this.player(playerId).name}${pending.operation === "gain" ? "获得" : "弃置"}了${target.name}的一张牌`,
      );
      return;
    }
    if (pending?.kind === "hanbing") {
      if (pending.playerId !== playerId || !pending.cardIds.includes(cardId))
        throw new Error("当前不能通过寒冰剑弃置该牌");
      const target = this.player(pending.targetId);
      const discarded = this.removeSelectedOtherCard(target, cardId);
      if (!discarded) throw new Error("寒冰剑目标牌已经不存在");
      this.state.discard.push(discarded);
      pending.remaining--;
      pending.cardIds = this.selectableOtherCardIds(target);
      this.log(
        "weapon.hanbing.discard",
        `${this.player(playerId).name}发动寒冰剑弃置${target.name}的一张牌`,
      );
      if (pending.remaining > 0 && pending.cardIds.length) return;
      this.resumeState(pending.resumePending, pending.resumePhase);
      return;
    }
    if (pending?.kind === "fankui") {
      if (pending.playerId !== playerId || !pending.cardIds.includes(cardId))
        throw new Error("当前不能通过反馈获得该牌");
      const source = this.player(pending.sourceId);
      let gained: Card | undefined;
      if (cardId === "random-hand") {
        if (source.hand.length)
          gained = source.hand.splice(this.rng.int(source.hand.length), 1)[0];
      } else {
        for (const slot of [
          "weapon",
          "armor",
          "offensiveHorse",
          "defensiveHorse",
        ] as EquipmentSlot[]) {
          if (source.equipment[slot]?.id === cardId) {
            gained = source.equipment[slot];
            delete source.equipment[slot];
            if (source.general.skills.includes("xiaoji"))
              this.queueOptionalDraw(source, "xiaoji", 2);
            break;
          }
        }
      }
      if (!gained) throw new Error("反馈目标牌已经不存在");
      this.player(playerId).hand.push(gained);
      this.resumeState(pending.resumePending, pending.resumePhase);
      this.log(
        "skill.fankui",
        `${this.player(playerId).name}发动反馈获得一张牌`,
      );
      return;
    }
    if (pending?.kind === "qilin") {
      if (pending.playerId !== playerId || !pending.cardIds.includes(cardId))
        throw new Error("当前不能选择该坐骑");
      const target = this.player(pending.targetId);
      for (const slot of [
        "offensiveHorse",
        "defensiveHorse",
      ] as EquipmentSlot[]) {
        if (target.equipment[slot]?.id === cardId) {
          this.state.discard.push(target.equipment[slot]!);
          delete target.equipment[slot];
          break;
        }
      }
      this.resumeState(pending.resumePending, pending.resumePhase);
      this.log(
        "weapon.qilin",
        `${this.player(playerId).name}发动麒麟弓弃置了${target.name}的坐骑`,
      );
      return;
    }
    if (!pending || pending.kind !== "wugu" || pending.playerId !== playerId)
      throw new Error("当前无需选择展示牌");
    const index = pending.cards.findIndex((card) => card.id === cardId);
    if (index < 0) throw new Error("所选展示牌不存在");
    const player = this.player(playerId);
    player.hand.push(pending.cards.splice(index, 1)[0]);
    this.log("card.wugu.choose", `${player.name}从五谷丰登中获得一张牌`);
    if (pending.remainingTargetIds !== undefined) {
      if (!pending.card || !pending.cardName)
        throw new Error("五谷丰登连续结算信息缺失");
      delete this.state.pending;
      this.finishTrickTarget({
        card: pending.card,
        cardName: pending.cardName,
        sourceId: pending.sourceId,
        targetIds: [playerId],
        groupKind: "wugu",
        remainingTargetIds: pending.remainingTargetIds,
        groupCards: pending.cards,
        directHitTargetIds: pending.directHitTargetIds,
        excludedTargetIds: pending.excludedTargetIds,
      });
      return;
    }
    pending.responderIndex++;
    while (
      pending.responderIndex < pending.responders.length &&
      !this.player(pending.responders[pending.responderIndex], false)?.alive
    )
      pending.responderIndex++;
    if (
      pending.responderIndex < pending.responders.length &&
      pending.cards.length
    ) {
      pending.playerId = pending.responders[pending.responderIndex];
      return;
    }
    this.state.discard.push(...pending.cards.splice(0));
    delete this.state.pending;
    this.state.phase = "play";
  }
  private chooseSuit(playerId: string, suit: Suit) {
    const pending = this.state.pending;
    if (!pending || pending.kind !== "fanjian" || pending.playerId !== playerId)
      throw new Error("当前无需选择花色");
    const source = this.player(pending.sourceId);
    const target = this.player(playerId);
    const card = this.takeCard(source, pending.cardId);
    target.hand.push(card);
    delete this.state.pending;
    this.log(
      "skill.fanjian.reveal",
      `${target.name}选择${suit}，获得的牌为${card.suit}`,
    );
    if (card.suit !== suit) this.damage(source, target, 1, pending.resumePhase);
    else this.state.phase = pending.resumePhase;
  }
  private arrangeCards(
    playerId: string,
    topIds: string[],
    bottomIds: string[],
  ) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.kind !== "guanxing" ||
      pending.playerId !== playerId
    )
      throw new Error("当前无需排列观星牌");
    const allIds = [...topIds, ...bottomIds];
    if (
      allIds.length !== pending.cards.length ||
      new Set(allIds).size !== allIds.length ||
      pending.cards.some((card) => !allIds.includes(card.id))
    )
      throw new Error("观星必须且只能排列全部展示牌");
    const byId = new Map(pending.cards.map((card) => [card.id, card]));
    this.state.deck.unshift(...topIds.map((id) => byId.get(id)!));
    this.state.deck.push(...bottomIds.map((id) => byId.get(id)!));
    delete this.state.pending;
    this.log("skill.guanxing", `${this.player(playerId).name}完成观星排列`);
    this.afterPrepare(this.player(playerId));
  }
  private respondWuxie(
    command: Extract<GameCommand, { type: "respond" }>,
    pending: Extract<PendingResponse, { kind: "wuxie" }>,
  ) {
    if (command.playerId !== pending.playerId)
      throw new Error("尚未轮到该玩家响应无懈可击");
    const player = this.player(command.playerId);
    if (command.cardId) {
      const card = this.takeCard(player, command.cardId);
      if (card.name !== "wuxie") {
        player.hand.push(card);
        throw new Error("必须使用无懈可击响应");
      }
      this.state.discard.push(card);
      pending.negated = !pending.negated;
      pending.passes = 0;
      this.log(
        "card.wuxie",
        `${player.name}使用无懈可击，锦囊效果${pending.negated ? "暂时无效" : "重新生效"}`,
      );
    } else pending.passes++;
    const alive = pending.responders.filter(
      (id) => this.player(id, false)?.alive,
    );
    if (!alive.length || pending.passes >= alive.length) {
      const resolution = pending.resolution;
      const negated = pending.negated;
      delete this.state.pending;
      if (negated) {
        this.log(
          "card.wuxie.cancel",
          `${resolution.card.displayName}的效果被抵消`,
        );
        if (resolution.groupKind) this.finishTrickTarget(resolution);
        else this.state.phase = "play";
      } else this.resolveTrick(resolution);
      return;
    }
    for (let offset = 1; offset <= pending.responders.length; offset++) {
      const index =
        (pending.responderIndex + offset) % pending.responders.length;
      if (this.player(pending.responders[index], false)?.alive) {
        pending.responderIndex = index;
        pending.playerId = pending.responders[index];
        return;
      }
    }
  }
  private respondJiedao(
    command: Extract<GameCommand, { type: "respond" }>,
    pending: Extract<PendingResponse, { kind: "jiedao" }>,
  ) {
    if (command.playerId !== pending.playerId)
      throw new Error("尚未轮到该玩家响应借刀杀人");
    const holder = this.player(pending.playerId);
    const victim = this.player(pending.targetId);
    if (command.cardId) {
      const card = this.takeResponseCard(holder, command.cardId, "sha");
      if (!this.canRespondAs(holder, card, "sha")) {
        holder.hand.push(card);
        throw new Error("借刀杀人必须使用杀响应");
      }
      this.state.discard.push(card);
      this.state.pending = {
        playerId: victim.id,
        kind: "shan",
        sourceId: holder.id,
        cardId: card.id,
        resumePhase: pending.resumePhase,
        required: holder.general.skills.includes("wushuang") ? 2 : 1,
        answered: 0,
      };
      this.log(
        "card.jiedao.sha",
        `${holder.name}响应借刀杀人，对${victim.name}使用杀`,
      );
      return;
    }
    const weapon = holder.equipment.weapon;
    if (weapon) {
      delete holder.equipment.weapon;
      this.player(pending.sourceId).hand.push(weapon);
      if (holder.general.skills.includes("xiaoji"))
        this.queueOptionalDraw(holder, "xiaoji", 2);
    }
    delete this.state.pending;
    this.state.phase = pending.resumePhase;
    this.log("card.jiedao.weapon", `${holder.name}未出杀，交出了武器`);
  }
  private respondHujia(
    command: Extract<GameCommand, { type: "respond" }>,
    pending: Extract<PendingResponse, { kind: "hujia" }>,
  ) {
    if (command.playerId !== pending.playerId)
      throw new Error("尚未轮到该玩家响应护驾");
    const ally = this.player(command.playerId);
    if (command.cardId) {
      const card = this.takeCard(ally, command.cardId);
      if (!this.canRespondAs(ally, card, "shan")) {
        ally.hand.push(card);
        throw new Error("护驾必须打出闪");
      }
      this.state.discard.push(card);
      pending.answered++;
      this.log("skill.hujia", `${ally.name}响应护驾打出闪`);
      if (pending.answered >= pending.required) {
        delete this.state.pending;
        this.afterShanDodged(
          this.player(pending.sourceId),
          this.player(pending.lordId),
          pending.resumePhase,
          pending.remainingTargetIds,
          pending.card ?? this.findPhysicalCard(pending.cardId),
          pending.directHitTargetIds,
        );
        return;
      }
      pending.responderIndex = 0;
      pending.playerId = pending.responders[0];
      return;
    }
    pending.responderIndex++;
    if (pending.responderIndex < pending.responders.length) {
      pending.playerId = pending.responders[pending.responderIndex];
      return;
    }
    const lord = this.player(pending.lordId);
    const source = this.player(pending.sourceId);
    delete this.state.pending;
    const shaPending: Extract<PendingResponse, { kind: "shan" }> = {
      playerId: lord.id,
      kind: "shan",
      sourceId: source.id,
      cardId: pending.cardId,
      card: pending.card ?? this.findPhysicalCard(pending.cardId),
      required: pending.required,
      answered: pending.answered,
      remainingTargetIds: pending.remainingTargetIds,
      directHitTargetIds: pending.directHitTargetIds,
      resumePhase: pending.resumePhase,
    };
    if (
      lord.equipment.armor?.name === "bagua" &&
      source.equipment.weapon?.name !== "qinggang"
    ) {
      this.state.phase = "response";
      this.state.pending = {
        playerId: lord.id,
        kind: "judgmentSkill",
        skillId: "bagua",
        context: { kind: "bagua", ownerId: lord.id, shaPending },
      };
      return;
    }
    this.resolveMissedShan(shaPending);
  }
  private respondJijiang(
    command: Extract<GameCommand, { type: "respond" }>,
    pending: Extract<PendingResponse, { kind: "jijiang" }>,
  ) {
    if (command.playerId !== pending.playerId)
      throw new Error("尚未轮到该玩家响应激将");
    const ally = this.player(command.playerId);
    if (command.cardId) {
      const card = this.takeResponseCard(ally, command.cardId, "sha");
      if (!this.canRespondAs(ally, card, "sha")) {
        ally.hand.push(card);
        throw new Error("激将必须打出杀");
      }
      this.state.discard.push(card);
      const lord = this.player(pending.lordId);
      const target = this.player(pending.targetId);
      this.state.shaUsed = true;
      this.state.pending = {
        playerId: target.id,
        kind: "shan",
        sourceId: lord.id,
        cardId: card.id,
        resumePhase: pending.resumePhase,
        required: lord.general.skills.includes("wushuang") ? 2 : 1,
        answered: 0,
      };
      this.log("skill.jijiang", `${ally.name}响应激将，为${lord.name}打出杀`);
      return;
    }
    pending.responderIndex++;
    if (pending.responderIndex < pending.responders.length) {
      pending.playerId = pending.responders[pending.responderIndex];
      return;
    }
    delete this.state.pending;
    this.state.phase = pending.resumePhase;
    this.log("skill.jijiang.fail", "没有蜀势力角色响应激将");
  }
  private respondDuel(
    command: Extract<GameCommand, { type: "respond" }>,
    pending: Extract<PendingResponse, { kind: "duel" }>,
  ) {
    if (pending.playerId !== command.playerId)
      throw new Error("尚未轮到该玩家响应决斗");
    const responder = this.player(command.playerId);
    if (command.cardId) {
      const card = this.takeResponseCard(responder, command.cardId, "sha");
      if (!this.canRespondAs(responder, card, "sha")) {
        responder.hand.push(card);
        throw new Error("决斗必须打出杀");
      }
      this.state.discard.push(card);
      pending.answered = (pending.answered ?? 0) + 1;
      if (pending.answered < (pending.required ?? 1)) return;
      const previous = pending.playerId;
      pending.playerId = pending.opponentId;
      pending.opponentId = previous;
      pending.answered = 0;
      pending.required = responder.general.skills.includes("wushuang") ? 2 : 1;
      this.log("card.duel.sha", `${responder.name}在决斗中打出杀`);
      return;
    }
    delete this.state.pending;
    const attacker = this.player(pending.opponentId);
    this.damage(
      attacker,
      responder,
      1,
      pending.resumePhase,
      undefined,
      pending.cardId,
    );
  }
  private respondAoe(
    command: Extract<GameCommand, { type: "respond" }>,
    pending: Extract<PendingResponse, { kind: "nanman" | "wanjian" }>,
  ) {
    if (pending.playerId !== command.playerId)
      throw new Error("尚未轮到该玩家响应群体锦囊");
    const target = this.player(command.playerId);
    const required = pending.kind === "nanman" ? "sha" : "shan";
    if (command.cardId) {
      const card = this.takeResponseCard(target, command.cardId, required);
      if (!this.canRespondAs(target, card, required)) {
        target.hand.push(card);
        throw new Error(`必须打出${required === "sha" ? "杀" : "闪"}`);
      }
      this.state.discard.push(card);
      this.log(
        "card.aoe.respond",
        `${target.name}响应了${pending.kind === "nanman" ? "南蛮入侵" : "万箭齐发"}`,
      );
    }
    const next = structuredClone(pending);
    next.responderIndex++;
    while (
      next.responderIndex < next.responders.length &&
      !this.player(next.responders[next.responderIndex], false)?.alive
    )
      next.responderIndex++;
    if (next.responderIndex < next.responders.length)
      next.playerId = next.responders[next.responderIndex];
    delete this.state.pending;
    const continuation =
      next.responderIndex < next.responders.length
        ? next
        : pending.resumePending;
    if (!command.cardId) {
      this.damage(
        this.player(pending.sourceId),
        target,
        1,
        pending.resumePhase,
        continuation,
        pending.cardId,
      );
      return;
    }
    this.resumeState(continuation, pending.resumePhase);
  }
  private endTurn(playerId: string) {
    this.requireTurn(playerId);
    if (this.state.phase !== "play") throw new Error("尚有响应等待处理");
    const player = this.player(playerId);
    if (player.general.skills.includes("keji") && !this.state.shaUsed) {
      this.state.phase = "discard";
      this.state.pending = {
        playerId,
        kind: "phaseSkill",
        skillId: "keji",
        continuation: "discard",
      };
      this.log("skill.keji.wait", `${player.name}可以发动克己跳过弃牌阶段`);
      return;
    }
    this.beginDiscard(player);
  }
  private beginDiscard(player: PlayerState) {
    this.state.phase = "discard";
    if (this.consumeSkippedPhase(player, "discard")) {
      this.log("phase.discard.skipped", `${player.name}跳过弃牌阶段`);
      this.finishTurn(player);
      return;
    }
    this.log("phase.discard", `${player.name}进入弃牌阶段`);
    this.trigger("discardPhaseStart", player);
    if (this.state.pending || this.state.status !== "playing") return;
    const handLimit = Math.max(
      0,
      player.hp + this.modifierTotal(player, "handLimit"),
    );
    const excess = Math.max(0, player.hand.length - handLimit);
    if (excess) {
      this.state.pending = {
        playerId: player.id,
        kind: "discard",
        count: excess,
      };
      return;
    }
    this.finishTurn(player);
  }
  private discardCards(playerId: string, cardIds: string[]) {
    const pending = this.state.pending;
    if (pending?.kind === "ganglie") {
      if (pending.playerId !== playerId)
        throw new Error("尚未轮到该玩家响应刚烈");
      if (cardIds.length !== 2 || new Set(cardIds).size !== 2)
        throw new Error("刚烈必须弃置两张不同手牌");
      const player = this.player(playerId);
      this.state.discard.push(
        ...cardIds.map((id) => this.takeCard(player, id)),
      );
      this.resumeState(pending.resumePending, pending.resumePhase);
      this.log("skill.ganglie.discard", `${player.name}弃置两张手牌响应刚烈`);
      return;
    }
    if (pending?.kind === "guanshi") {
      if (pending.playerId !== playerId)
        throw new Error("尚未轮到该玩家发动贯石斧");
      if (
        cardIds.length !== 2 ||
        new Set(cardIds).size !== 2 ||
        cardIds.some((id) => !pending.cardIds.includes(id))
      )
        throw new Error("贯石斧必须弃置两张不同的牌");
      const source = this.player(playerId);
      const cards = cardIds.map((id) => this.takeOwnCard(source, id));
      this.state.discard.push(...cards);
      const target = this.player(pending.targetId);
      delete this.state.pending;
      this.log("weapon.guanshi", `${source.name}弃置两张牌发动贯石斧`);
      this.damage(source, target, 1, pending.resumePhase);
      return;
    }
    if (!pending || pending.kind !== "discard" || pending.playerId !== playerId)
      throw new Error("当前无需弃牌");
    if (
      cardIds.length !== pending.count ||
      new Set(cardIds).size !== cardIds.length
    )
      throw new Error(`必须弃置 ${pending.count} 张不同的牌`);
    const player = this.player(playerId);
    const cards = cardIds.map((id) => this.takeCard(player, id));
    this.state.discard.push(...cards);
    this.log("phase.discard.cards", `${player.name}弃置了${cards.length}张牌`);
    delete this.state.pending;
    this.finishTurn(player);
  }
  private finishTurn(player: PlayerState) {
    this.state.phase = "end";
    if (this.consumeSkippedPhase(player, "end")) {
      this.log("phase.end.skipped", `${player.name}跳过结束阶段`);
      this.advanceTurn(player);
      return;
    }
    this.log("phase.end", `${player.name}的结束阶段`);
    this.trigger("turnEnd", player);
    if (this.state.pending || this.state.status !== "playing") return;
    if (player.general.skills.includes("biyue")) {
      this.state.pending = {
        playerId: player.id,
        kind: "phaseSkill",
        skillId: "biyue",
        continuation: "end",
      };
      this.log("skill.biyue.wait", `${player.name}可以发动闭月摸一张牌`);
      return;
    }
    this.advanceTurn(player);
  }
  private advanceTurn(player: PlayerState) {
    const alive = this.state.players.filter((item) => item.alive);
    const index = alive.findIndex((item) => item.id === player.id);
    const next = alive[(index + 1 + alive.length) % alive.length];
    this.state.currentPlayerId = next.id;
    this.state.turn++;
    this.beginTurn(next);
  }
  private beginTurn(player: PlayerState) {
    for (const [id, duration] of Object.entries(player.grantedSkills))
      if (duration === "turn") delete player.grantedSkills[id];
    for (const mark of Object.keys(player.marks))
      if (mark.startsWith("used.") || mark === "rende")
        delete player.marks[mark];
    this.state.shaUsed = false;
    this.state.phase = "prepare";
    this.log("phase.prepare", `${player.name}的准备阶段`);
    this.trigger("turnStart", player);
    if (player.general.skills.includes("guanxing")) {
      const count = Math.min(
        5,
        this.state.players.filter((item) => item.alive).length,
        this.state.deck.length,
      );
      const cards = this.state.deck.splice(0, count);
      if (cards.length) {
        this.state.pending = { playerId: player.id, kind: "guanxing", cards };
        this.log(
          "skill.guanxing.wait",
          `${player.name}发动观星查看${count}张牌`,
        );
        return;
      }
    }
    this.afterPrepare(player);
  }
  private afterPrepare(player: PlayerState) {
    if (player.general.skills.includes("luoshen")) {
      this.state.pending = {
        playerId: player.id,
        kind: "judgmentSkill",
        skillId: "luoshen",
        context: { kind: "luoshen", ownerId: player.id },
      };
      this.log("skill.luoshen.wait", `${player.name}可以发动洛神`);
      return;
    }
    if (this.state.pending || this.state.status !== "playing") return;
    this.state.phase = "judge";
    if (this.consumeSkippedPhase(player, "judge")) {
      this.log("phase.judge.skipped", `${player.name}跳过判定阶段`);
      this.beginDrawPhase(player);
      return;
    }
    this.log("phase.judge", `${player.name}的判定阶段`);
    this.resolveJudgment(player);
    if (this.state.pending || this.state.status !== "playing") return;
    this.beginDrawPhase(player);
  }
  private beginDrawPhase(player: PlayerState) {
    this.state.phase = "draw";
    if (this.consumeSkippedPhase(player, "draw")) {
      this.log("phase.draw.skipped", `${player.name}跳过摸牌阶段`);
      this.completeDrawPhase(player, 0, false);
      return;
    }
    this.log("phase.draw", `${player.name}的摸牌阶段`);
    if (this.state.externalRuleEvents) {
      const event: ExternalRuleEvent = {
        id: `rule-${++this.state.ruleEventSequence!}`,
        name: "phaseDrawBegin2",
        playerId: player.id,
        data: { num: this.state.mode.drawPerTurn, numFixed: false },
      };
      this.state.pending = {
        playerId: player.id,
        kind: "externalRuleEvent",
        event,
        continuation: { kind: "draw" },
      };
      return;
    }
    this.continueDrawPhase(player, this.state.mode.drawPerTurn, false);
  }
  private continueDrawPhase(
    player: PlayerState,
    drawCount: number,
    cancelled: boolean,
  ) {
    if (cancelled) {
      this.completeDrawPhase(player, 0, false);
      return;
    }
    if (player.general.skills.includes("tuxi")) {
      this.state.pending = {
        playerId: player.id,
        kind: "tuxi",
        maxTargets: 2,
        drawCount,
      };
      this.log("skill.tuxi.wait", `${player.name}可以发动突袭选择至多两名角色`);
      return;
    }
    const drawSkills = (["luoyi", "yingzi"] as const).filter((skill) =>
      player.general.skills.includes(skill),
    );
    if (drawSkills.length) {
      this.state.pending = {
        playerId: player.id,
        kind: "phaseSkill",
        skillId: drawSkills[0],
        continuation: "draw",
        remainingSkills: drawSkills.slice(1),
        drawCount,
      };
      this.log("skill.phase.wait", `${player.name}可以发动${drawSkills[0]}`);
      return;
    }
    this.completeDrawPhase(player, drawCount);
  }
  private continueJudgmentPhase(player: PlayerState) {
    this.state.phase = "judge";
    this.resolveJudgment(player);
    if (this.state.pending || this.state.status !== "playing") return;
    this.beginDrawPhase(player);
  }
  private resolvePhaseSkill(
    player: PlayerState,
    pending: Extract<PendingResponse, { kind: "phaseSkill" }>,
    accepted: boolean,
  ) {
    delete this.state.pending;
    this.log(
      accepted ? `skill.${pending.skillId}` : `skill.${pending.skillId}.skip`,
      `${player.name}${accepted ? "发动" : "不发动"}${pending.skillId}`,
    );
    if (pending.continuation === "draw") {
      let count = pending.drawCount ?? this.state.mode.drawPerTurn;
      if (accepted && pending.skillId === "luoyi") {
        count = Math.max(0, count - 1);
        player.marks.luoyi = 1;
      }
      if (accepted && pending.skillId === "yingzi") count++;
      const remaining = pending.remainingSkills ?? [];
      if (remaining.length) {
        this.state.pending = {
          playerId: player.id,
          kind: "phaseSkill",
          skillId: remaining[0],
          continuation: "draw",
          remainingSkills: remaining.slice(1),
          drawCount: count,
        };
        return;
      }
      this.completeDrawPhase(player, count);
      return;
    }
    if (pending.continuation === "discard") {
      if (accepted) this.finishTurn(player);
      else this.beginDiscard(player);
      return;
    }
    if (accepted) this.draw(player, 1);
    this.advanceTurn(player);
  }
  private completeDrawPhase(
    player: PlayerState,
    count: number,
    applyModifier = true,
  ) {
    this.draw(
      player,
      Math.max(
        0,
        count + (applyModifier ? this.modifierTotal(player, "drawCount") : 0),
      ),
    );
    this.state.phase = "play";
    this.log("phase.play", `${player.name}的出牌阶段`);
    if (this.consumeSkippedPhase(player, "play") || player.marks.skipPlay) {
      delete player.marks.skipPlay;
      this.log("phase.play.skipped", `${player.name}跳过出牌阶段`);
      this.endTurn(player.id);
      return;
    }
    this.trigger("playPhaseStart", player);
    if (this.state.pending || this.state.status !== "playing") return;
  }
  private consumeSkippedPhase(
    player: PlayerState,
    phase: "judge" | "draw" | "play" | "discard" | "end",
  ) {
    const key = `skipPhase.${phase}`;
    if (!player.marks[key]) return false;
    delete player.marks[key];
    return true;
  }
  private resolveJudgment(player: PlayerState) {
    const delayed = player.judgment.shift();
    if (!delayed) return;
    this.startJudgment(player, {
      kind: "delayed",
      ownerId: player.id,
      delayed,
    });
  }
  private damage(
    source: PlayerState | undefined,
    target: PlayerState,
    amount: number,
    resumePhase: "play",
    resumePending?: PendingResponse,
    causeCardId?: string,
  ) {
    const actualAmount = amount + (source?.marks.luoyi ? 1 : 0);
    if (this.state.externalRuleEvents) {
      this.queueDamageRuleEvent("damageBegin1", {
        kind: "damage",
        stage: "damageBegin1",
        sourceId: source?.id,
        targetId: target.id,
        amount: actualAmount,
        resumePhase,
        resumePending,
        causeCardId,
      });
      return;
    }
    this.finishDamage(
      source,
      target,
      actualAmount,
      resumePhase,
      resumePending,
      causeCardId,
    );
  }
  private queueDamageRuleEvent(
    stage: DamageRuleEventName,
    continuation: Extract<
      Extract<PendingResponse, { kind: "externalRuleEvent" }>["continuation"],
      { kind: "damage" }
    >,
  ) {
    const event: ExternalRuleEvent = {
      id: `rule-${++this.state.ruleEventSequence!}`,
      name: stage,
      playerId: continuation.targetId,
      data: {
        num: continuation.amount,
        sourceId: continuation.sourceId,
        targetId: continuation.targetId,
        cardId: continuation.causeCardId,
      },
    };
    this.state.pending = {
      playerId: continuation.targetId,
      kind: "externalRuleEvent",
      event,
      continuation: { ...structuredClone(continuation), stage },
    };
  }
  private continueDamageRuleEvent(
    continuation: Extract<
      Extract<PendingResponse, { kind: "externalRuleEvent" }>["continuation"],
      { kind: "damage" }
    >,
    amount: number,
    cancelled: boolean,
  ) {
    const preDamageStages = [
      "damageBegin1",
      "damageBegin2",
      "damageBegin3",
      "damageBegin4",
    ] as const;
    const preIndex = preDamageStages.indexOf(
      continuation.stage as (typeof preDamageStages)[number],
    );
    if (preIndex >= 0) {
      if (cancelled || amount === 0) {
        this.log(
          "damage.cancelled",
          `${this.player(continuation.targetId).name}的伤害被取消`,
        );
        this.resumeState(continuation.resumePending, continuation.resumePhase);
        return;
      }
      const next = preDamageStages[preIndex + 1];
      if (next) {
        this.queueDamageRuleEvent(next, { ...continuation, amount });
        return;
      }
      const source = continuation.sourceId
        ? this.player(continuation.sourceId, false)
        : undefined;
      const target = this.player(continuation.targetId);
      target.hp -= amount;
      this.log(
        "damage",
        `${target.name}受到${source?.name ?? "无来源"}造成的${amount}点伤害`,
      );
      this.queueDamageRuleEvent("damageSource", { ...continuation, amount });
      return;
    }
    if (amount !== continuation.amount || cancelled)
      throw new Error("Resolved damage events cannot change or cancel damage");
    if (continuation.stage === "damageSource") {
      this.queueDamageRuleEvent("damageEnd", continuation);
      return;
    }
    this.finishDamage(
      continuation.sourceId
        ? this.player(continuation.sourceId, false)
        : undefined,
      this.player(continuation.targetId),
      continuation.amount,
      continuation.resumePhase,
      continuation.resumePending,
      continuation.causeCardId,
      true,
    );
  }
  private finishDamage(
    source: PlayerState | undefined,
    target: PlayerState,
    actualAmount: number,
    resumePhase: "play",
    resumePending?: PendingResponse,
    causeCardId?: string,
    alreadyApplied = false,
  ) {
    if (!alreadyApplied) {
      target.hp -= actualAmount;
      this.log(
        "damage",
        `${target.name}受到${source?.name ?? "无来源"}造成的${actualAmount}点伤害`,
      );
    }
    this.trigger("afterDamage", target, source);
    let postDamagePending = resumePending;
    if (target.general.skills.includes("yiji")) {
      postDamagePending = {
        playerId: target.id,
        kind: "yijiChoice",
        cardCount: actualAmount * 2,
        resumePhase,
        resumePending: postDamagePending,
      };
    }
    if (source?.alive && target.general.skills.includes("ganglie")) {
      postDamagePending = {
        playerId: target.id,
        kind: "judgmentSkill",
        skillId: "ganglie",
        context: {
          kind: "ganglie",
          ownerId: target.id,
          sourceId: source.id,
          resumePhase,
          resumePending: postDamagePending,
        },
      };
    }
    if (source?.alive && target.general.skills.includes("fankui")) {
      const cardIds = [
        ...(source.hand.length ? ["random-hand"] : []),
        ...Object.values(source.equipment)
          .filter((card): card is Card => Boolean(card))
          .map((card) => card.id),
      ];
      if (cardIds.length)
        postDamagePending = {
          playerId: target.id,
          kind: "fankui",
          sourceId: source.id,
          cardIds,
          resumePhase,
          resumePending: postDamagePending,
        };
    }
    if (
      target.general.skills.includes("jianxiong") &&
      causeCardId &&
      this.state.discard.some((card) => card.id === causeCardId)
    ) {
      postDamagePending = {
        playerId: target.id,
        kind: "jianxiong",
        cardId: causeCardId,
        resumePhase,
        resumePending: postDamagePending,
      };
    }
    if (target.hp <= 0)
      this.enterDying(target, source, resumePhase, postDamagePending);
    else this.resumeState(postDamagePending, resumePhase);
  }
  private enterDying(
    target: PlayerState,
    source: PlayerState | undefined,
    resumePhase: "play",
    resumePending?: PendingResponse,
  ) {
    const alive = this.state.players.filter((item) => item.alive);
    const index = alive.findIndex((item) => item.id === target.id);
    const responders = Array.from(
      { length: alive.length },
      (_, offset) => alive[(index + offset) % alive.length].id,
    );
    this.state.phase = "dying";
    this.state.pending = {
      playerId: target.id,
      kind: "dying",
      sourceId: source?.id,
      responders,
      responderIndex: 0,
      resumePhase,
      resumePending,
    };
    this.log("player.dying", `${target.name}进入濒死状态`);
  }
  private respondDying(
    command: Extract<GameCommand, { type: "respond" }>,
    pending: Extract<PendingResponse, { kind: "dying" }>,
  ) {
    const responderId = pending.responders[pending.responderIndex];
    if (command.playerId !== responderId) throw new Error("尚未轮到该玩家救援");
    const responder = this.player(responderId);
    const dying = this.player(pending.playerId);
    if (command.cardId) {
      const card = this.takeResponseCard(responder, command.cardId, "tao");
      if (!this.canRespondAs(responder, card, "tao")) {
        responder.hand.push(card);
        throw new Error("濒死救援必须使用桃");
      }
      this.state.discard.push(card);
      dying.hp +=
        this.hasSkill(dying, "jiuyuan") &&
        responder.general.faction === "wu" &&
        responder.id !== dying.id
          ? 2
          : 1;
      this.log("dying.tao", `${responder.name}对${dying.name}使用了桃`);
      if (dying.hp > 0) {
        this.resumeState(pending.resumePending, pending.resumePhase);
        this.log("dying.saved", `${dying.name}脱离濒死`);
        return;
      }
      return;
    }
    pending.responderIndex++;
    if (pending.responderIndex < pending.responders.length) return;
    delete this.state.pending;
    this.kill(
      dying,
      pending.sourceId ? this.player(pending.sourceId, false) : undefined,
    );
    const resumePending = this.pendingAfterDeath(
      pending.resumePending,
      dying.id,
    );
    if (this.state.status === "playing") {
      if (this.state.currentPlayerId === dying.id) {
        const next = this.nextAliveAfter(dying.id);
        this.state.currentPlayerId = next.id;
        this.state.turn++;
        this.beginTurn(next);
      } else this.resumeState(resumePending, pending.resumePhase);
    }
  }
  private pendingAfterDeath(
    pending: PendingResponse | undefined,
    deadId: string,
  ): PendingResponse | undefined {
    let current = pending;
    while (current && current.playerId === deadId) {
      if (current.kind === "yiji") {
        this.state.discard.push(...current.cards);
        current = current.resumePending;
      } else if (
        current.kind === "judgmentSkill" &&
        current.context.kind === "ganglie"
      ) {
        current = current.context.resumePending;
      } else if (
        current.kind === "fankui" ||
        current.kind === "ganglie" ||
        current.kind === "jianxiong" ||
        current.kind === "yijiChoice" ||
        current.kind === "optionalTrigger" ||
        current.kind === "qilin" ||
        current.kind === "hanbing"
      )
        current = current.resumePending;
      else return undefined;
    }
    return current;
  }
  private nextAliveAfter(playerId: string) {
    const allIndex = this.state.players.findIndex(
      (item) => item.id === playerId,
    );
    for (let offset = 1; offset <= this.state.players.length; offset++) {
      const candidate =
        this.state.players[(allIndex + offset) % this.state.players.length];
      if (candidate.alive) return candidate;
    }
    throw new Error("没有存活玩家");
  }
  private aliveAfter(playerId: string) {
    const start = this.state.players.findIndex((item) => item.id === playerId);
    const result: string[] = [];
    for (let offset = 1; offset <= this.state.players.length; offset++) {
      const candidate =
        this.state.players[(start + offset) % this.state.players.length];
      if (candidate.alive) result.push(candidate.id);
    }
    return result;
  }
  private genderOf(player: PlayerState) {
    if (player.general.gender) return player.general.gender;
    return new Set([
      "zhenji",
      "huangyueying",
      "daqiao",
      "sunshangxiang",
      "diaochan",
    ]).has(player.general.id)
      ? "female"
      : "male";
  }
  private takeDeckCard() {
    if (!this.state.deck.length)
      this.state.deck = this.rng.shuffle(this.state.discard.splice(0));
    return this.state.deck.shift();
  }
  private findPhysicalCard(cardId: string) {
    const zones = [
      this.state.deck,
      this.state.discard,
      ...this.state.players.flatMap((player) => [
        player.hand,
        player.judgment,
        Object.values(player.equipment).filter((card): card is Card =>
          Boolean(card),
        ),
      ]),
    ];
    for (const zone of zones) {
      const card = zone.find((item) => item.id === cardId);
      if (card) return card;
    }
    return {
      id: cardId,
      name: "sha",
      displayName: "杀",
      suit: "spade" as Suit,
      rank: 1,
      type: "basic" as const,
    };
  }
  private queueOptionalDraw(
    player: PlayerState,
    skillId: "jizhi" | "lianying" | "xiaoji",
    drawCount: number,
  ) {
    if (!player.alive) return;
    this.queuedOptionalDraws.push({ playerId: player.id, skillId, drawCount });
  }
  private flushOptionalDraws() {
    let resumePending = this.state.pending;
    let resumePhase = this.state.phase;
    for (let index = this.queuedOptionalDraws.length - 1; index >= 0; index--) {
      const trigger = this.queuedOptionalDraws[index];
      const pending: Extract<PendingResponse, { kind: "optionalTrigger" }> = {
        playerId: trigger.playerId,
        kind: "optionalTrigger",
        skillId: trigger.skillId,
        drawCount: trigger.drawCount,
        resumePhase,
        resumePending,
      };
      resumePending = pending;
      resumePhase = "response";
    }
    this.queuedOptionalDraws = [];
    if (!resumePending || resumePending === this.state.pending) return;
    this.state.pending = resumePending;
    this.state.phase = "response";
  }
  private resumeOptionalTrigger(
    pending: Extract<PendingResponse, { kind: "optionalTrigger" }>,
  ) {
    this.resumeState(pending.resumePending, pending.resumePhase);
  }
  private resumeDamageTrigger(
    pending: Extract<
      PendingResponse,
      { kind: "jianxiong" } | { kind: "yijiChoice" }
    >,
  ) {
    this.resumeState(pending.resumePending, pending.resumePhase);
  }
  private resumeState(
    pending: PendingResponse | undefined,
    phase: GameState["phase"],
  ) {
    if (pending?.kind === "effectContinuation") {
      this.state.pending = undefined;
      this.state.phase = pending.resumePhase;
      this.applyEffects(
        pending.effects,
        this.player(pending.playerId),
        pending.sourceId ? this.player(pending.sourceId, false) : undefined,
        pending.selectedId ? this.player(pending.selectedId, false) : undefined,
        pending.skillId,
      );
      if (!this.state.pending) this.state.phase = pending.resumePhase;
      return;
    }
    if (pending?.kind === "phaseContinuation") {
      this.state.pending = undefined;
      const player = this.player(pending.playerId, false);
      if (player?.alive && pending.phase === "judge")
        this.continueJudgmentPhase(player);
      else {
        this.state.pending = undefined;
        this.state.phase = phase;
      }
      return;
    }
    if (pending?.kind === "trickNext") {
      this.state.pending = undefined;
      this.beginTrickResolution(pending.resolution);
      return;
    }
    if (pending?.kind === "shaNext") {
      this.state.pending = undefined;
      const source = this.player(pending.sourceId, false);
      const target = this.player(pending.targetId, false);
      if (source?.alive && target?.alive) {
        this.beginShaTarget(
          source,
          target,
          pending.card,
          pending.remainingTargetIds,
          pending.resumePhase,
          pending.directHitTargetIds,
        );
        return;
      }
      this.resumeState(
        source
          ? this.nextShaPending(
              source,
              pending.remainingTargetIds,
              pending.resumePhase,
              pending.card,
              pending.directHitTargetIds,
            )
          : undefined,
        pending.resumePhase,
      );
      return;
    }
    this.state.pending = pending;
    this.state.phase = pending
      ? pending.kind === "dying"
        ? "dying"
        : "response"
      : phase;
  }
  private declineJudgmentSkill(
    pending: Extract<PendingResponse, { kind: "judgmentSkill" }>,
  ) {
    const context = pending.context;
    this.log(
      `skill.${pending.skillId}.skip`,
      `${this.player(pending.playerId).name}不发动${pending.skillId}`,
    );
    if (context.kind === "tieji") {
      this.beginShaDefense(
        this.player(context.sourceId),
        this.player(context.targetId),
        context.card,
        context.remainingTargetIds,
        context.resumePhase,
        true,
        context.directHitTargetIds,
      );
      return;
    }
    if (context.kind === "bagua") {
      this.resolveMissedShan(context.shaPending);
      return;
    }
    if (context.kind === "ganglie") {
      this.resumeState(context.resumePending, context.resumePhase);
      return;
    }
    this.continueJudgmentPhase(this.player(context.ownerId));
  }
  private startJudgment(owner: PlayerState, context: JudgmentContext) {
    const card = this.takeDeckCard();
    if (!card) return;
    const controllers = [
      owner.id,
      ...this.aliveAfter(owner.id).filter((id) => id !== owner.id),
    ].filter((id) => {
      const player = this.player(id);
      return player.general.skills.includes("guicai") && player.hand.length;
    });
    this.state.phase = "response";
    if (controllers.length) {
      this.state.pending = {
        playerId: controllers[0],
        kind: "judgment",
        ownerId: owner.id,
        card,
        stage: "guicai",
        controllers,
        controllerIndex: 0,
        context,
      };
      this.log("judge.guicai.wait", `${owner.name}的判定等待鬼才响应`);
      return;
    }
    if (owner.general.skills.includes("tiandu")) {
      this.state.pending = {
        playerId: owner.id,
        kind: "judgment",
        ownerId: owner.id,
        card,
        stage: "tiandu",
        controllers: [],
        controllerIndex: 0,
        context,
      };
      this.log("skill.tiandu.wait", `${owner.name}可以发动天妒`);
      return;
    }
    this.finishJudgment(
      {
        playerId: owner.id,
        kind: "judgment",
        ownerId: owner.id,
        card,
        stage: "tiandu",
        controllers: [],
        controllerIndex: 0,
        context,
      },
      false,
    );
  }
  private respondJudgment(
    command: Extract<GameCommand, { type: "respond" }>,
    pending: Extract<PendingResponse, { kind: "judgment" }>,
  ) {
    if (command.playerId !== pending.playerId)
      throw new Error("尚未轮到该玩家响应判定");
    if (pending.stage === "tiandu") {
      if (command.cardId) throw new Error("天妒只需确认发动或放弃");
      this.finishJudgment(pending, false);
      return;
    }
    const controller = this.player(command.playerId);
    if (command.cardId) {
      const replacement = this.takeCard(controller, command.cardId);
      this.state.discard.push(pending.card);
      pending.card = replacement;
      this.log(
        "skill.guicai",
        `${controller.name}发动鬼才修改了${this.player(pending.ownerId).name}的判定`,
      );
    }
    pending.controllerIndex++;
    while (pending.controllerIndex < pending.controllers.length) {
      const next = this.player(
        pending.controllers[pending.controllerIndex],
        false,
      );
      if (next?.alive && next.hand.length) {
        pending.playerId = next.id;
        return;
      }
      pending.controllerIndex++;
    }
    const owner = this.player(pending.ownerId);
    if (owner.alive && owner.general.skills.includes("tiandu")) {
      pending.stage = "tiandu";
      pending.playerId = owner.id;
      this.log("skill.tiandu.wait", `${owner.name}可以发动天妒`);
      return;
    }
    this.finishJudgment(pending, false);
  }
  private finishJudgment(
    pending: Extract<PendingResponse, { kind: "judgment" }>,
    takeByTiandu: boolean,
  ) {
    delete this.state.pending;
    const owner = this.player(pending.ownerId);
    const card = pending.card;
    this.log("judge.result", `${owner.name}判定为${card.suit}${card.rank}`);
    if (takeByTiandu) {
      owner.hand.push(card);
      this.log("skill.tiandu", `${owner.name}发动天妒获得判定牌`);
    }
    this.resolveJudgmentOutcome(pending.context, card, takeByTiandu);
  }
  private resolveJudgmentOutcome(
    context: JudgmentContext,
    judged: Card,
    judgmentTaken: boolean,
  ) {
    if (!judgmentTaken) this.state.discard.push(judged);
    if (context.kind === "custom") {
      const self = this.player(context.selfId);
      const source = context.sourceId
        ? this.player(context.sourceId, false)
        : undefined;
      const selected = context.selectedId
        ? this.player(context.selectedId, false)
        : undefined;
      const branch = context.successSuits.includes(judged.suit)
        ? context.success
        : context.failure;
      this.applyEffects(
        [...branch, ...context.after],
        self,
        source,
        selected,
        context.skillId,
      );
      if (!this.state.pending) this.state.phase = context.resumePhase;
      return;
    }
    if (context.kind === "tieji") {
      const source = this.player(context.sourceId);
      const target = this.player(context.targetId);
      if (judged.suit === "heart" || judged.suit === "diamond") {
        this.log(
          "skill.tieji",
          `${source.name}发动铁骑，${target.name}不能使用闪`,
        );
        this.damage(
          source,
          target,
          1,
          context.resumePhase,
          this.nextShaPending(
            source,
            context.remainingTargetIds,
            context.resumePhase,
            context.card,
            context.directHitTargetIds,
          ),
          context.card.id,
        );
      } else
        this.beginShaDefense(
          source,
          target,
          context.card,
          context.remainingTargetIds,
          context.resumePhase,
          true,
          context.directHitTargetIds,
        );
      return;
    }
    if (context.kind === "bagua") {
      const pending = context.shaPending;
      const source = this.player(pending.sourceId);
      const target = this.player(pending.playerId);
      if (judged.suit === "heart" || judged.suit === "diamond")
        this.afterShanDodged(
          source,
          target,
          pending.resumePhase,
          pending.remainingTargetIds,
          pending.card ?? this.findPhysicalCard(pending.cardId),
          pending.directHitTargetIds,
        );
      else this.resolveMissedShan(pending);
      return;
    }
    if (context.kind === "ganglie") {
      if (judged.suit !== "heart") {
        this.state.phase = "response";
        this.state.pending = {
          playerId: context.sourceId,
          kind: "ganglie",
          sourceId: context.ownerId,
          count: 2,
          resumePhase: context.resumePhase,
          resumePending: context.resumePending,
        };
      } else {
        this.resumeState(context.resumePending, context.resumePhase);
      }
      return;
    }
    if (context.kind === "luoshen") {
      const player = this.player(context.ownerId);
      const black = judged.suit === "spade" || judged.suit === "club";
      if (black) {
        if (!judgmentTaken) {
          const index = this.state.discard.findIndex(
            (card) => card.id === judged.id,
          );
          if (index >= 0)
            player.hand.push(this.state.discard.splice(index, 1)[0]);
        }
        this.log("skill.luoshen", `${player.name}通过洛神获得黑色判定牌`);
        this.state.phase = "response";
        this.state.pending = {
          playerId: player.id,
          kind: "judgmentSkill",
          skillId: "luoshen",
          context,
        };
      } else this.continueJudgmentPhase(player);
      return;
    }
    const player = this.player(context.ownerId);
    const delayed = context.delayed;
    const delayedName = delayed.virtualName ?? delayed.name;
    if (delayedName === "lebu" && judged.suit !== "heart")
      player.marks.skipPlay = 1;
    if (delayedName === "shandian") {
      if (judged.suit === "spade" && judged.rank >= 2 && judged.rank <= 9) {
        delete delayed.virtualName;
        this.state.discard.push(delayed);
        this.damage(undefined, player, 3, "play", {
          playerId: player.id,
          kind: "phaseContinuation",
          phase: "judge",
        });
        return;
      } else {
        const next = this.nextAliveAfter(player.id);
        if (
          next.judgment.some(
            (item) => (item.virtualName ?? item.name) === "shandian",
          )
        ) {
          delete delayed.virtualName;
          this.state.discard.push(delayed);
        } else next.judgment.push(delayed);
      }
    } else {
      delete delayed.virtualName;
      this.state.discard.push(delayed);
    }
    if (!this.state.pending) this.continueJudgmentPhase(player);
  }
  private performJudgment(owner: PlayerState) {
    let judged = this.takeDeckCard();
    if (!judged) return undefined;
    const controller = this.state.players.find(
      (item) =>
        item.alive &&
        item.general.skills.includes("guicai") &&
        item.hand.length,
    );
    if (controller) {
      const replacement = this.takeCard(controller, controller.hand[0].id);
      this.state.discard.push(judged);
      judged = replacement;
      this.log(
        "skill.guicai",
        `${controller.name}发动鬼才修改了${owner.name}的判定`,
      );
    }
    return judged;
  }
  private settleJudgment(owner: PlayerState, card: Card) {
    if (owner.general.skills.includes("tiandu")) {
      owner.hand.push(card);
      this.log("skill.tiandu", `${owner.name}发动天妒获得判定牌`);
    } else this.state.discard.push(card);
  }
  private canRespondAs(
    player: PlayerState,
    card: Card,
    expected: "sha" | "shan" | "tao",
  ) {
    if (card.name === expected) return true;
    const red = card.suit === "heart" || card.suit === "diamond";
    const black = !red;
    if (
      expected === "shan" &&
      player.general.skills.includes("qingguo") &&
      black
    )
      return true;
    if (
      player.general.skills.includes("longdan") &&
      ((expected === "shan" && card.name === "sha") ||
        (expected === "sha" && card.name === "shan"))
    )
      return true;
    if (expected === "sha" && player.general.skills.includes("wusheng") && red)
      return true;
    if (
      expected === "tao" &&
      player.general.skills.includes("jijiu") &&
      red &&
      this.state.currentPlayerId !== player.id
    )
      return true;
    return false;
  }
  private baguaSucceeds(player: PlayerState) {
    const judged = this.takeDeckCard();
    if (!judged) return false;
    this.state.discard.push(judged);
    const success = judged.suit === "heart" || judged.suit === "diamond";
    this.log(
      "armor.bagua",
      `${player.name}发动八卦阵，判定${success ? "成功" : "失败"}`,
    );
    return success;
  }
  private removeOneCard(player: PlayerState) {
    if (player.hand.length)
      return player.hand.splice(this.rng.int(player.hand.length), 1)[0];
    for (const slot of [
      "weapon",
      "armor",
      "offensiveHorse",
      "defensiveHorse",
    ] as EquipmentSlot[]) {
      const card = player.equipment[slot];
      if (card) {
        delete player.equipment[slot];
        if (player.alive && player.general.skills.includes("xiaoji")) {
          this.queueOptionalDraw(player, "xiaoji", 2);
          this.log("skill.xiaoji.wait", `${player.name}可以发动枭姬摸两张牌`);
        }
        return card;
      }
    }
    return player.judgment.shift();
  }
  private ownCardIds(player: PlayerState) {
    return [
      ...player.hand.map((card) => card.id),
      ...Object.values(player.equipment)
        .filter((card): card is Card => Boolean(card))
        .map((card) => card.id),
    ];
  }
  private takeOwnCard(player: PlayerState, cardId: string) {
    const hand = player.hand.find((card) => card.id === cardId);
    if (hand) return this.takeCard(player, cardId);
    for (const slot of [
      "weapon",
      "armor",
      "offensiveHorse",
      "defensiveHorse",
    ] as EquipmentSlot[]) {
      if (player.equipment[slot]?.id !== cardId) continue;
      const card = player.equipment[slot]!;
      delete player.equipment[slot];
      if (player.alive && player.general.skills.includes("xiaoji")) {
        this.queueOptionalDraw(player, "xiaoji", 2);
        this.log("skill.xiaoji.wait", `${player.name}可以发动枭姬摸两张牌`);
      }
      return card;
    }
    throw new Error("所选牌不在该角色的手牌区或装备区");
  }
  private takeResponseCard(
    player: PlayerState,
    cardId: string,
    expected: "sha" | "shan" | "tao",
  ) {
    if (player.hand.some((card) => card.id === cardId))
      return this.takeCard(player, cardId);
    const card = Object.values(player.equipment).find(
      (item) => item?.id === cardId,
    );
    if (!card) throw new Error("response card does not exist");
    const red = card.suit === "heart" || card.suit === "diamond";
    const canUseEquipment =
      red &&
      ((expected === "sha" && player.general.skills.includes("wusheng")) ||
        (expected === "tao" &&
          player.general.skills.includes("jijiu") &&
          this.state.currentPlayerId !== player.id));
    if (!canUseEquipment)
      throw new Error("equipment cannot be used for this response");
    return this.takeOwnCard(player, cardId);
  }
  private selectableOtherCardIds(player: PlayerState) {
    return [
      ...(player.hand.length ? ["random-hand"] : []),
      ...Object.values(player.equipment)
        .filter((card): card is Card => Boolean(card))
        .map((card) => card.id),
      ...player.judgment.map((card) => card.id),
    ];
  }
  private removeSelectedOtherCard(player: PlayerState, cardId: string) {
    if (cardId === "random-hand") {
      if (!player.hand.length) return undefined;
      return player.hand.splice(this.rng.int(player.hand.length), 1)[0];
    }
    for (const slot of [
      "weapon",
      "armor",
      "offensiveHorse",
      "defensiveHorse",
    ] as EquipmentSlot[]) {
      if (player.equipment[slot]?.id !== cardId) continue;
      const card = player.equipment[slot];
      delete player.equipment[slot];
      if (player.alive && player.general.skills.includes("xiaoji")) {
        this.queueOptionalDraw(player, "xiaoji", 2);
        this.log("skill.xiaoji.wait", `${player.name}可以发动枭姬摸两张牌`);
      }
      return card;
    }
    const judgmentIndex = player.judgment.findIndex(
      (card) => card.id === cardId,
    );
    if (judgmentIndex >= 0) return player.judgment.splice(judgmentIndex, 1)[0];
    return undefined;
  }
  distance(fromId: string, toId: string) {
    if (fromId === toId) return 0;
    const alive = this.state.players.filter((item) => item.alive);
    const from = alive.findIndex((item) => item.id === fromId);
    const to = alive.findIndex((item) => item.id === toId);
    if (from < 0 || to < 0) return Number.POSITIVE_INFINITY;
    const clockwise = (to - from + alive.length) % alive.length;
    let value = Math.min(clockwise, alive.length - clockwise);
    const attacker = alive[from];
    const target = alive[to];
    if (attacker.equipment.offensiveHorse) value--;
    if (attacker.general.skills.includes("mashu")) value--;
    if (target.equipment.defensiveHorse) value++;
    value += this.modifierTotal(attacker, "distanceFrom");
    value += this.modifierTotal(target, "distanceTo");
    return Math.max(1, value);
  }
  private attackRange(player: PlayerState) {
    return Math.max(
      1,
      (player.equipment.weapon?.range ?? 1) +
        this.modifierTotal(player, "attackRange"),
    );
  }
  private modifierTotal(player: PlayerState, type: SkillModifier["type"]) {
    return this.skillIds(player).reduce((total, id) => {
      const skill = this.skills.get(id);
      if (!skill || skill.runtimeOnly) return total;
      return (
        total +
        (skill.modifiers ?? [])
          .filter(
            (modifier) =>
              modifier.type === type &&
              (!modifier.when ||
                this.evaluateCondition(
                  modifier.when,
                  player,
                  undefined,
                  player,
                  skill.id,
                )),
          )
          .reduce((sum, modifier) => sum + modifier.amount, 0)
      );
    }, 0);
  }
  private trigger(
    event: CustomSkill["event"],
    self: PlayerState,
    source?: PlayerState,
  ) {
    for (const id of this.skillIds(self)) {
      const skill = this.skills.get(id);
      if (
        !skill ||
        skill.runtimeOnly ||
        (skill.kind ?? "trigger") !== "trigger" ||
        skill.event !== event ||
        (skill.when &&
          !this.evaluateCondition(skill.when, self, source, self, skill.id))
      )
        continue;
      this.applyEffects(
        this.resolveSkillEffects(skill),
        self,
        source,
        self,
        skill.id,
      );
      this.log("skill.trigger", `${self.name}发动了${skill.name}`);
    }
  }
  private applyEffects(
    effects: Effect[],
    self: PlayerState,
    source?: PlayerState,
    selected?: PlayerState,
    skillId?: string,
  ) {
    if (effects.length > 256) throw new Error("效果节点过多");
    for (let effectIndex = 0; effectIndex < effects.length; effectIndex++) {
      const effect = effects[effectIndex];
      if (effect.id)
        this.log(
          "skill.node",
          `${skillId ?? "anonymous"} 执行节点 ${effect.id}`,
        );
      if (effect.type === "if") {
        const branch = effect.condition
          ? this.evaluateCondition(
              effect.condition,
              self,
              source,
              selected,
              skillId,
            )
            ? (effect.then ?? [])
            : (effect.else ?? [])
          : [];
        this.applyEffects(
          [...branch, ...effects.slice(effectIndex + 1)],
          self,
          source,
          selected,
          skillId,
        );
        return;
      }
      if (effect.type === "repeat") {
        const times = Math.max(0, Math.min(20, effect.times ?? 0));
        const body = effect.body ?? [];
        this.applyEffects(
          [
            ...Array.from({ length: times }, () => body).flat(),
            ...effects.slice(effectIndex + 1),
          ],
          self,
          source,
          selected,
          skillId,
        );
        return;
      }
      if (effect.type === "setState" || effect.type === "changeState") {
        const key = this.skillStateKey(skillId, effect.stateKey);
        self.marks[key] =
          effect.type === "setState"
            ? (effect.value ?? 0)
            : (self.marks[key] ?? 0) + (effect.value ?? 0);
        continue;
      }
      const explicitTarget = effect.targetPlayerId
        ? this.player(effect.targetPlayerId)
        : undefined;
      const targets = explicitTarget
        ? [explicitTarget]
        : effect.target === "allOthers"
          ? this.state.players.filter(
              (item) => item.alive && item.id !== self.id,
            )
          : ([
              effect.target === "source"
                ? source
                : effect.target === "selected"
                  ? selected
                  : self,
            ].filter(Boolean) as PlayerState[]);
      for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
        const target = targets[targetIndex];
        if (effect.type === "judge") {
          this.startJudgment(target, {
            kind: "custom",
            ownerId: target.id,
            selfId: self.id,
            sourceId: source?.id,
            selectedId: selected?.id,
            skillId,
            successSuits: effect.successSuits ?? ["heart", "diamond"],
            success: effect.success ?? [],
            failure: effect.failure ?? [],
            after: effects.slice(effectIndex + 1),
            resumePhase: this.state.phase,
          });
          return;
        }
        if (effect.type === "draw") this.draw(target, effect.count ?? 1);
        if (effect.type === "recover")
          target.hp = Math.min(target.maxHp, target.hp + (effect.amount ?? 1));
        if (effect.type === "damage") {
          const continuation = this.state.externalRuleEvents
            ? {
                playerId: self.id,
                kind: "effectContinuation" as const,
                effects: [
                  ...targets.slice(targetIndex + 1).map((remainingTarget) => ({
                    ...structuredClone(effect),
                    targetPlayerId: remainingTarget.id,
                  })),
                  ...structuredClone(effects.slice(effectIndex + 1)),
                ],
                sourceId: source?.id,
                selectedId: selected?.id,
                skillId,
                resumePhase: this.state.phase,
              }
            : undefined;
          this.damage(
            source ?? self,
            target,
            effect.amount ?? 1,
            "play",
            continuation?.effects.length ? continuation : undefined,
          );
          if (this.state.pending?.kind === "dying" || continuation) return;
        }
        if (effect.type === "addMark")
          target.marks[effect.mark ?? "mark"] =
            (target.marks[effect.mark ?? "mark"] ?? 0) + (effect.count ?? 1);
        if (effect.type === "removeMark") {
          const mark = effect.mark ?? "mark";
          target.marks[mark] = Math.max(
            0,
            (target.marks[mark] ?? 0) - (effect.count ?? 1),
          );
          if (!target.marks[mark]) delete target.marks[mark];
        }
        if (effect.type === "discard")
          this.discardRandom(target, effect.count ?? 1);
        if (effect.type === "loseHp") {
          target.hp -= effect.amount ?? 1;
          this.log("hp.lose", `${target.name}失去${effect.amount ?? 1}点体力`);
          if (target.hp <= 0) {
            this.enterDying(target, source ?? self, "play");
            return;
          }
        }
        if (effect.type === "changeMaxHp") {
          target.maxHp = Math.max(1, target.maxHp + (effect.value ?? 0));
          target.hp = Math.min(target.hp, target.maxHp);
        }
        if (effect.type === "grantSkill" && effect.skillId)
          target.grantedSkills[effect.skillId] = effect.duration ?? "turn";
        if (effect.type === "removeSkill" && effect.skillId)
          delete target.grantedSkills[effect.skillId];
        if (effect.type === "skipPhase" && effect.phase)
          target.marks[`skipPhase.${effect.phase}`] = 1;
        if (effect.type === "moveCards") {
          const destination = effect.toPlayerId
            ? this.player(effect.toPlayerId)
            : this.ruleSubject(effect.to ?? "self", self, source, selected);
          const count = Math.max(0, Math.min(20, effect.count ?? 1));
          for (let i = 0; i < count; i++) {
            const card =
              effect.fromZone === "hand"
                ? target.hand.length
                  ? this.takeCard(
                      target,
                      target.hand[this.rng.int(target.hand.length)].id,
                    )
                  : undefined
                : this.removeOneCard(target);
            if (!card) break;
            if (effect.toZone === "discard") this.state.discard.push(card);
            else if (destination) destination.hand.push(card);
            else this.state.discard.push(card);
          }
        }
      }
    }
  }
  private resolveSkillEffects(skill: CustomSkill) {
    if (!skill.graph) return skill.effects;
    const nodes = new Map(
      skill.graph.nodes.map((node) => [node.id ?? "", node] as const),
    );
    const ordered: Effect[] = [];
    const visited = new Set<string>();
    let id: string | undefined = skill.graph.entry;
    while (id) {
      if (visited.has(id)) throw new Error(`技能图存在循环：${id}`);
      if (visited.size >= 256) throw new Error("技能图节点过多");
      const node = nodes.get(id);
      if (!node) throw new Error(`技能图引用不存在的节点：${id}`);
      visited.add(id);
      ordered.push(node);
      id = node.next;
    }
    return ordered;
  }
  private skillStateKey(skillId?: string, key?: string) {
    return `state.${skillId ?? "anonymous"}.${key ?? "value"}`;
  }
  private selectionStateKey(skillId?: string, key?: string) {
    return `selection.${skillId ?? "anonymous"}.${key ?? "value"}`;
  }
  private ruleSubject(
    subject: RuleSubject,
    self: PlayerState,
    source?: PlayerState,
    selected?: PlayerState,
  ) {
    if (subject === "source") return source;
    if (subject === "selected") return selected;
    if (subject === "current")
      return this.player(this.state.currentPlayerId, false);
    return self;
  }
  private ruleValue(
    value: RuleValue,
    self: PlayerState,
    source?: PlayerState,
    selected?: PlayerState,
    skillId?: string,
  ) {
    if (value.kind === "number") return value.value;
    const player = this.ruleSubject(value.subject, self, source, selected);
    if (!player) return 0;
    if (value.property === "hp") return player.hp;
    if (value.property === "maxHp") return player.maxHp;
    if (value.property === "lostHp") return player.maxHp - player.hp;
    if (value.property === "handCount") return player.hand.length;
    if (value.property === "state")
      return player.marks[this.skillStateKey(skillId, value.key)] ?? 0;
    if (value.property === "selection")
      return player.marks[this.selectionStateKey(skillId, value.key)] ?? 0;
    return player.marks[value.key ?? "mark"] ?? 0;
  }
  private evaluateCondition(
    condition: RuleCondition,
    self: PlayerState,
    source?: PlayerState,
    selected?: PlayerState,
    skillId?: string,
  ): boolean {
    if ("conditions" in condition)
      return condition.op === "and"
        ? condition.conditions.every((item) =>
            this.evaluateCondition(item, self, source, selected, skillId),
          )
        : condition.conditions.some((item) =>
            this.evaluateCondition(item, self, source, selected, skillId),
          );
    if (condition.op === "not")
      return !this.evaluateCondition(
        condition.condition,
        self,
        source,
        selected,
        skillId,
      );
    if (condition.op === "predicate") {
      const player = this.ruleSubject(
        condition.subject,
        self,
        source,
        selected,
      );
      if (!player) return false;
      if (condition.predicate === "alive") return player.alive;
      if (condition.predicate === "wounded") return player.hp < player.maxHp;
      return condition.skillId
        ? this.hasSkill(player, condition.skillId)
        : false;
    }
    const left = this.ruleValue(
      condition.left,
      self,
      source,
      selected,
      skillId,
    );
    const right = this.ruleValue(
      condition.right,
      self,
      source,
      selected,
      skillId,
    );
    if (condition.comparator === "eq") return left === right;
    if (condition.comparator === "neq") return left !== right;
    if (condition.comparator === "lt") return left < right;
    if (condition.comparator === "lte") return left <= right;
    if (condition.comparator === "gt") return left > right;
    return left >= right;
  }
  private startCustomActiveSkill(
    player: PlayerState,
    skill: CustomSkill,
    command: Extract<GameCommand, { type: "activateSkill" }>,
  ) {
    if (
      command.cardIds?.length ||
      command.targetIds?.length ||
      command.optionId !== undefined ||
      command.numberValue !== undefined ||
      command.suit !== undefined
    )
      throw new Error("多段主动技能必须先启动，再逐步提交选择");
    if (
      skill.when &&
      !this.evaluateCondition(skill.when, player, undefined, player, skill.id)
    )
      throw new Error("当前不满足插件技能发动条件");
    const usage = skill.usage ?? "oncePerTurn";
    if (usage === "oncePerTurn" && player.marks[`used.${skill.id}`])
      throw new Error("本回合已经发动过该技能");
    const selections = skill.selections ?? [];
    if (!selections.length) {
      if (usage === "oncePerTurn") player.marks[`used.${skill.id}`] = 1;
      this.applyEffects(
        this.resolveSkillEffects(skill),
        player,
        undefined,
        player,
        skill.id,
      );
      this.log("skill.custom", `${player.name}发动${skill.name}`);
      return;
    }
    this.state.phase = "response";
    this.state.pending = {
      playerId: player.id,
      kind: "customSkill",
      skillId: skill.id,
      skillName: skill.name,
      stepIndex: 0,
      selection: selections[0],
      selectedCardIds: [],
      selectedTargetIds: [],
      selectedValues: {},
    };
    this.log("skill.custom.start", `${player.name}开始发动${skill.name}`);
  }
  private resolveCustomSkillSelection(
    command: Extract<GameCommand, { type: "activateSkill" }>,
  ) {
    const pending = this.state.pending;
    if (
      pending?.kind !== "customSkill" ||
      pending.playerId !== command.playerId ||
      pending.skillId !== command.skillId
    )
      throw new Error("当前不能提交该插件技能选择");
    const player = this.player(command.playerId);
    const skill = this.skills.get(pending.skillId);
    if (!skill || skill.runtimeOnly || (skill.kind ?? "trigger") !== "active")
      throw new Error("插件主动技能定义不存在");
    const selection = pending.selection;
    if (selection.kind === "target" || selection.kind === "card") {
      const submitted =
        selection.kind === "target"
          ? (command.targetIds ?? [])
          : (command.cardIds ?? []);
      if (
        submitted.length < selection.min ||
        submitted.length > selection.max ||
        new Set(submitted).size !== submitted.length
      )
        throw new Error("插件技能选择数量不合法");
      if (selection.kind === "target") {
        for (const id of submitted) {
          const target = this.player(id);
          if (!target.alive) throw new Error("插件技能不能选择阵亡目标");
          if (selection.targetFilter === "self" && target.id !== player.id)
            throw new Error("插件技能只能选择自己");
          if (selection.targetFilter === "other" && target.id === player.id)
            throw new Error("插件技能必须选择其他角色");
          if (selection.targetFilter === "wounded" && target.hp >= target.maxHp)
            throw new Error("插件技能必须选择受伤角色");
        }
        pending.selectedTargetIds.push(...submitted);
      } else {
        const selectable = new Set([
          ...player.hand.map((card) => card.id),
          ...(selection.cardZone === "own"
            ? Object.values(player.equipment)
                .filter((card): card is Card => Boolean(card))
                .map((card) => card.id)
            : []),
        ]);
        if (submitted.some((id) => !selectable.has(id)))
          throw new Error("插件技能选择了不允许的卡牌");
        pending.selectedCardIds.push(...submitted);
        if (selection.consume === "discard")
          this.state.discard.push(
            ...submitted.map((id) => this.takeOwnCard(player, id)),
          );
      }
    } else if (selection.kind === "option") {
      const optionIndex = selection.options?.findIndex(
        (item) => item.id === command.optionId,
      );
      if (optionIndex === undefined || optionIndex < 0)
        throw new Error("插件技能选项不合法");
      pending.selectedValues[selection.id] =
        selection.options?.[optionIndex].value ?? optionIndex;
    } else if (selection.kind === "number") {
      if (
        !Number.isInteger(command.numberValue) ||
        command.numberValue! < selection.min ||
        command.numberValue! > selection.max
      )
        throw new Error("插件技能数字选择不合法");
      pending.selectedValues[selection.id] = command.numberValue!;
    } else {
      const suits = selection.suits ?? ["spade", "heart", "club", "diamond"];
      const suitIndex = suits.indexOf(command.suit!);
      if (suitIndex < 0) throw new Error("插件技能花色选择不合法");
      pending.selectedValues[selection.id] = suitIndex;
    }
    const nextIndex = pending.stepIndex + 1;
    const next = skill.selections?.[nextIndex];
    if (next) {
      pending.stepIndex = nextIndex;
      pending.selection = next;
      this.log(
        "skill.custom.step",
        `${player.name}完成${skill.name}的第${nextIndex}步选择`,
      );
      return;
    }
    const selected = this.player(pending.selectedTargetIds[0] ?? player.id);
    for (const [id, value] of Object.entries(pending.selectedValues))
      player.marks[this.selectionStateKey(skill.id, id)] = value;
    const usage = skill.usage ?? "oncePerTurn";
    if (usage === "oncePerTurn") player.marks[`used.${skill.id}`] = 1;
    delete this.state.pending;
    this.state.phase = "play";
    this.applyEffects(
      this.resolveSkillEffects(skill),
      player,
      undefined,
      selected,
      skill.id,
    );
    this.log("skill.custom", `${player.name}发动${skill.name}`);
  }
  availableCustomActiveSkill(playerId: string) {
    const player = this.player(playerId, false);
    if (!player || !player.alive) return undefined;
    return this.skillIds(player)
      .map((id) => this.skills.get(id))
      .find((skill) => {
        if (
          !skill ||
          skill.runtimeOnly ||
          (skill.kind ?? "trigger") !== "active"
        )
          return false;
        if (
          skill.when &&
          !this.evaluateCondition(
            skill.when,
            player,
            undefined,
            player,
            skill.id,
          )
        )
          return false;
        if ((skill.usage ?? "oncePerTurn") === "unlimited") return false;
        if (player.marks[`used.${skill.id}`]) return false;
        return (skill.selections ?? []).every((selection) => {
          if (selection.kind === "card") {
            const count =
              player.hand.length +
              (selection.cardZone === "own"
                ? Object.values(player.equipment).filter(Boolean).length
                : 0);
            return count >= selection.min;
          }
          if (selection.kind === "option")
            return Boolean(selection.options?.length);
          if (selection.kind === "number")
            return selection.min <= selection.max;
          if (selection.kind === "suit")
            return (selection.suits?.length ?? 4) > 0;
          return (
            this.state.players.filter((target) => {
              if (!target.alive) return false;
              if (selection.targetFilter === "self")
                return target.id === player.id;
              if (selection.targetFilter === "other")
                return target.id !== player.id;
              if (selection.targetFilter === "wounded")
                return target.hp < target.maxHp;
              return true;
            }).length >= selection.min
          );
        });
      })?.id;
  }
  private validTarget(
    self: PlayerState,
    id: string | undefined,
    kind: "other" | "any",
  ) {
    const target = this.player(id ?? "");
    if (!target.alive || (kind === "other" && target.id === self.id))
      throw new Error("卡牌目标无效");
    return target;
  }
  private draw(player: PlayerState, count: number) {
    for (let i = 0; i < count; i++) {
      const card = this.takeDeckCard();
      if (card) player.hand.push(card);
    }
  }
  private discardRandom(player: PlayerState, count: number) {
    for (let i = 0; i < count; i++) {
      const card = this.removeOneCard(player);
      if (!card) break;
      this.state.discard.push(card);
    }
  }
  private takeCard(player: PlayerState, id: string) {
    const index = player.hand.findIndex((card) => card.id === id);
    if (index < 0) throw new Error("手牌不存在");
    const card = player.hand.splice(index, 1)[0];
    if (
      !player.hand.length &&
      !this.suppressLianying.has(card.id) &&
      player.alive &&
      player.general.skills.includes("lianying")
    ) {
      this.queueOptionalDraw(player, "lianying", 1);
      this.log("skill.lianying.wait", `${player.name}可以发动连营摸一张牌`);
    }
    return card;
  }
  private requireTurn(id: string) {
    if (this.state.currentPlayerId !== id) throw new Error("还没有轮到该玩家");
    return this.player(id);
  }
  private hasSkill(player: PlayerState, skillId: string) {
    if (["hujia", "jijiang", "jiuyuan"].includes(skillId))
      return (
        player.identity === "lord" && this.skillIds(player).includes(skillId)
      );
    return this.skillIds(player).includes(skillId);
  }
  private skillIds(player: PlayerState) {
    return [
      ...new Set([
        ...player.general.skills,
        ...Object.keys(player.grantedSkills ?? {}),
      ]),
    ];
  }
  private player(id: string): PlayerState;
  private player(id: string, required: false): PlayerState | undefined;
  private player(id: string, required = true) {
    const found = this.state.players.find((player) => player.id === id);
    if (!found && required) throw new Error("玩家不存在");
    return found;
  }
  private kill(player: PlayerState, source?: PlayerState) {
    player.alive = false;
    player.hp = 0;
    this.state.discard.push(
      ...player.hand.splice(0),
      ...player.judgment.splice(0),
      ...Object.values(player.equipment).filter((card): card is Card =>
        Boolean(card),
      ),
    );
    player.equipment = {};
    this.log("player.die", `${player.name}阵亡`);
    if (source?.alive) {
      if (player.identity === "rebel") {
        this.draw(source, 3);
        this.log("death.reward", `${source.name}击杀反贼，摸三张牌`);
      }
      if (source.identity === "lord" && player.identity === "loyalist") {
        this.state.discard.push(
          ...source.hand.splice(0),
          ...Object.values(source.equipment).filter((card): card is Card =>
            Boolean(card),
          ),
        );
        source.equipment = {};
        this.log("death.penalty", `${source.name}误杀忠臣，弃置所有牌`);
      }
    }
    this.checkWinner();
  }
  private checkWinner() {
    const alive = this.state.players.filter((player) => player.alive);
    if (this.state.mode.winCondition === "lastAlive") {
      if (alive.length === 1) this.finish(alive[0].id);
      return;
    }
    const lord = this.state.players.find((p) => p.identity === "lord");
    const rebels = this.state.players.filter(
      (p) => p.identity === "rebel" && p.alive,
    );
    const renegade = this.state.players.some(
      (p) => p.identity === "renegade" && p.alive,
    );
    if (!lord?.alive) {
      if (alive.length === 1 && alive[0].identity === "renegade")
        this.finish("renegade");
      else this.finish("rebel");
    } else if (!rebels.length && !renegade) this.finish("lord");
  }
  private finish(winner: string) {
    this.state.status = "finished";
    this.state.winner = winner;
    this.state.phase = "finished";
    this.log("game.over", `游戏结束，胜者：${winner}`);
  }
  private log(type: string, text: string, data?: unknown) {
    this.state.log.push({ sequence: ++this.state.sequence, type, text, data });
  }
}
function buildDeck(
  deck: DeckDefinition | undefined,
  definitions: Map<string, CardDefinition>,
) {
  if (!deck) {
    return standardDeck.map(([suit, rank, cardId], index) => {
      const definition = definitions.get(cardId);
      if (!definition) throw new Error(`标准牌堆引用了不存在的卡牌 ${cardId}`);
      return {
        id: `c${index + 1}`,
        name: definition.id,
        displayName: definition.name,
        suit,
        rank,
        type: definition.type,
        subtype: definition.subtype,
        range: definition.range,
      };
    });
  }
  const suits: Suit[] = ["spade", "heart", "club", "diamond"];
  const entries = deck.cards;
  const result: Card[] = [];
  for (const entry of entries) {
    const definition = definitions.get(entry.cardId);
    if (!definition) throw new Error(`牌堆引用了不存在的卡牌 ${entry.cardId}`);
    for (let i = 0; i < entry.count; i++)
      result.push({
        id: `c${result.length + 1}`,
        name: definition.id,
        displayName: definition.name,
        suit: suits[result.length % 4],
        rank: (result.length % 13) + 1,
        type: definition.type,
        subtype: definition.subtype,
        range: definition.range,
      });
  }
  return result;
}
export function replay(config: GameConfig, commands: GameCommand[]) {
  const game = HeadlessGame.create(config);
  commands.forEach((command) => game.dispatch(command));
  return game;
}
export function chooseAiCommand(
  game: HeadlessGame,
  playerId?: string,
): GameCommand {
  const state = game.state;
  const pending = state.pending;
  const expected =
    pending?.kind === "dying"
      ? pending.responders[pending.responderIndex]
      : (pending?.playerId ?? state.currentPlayerId);
  const id = playerId ?? expected;
  if (id !== expected) throw new Error("当前无需该玩家操作");
  const player = state.players.find((item) => item.id === id);
  if (!player) throw new Error("AI 玩家不存在");
  if (pending?.kind === "selectGeneral")
    return {
      type: "chooseGeneral",
      playerId: id,
      generalId: pending.choices[0].id,
    };
  if (pending?.kind === "customSkill") {
    if (pending.selection.kind === "card") {
      const cards = [
        ...player.hand,
        ...(pending.selection.cardZone === "own"
          ? Object.values(player.equipment).filter((card): card is Card =>
              Boolean(card),
            )
          : []),
      ];
      return {
        type: "activateSkill",
        playerId: id,
        skillId: pending.skillId,
        cardIds: cards.slice(0, pending.selection.min).map((card) => card.id),
      };
    }
    if (pending.selection.kind === "option")
      return {
        type: "activateSkill",
        playerId: id,
        skillId: pending.skillId,
        optionId: pending.selection.options?.[0]?.id,
      };
    if (pending.selection.kind === "number")
      return {
        type: "activateSkill",
        playerId: id,
        skillId: pending.skillId,
        numberValue: pending.selection.min,
      };
    if (pending.selection.kind === "suit")
      return {
        type: "activateSkill",
        playerId: id,
        skillId: pending.skillId,
        suit: pending.selection.suits?.[0] ?? "spade",
      };
    const targets = state.players.filter((target) => {
      if (!target.alive) return false;
      if (pending.selection.targetFilter === "self") return target.id === id;
      if (pending.selection.targetFilter === "other") return target.id !== id;
      if (pending.selection.targetFilter === "wounded")
        return target.hp < target.maxHp;
      return true;
    });
    return {
      type: "activateSkill",
      playerId: id,
      skillId: pending.skillId,
      targetIds: targets
        .slice(0, pending.selection.min)
        .map((target) => target.id),
    };
  }
  if (pending?.kind === "ganglie")
    return player.hand.length >= 2
      ? {
          type: "discardCards",
          playerId: id,
          cardIds: player.hand.slice(0, 2).map((card) => card.id),
        }
      : { type: "respond", playerId: id };
  if (pending?.kind === "discard" || pending?.kind === "guanshi")
    return {
      type: "discardCards",
      playerId: id,
      cardIds:
        pending.kind === "guanshi"
          ? pending.cardIds.slice(0, pending.count)
          : player.hand.slice(0, pending.count).map((card) => card.id),
    };
  if (pending?.kind === "wugu")
    return { type: "chooseCard", playerId: id, cardId: pending.cards[0].id };
  if (pending?.kind === "qilin")
    return { type: "chooseCard", playerId: id, cardId: pending.cardIds[0] };
  if (pending?.kind === "hanbing")
    return { type: "chooseCard", playerId: id, cardId: pending.cardIds[0] };
  if (pending?.kind === "otherCard")
    return { type: "chooseCard", playerId: id, cardId: pending.cardIds[0] };
  if (pending?.kind === "phaseSkill")
    return {
      type: "activateSkill",
      playerId: id,
      skillId: pending.skillId,
    };
  if (pending?.kind === "yiji")
    return {
      type: "activateSkill",
      playerId: id,
      skillId: "yiji",
      cardIds: pending.cards.map((card) => card.id),
      targetIds: [id],
    };
  if (pending?.kind === "liuli")
    return {
      type: "activateSkill",
      playerId: id,
      skillId: "liuli",
      cardIds: [pending.cardIds[0]],
      targetIds: [pending.targetIds[0]],
    };
  if (pending?.kind === "cixiong")
    return { type: "respond", playerId: id, cardId: player.hand[0]?.id };
  if (pending?.kind === "fanjian")
    return { type: "chooseSuit", playerId: id, suit: "spade" };
  if (pending?.kind === "tuxi")
    return {
      type: "activateSkill",
      playerId: id,
      skillId: "tuxi",
      targetIds: state.players
        .filter(
          (candidate) =>
            candidate.alive && candidate.id !== id && candidate.hand.length,
        )
        .slice(0, 2)
        .map((candidate) => candidate.id),
    };
  if (pending?.kind === "fankui") {
    const source = state.players.find(
      (candidate) => candidate.id === pending.sourceId,
    );
    const cardId = pending.cardIds.find((candidateId) =>
      candidateId === "random-hand"
        ? Boolean(source?.hand.length)
        : Object.values(source?.equipment ?? {}).some(
            (card) => card?.id === candidateId,
          ),
    );
    return cardId
      ? { type: "chooseCard", playerId: id, cardId }
      : { type: "respond", playerId: id };
  }
  if (pending?.kind === "guanxing")
    return {
      type: "arrangeCards",
      playerId: id,
      topIds: [...pending.cards]
        .sort((a, b) => a.rank - b.rank)
        .map((card) => card.id),
      bottomIds: [],
    };
  if (pending?.kind === "jianxiong")
    return { type: "activateSkill", playerId: id, skillId: "jianxiong" };
  if (pending?.kind === "yijiChoice")
    return { type: "activateSkill", playerId: id, skillId: "yiji" };
  if (pending?.kind === "optionalTrigger")
    return {
      type: "activateSkill",
      playerId: id,
      skillId: pending.skillId,
    };
  if (pending?.kind === "judgmentSkill")
    return {
      type: "activateSkill",
      playerId: id,
      skillId: pending.skillId,
    };
  if (pending?.kind === "judgment")
    return pending.stage === "tiandu"
      ? { type: "activateSkill", playerId: id, skillId: "tiandu" }
      : { type: "respond", playerId: id };
  if (pending) {
    const required =
      pending.kind === "wuxie"
        ? "wuxie"
        : pending.kind === "dying"
          ? "tao"
          : pending.kind === "shan" ||
              pending.kind === "wanjian" ||
              pending.kind === "hujia"
            ? "shan"
            : "sha";
    const responseCards = [
      ...player.hand,
      ...Object.values(player.equipment).filter((item): item is Card =>
        Boolean(item),
      ),
    ];
    const card = responseCards.find((item) => {
      const inHand = player.hand.some((candidate) => candidate.id === item.id);
      if (item.name === required) return true;
      const red = item.suit === "heart" || item.suit === "diamond";
      if (
        required === "shan" &&
        inHand &&
        player.general.skills.includes("qingguo") &&
        !red
      )
        return true;
      if (
        required === "tao" &&
        player.general.skills.includes("jijiu") &&
        red &&
        state.currentPlayerId !== id
      )
        return true;
      if (
        required === "sha" &&
        player.general.skills.includes("wusheng") &&
        red
      )
        return true;
      return (
        inHand &&
        player.general.skills.includes("longdan") &&
        ((required === "shan" && item.name === "sha") ||
          (required === "sha" && item.name === "shan"))
      );
    });
    return { type: "respond", playerId: id, cardId: card?.id };
  }
  if (state.phase !== "play") return { type: "endTurn", playerId: id };
  const customActiveSkill = game.availableCustomActiveSkill(id);
  if (customActiveSkill)
    return {
      type: "activateSkill",
      playerId: id,
      skillId: customActiveSkill,
    };
  const woundedTao =
    player.hp < player.maxHp
      ? player.hand.find((card) => card.name === "tao")
      : undefined;
  if (woundedTao)
    return { type: "useCard", playerId: id, cardId: woundedTao.id };
  const equipment = player.hand.find((card) => card.type === "equipment");
  if (equipment) return { type: "useCard", playerId: id, cardId: equipment.id };
  const selfCard = player.hand.find(
    (card) =>
      ["wuzhong", "wugu", "taoyuan", "nanman", "wanjian"].includes(card.name) ||
      (card.name === "shandian" &&
        !player.judgment.some((item) => item.name === "shandian")),
  );
  if (selfCard) return { type: "useCard", playerId: id, cardId: selfCard.id };
  const enemies = state.players
    .filter((candidate) => candidate.alive && candidate.id !== id)
    .sort((a, b) => {
      const score = (candidate: PlayerState) => {
        if (player.identity === "rebel")
          return candidate.identity === "lord" ? 0 : 2;
        if (player.identity === "lord" || player.identity === "loyalist")
          return candidate.identity === "rebel"
            ? 0
            : candidate.identity === "renegade"
              ? 1
              : 2;
        return candidate.hp;
      };
      return score(a) - score(b);
    });
  const sha = player.hand.find((card) => card.name === "sha");
  const shaTarget = enemies.find(
    (target) =>
      game.distance(id, target.id) <= (player.equipment.weapon?.range ?? 1) &&
      !(target.general.skills.includes("kongcheng") && !target.hand.length),
  );
  if (
    sha &&
    shaTarget &&
    (!state.shaUsed ||
      player.equipment.weapon?.name === "zhuge" ||
      player.general.skills.includes("paoxiao"))
  )
    return {
      type: "useCard",
      playerId: id,
      cardId: sha.id,
      targetId: shaTarget.id,
    };
  const jiedao = player.hand.find((card) => card.name === "jiedao");
  if (jiedao) {
    const holder = enemies.find((candidate) => candidate.equipment.weapon);
    const victim =
      holder &&
      state.players.find(
        (candidate) =>
          candidate.alive &&
          candidate.id !== holder.id &&
          game.distance(holder.id, candidate.id) <=
            (holder.equipment.weapon?.range ?? 1),
      );
    if (holder && victim)
      return {
        type: "useCard",
        playerId: id,
        cardId: jiedao.id,
        targetIds: [holder.id, victim.id],
      };
  }
  const targeted = player.hand.find((card) =>
    ["guohe", "shunshou", "juedou", "lebu"].includes(card.name),
  );
  if (targeted) {
    const target = enemies.find((candidate) => {
      if (
        (targeted.name === "shunshou" || targeted.name === "guohe") &&
        !(
          candidate.hand.length ||
          Object.values(candidate.equipment).some(Boolean) ||
          candidate.judgment.length
        )
      )
        return false;
      if (
        targeted.name === "shunshou" &&
        !player.general.skills.includes("qicai") &&
        game.distance(id, candidate.id) > 1
      )
        return false;
      if (
        (targeted.name === "shunshou" || targeted.name === "lebu") &&
        candidate.general.skills.includes("qianxun")
      )
        return false;
      if (
        targeted.name === "lebu" &&
        candidate.judgment.some((item) => item.name === "lebu")
      )
        return false;
      if (
        targeted.name === "juedou" &&
        candidate.general.skills.includes("kongcheng") &&
        !candidate.hand.length
      )
        return false;
      return true;
    });
    if (target)
      return {
        type: "useCard",
        playerId: id,
        cardId: targeted.id,
        targetId: target.id,
      };
  }
  return { type: "endTurn", playerId: id };
}
export { standardGenerals, standardCards, standardDeck, defaultMode };
