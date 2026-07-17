import type {
  CardDefinitionDto,
  ExtensionPackageDto,
  GeneralCardStyleDto,
  GeneralDto,
  SkillDto,
} from "@sgs/protocol";

export const defaultCardStyle = (): GeneralCardStyleDto => ({
  template: "classic",
  portraitX: 50,
  portraitY: 45,
  portraitScale: 1,
  accentColor: "#991b1b",
  textColor: "#fffaf0",
  showSkillText: true,
});

export const uniqueId = (base: string, ids: Iterable<string>) => {
  const used = new Set(ids);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
};

export const createSkill = (ids: Iterable<string>): SkillDto => {
  const id = uniqueId("custom_skill", ids);
  return {
    id,
    name: "新技能",
    kind: "trigger",
    event: "turnStart",
    effects: [{ id: `${id}.effect`, type: "draw", target: "self", count: 1 }],
  };
};

export const createGeneral = (
  ids: Iterable<string>,
  skillId?: string,
): GeneralDto => ({
  id: uniqueId("custom_general", ids),
  name: "新武将",
  title: "",
  faction: "qun",
  gender: "male",
  hp: 4,
  skills: skillId ? [skillId] : [],
  cardStyle: defaultCardStyle(),
});

export const createCard = (ids: Iterable<string>): CardDefinitionDto => ({
  id: uniqueId("custom_card", ids),
  name: "新卡牌",
  type: "trick",
  target: "self",
  description: "",
  effects: [{ type: "draw", target: "self", count: 1 }],
});

export const createProject = (): ExtensionPackageDto => {
  const skill = createSkill([]);
  return {
    schemaVersion: 4,
    id: "custom.my_pack",
    name: "我的创作包",
    version: "1.0.0",
    license: "CC-BY-4.0",
    description: "",
    assets: [],
    generals: [createGeneral([], skill.id)],
    skills: [skill],
    cards: [
      {
        id: "custom_supply",
        name: "军资",
        type: "trick",
        target: "self",
        description: "摸两张牌",
        effects: [{ id: "c1", type: "draw", target: "self", count: 2 }],
      },
    ],
    decks: [
      {
        id: "custom_deck",
        name: "自定义牌堆",
        cards: [
          { cardId: "sha", count: 20 },
          { cardId: "shan", count: 14 },
          { cardId: "tao", count: 6 },
          { cardId: "custom_supply", count: 4 },
        ],
      },
    ],
    modes: [
      {
        id: "custom_mode",
        name: "朋友乱斗",
        minPlayers: 2,
        maxPlayers: 8,
        initialHand: 4,
        drawPerTurn: 2,
        winCondition: "lastAlive",
        deckId: "custom_deck",
      },
    ],
    tests: [
      {
        id: "smoke",
        name: "扩展冒烟测试",
        seed: 42,
        players: 2,
        expect: {
          noError: true,
          firstGeneral: "custom_general",
          firstHandAtLeast: 6,
        },
      },
    ],
  };
};

export const migrateProject = (input: ExtensionPackageDto) => {
  const project = structuredClone(input);
  return {
    ...project,
    schemaVersion: 4 as const,
    assets: project.assets ?? [],
    generals: project.generals.map((general) => ({
      ...general,
      title: general.title ?? "",
      cardStyle: general.cardStyle ?? defaultCardStyle(),
    })),
  } satisfies ExtensionPackageDto;
};

export const cloneGeneral = (
  source: GeneralDto,
  ids: Iterable<string>,
): GeneralDto => ({
  ...structuredClone(source),
  id: uniqueId(`${source.id}_copy`, ids),
  name: `${source.name}·副本`,
  portraitAssetId: undefined,
});

export const cloneSkill = (
  source: SkillDto,
  ids: Iterable<string>,
): SkillDto => ({
  ...structuredClone(source),
  id: uniqueId(`${source.id}_copy`, ids),
  name: `${source.name}·副本`,
});
