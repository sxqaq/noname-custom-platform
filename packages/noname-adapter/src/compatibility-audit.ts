import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export type NonameApiCompatibility =
  "direct" | "shimmed" | "migrated" | "unsupported";

export interface NonameApiUsage {
  api: string;
  calls: number;
  packs: string[];
  compatibility: NonameApiCompatibility;
  replacement?: string;
}

export interface NonameCompatibilityAudit {
  generatedFrom: string;
  packCount: number;
  usages: NonameApiUsage[];
  summary: Record<NonameApiCompatibility, number>;
  callSummary: Record<NonameApiCompatibility, number>;
}

const compatibility = new Map<
  string,
  { status: NonameApiCompatibility; replacement?: string }
>([
  ["Math.random", { status: "direct", replacement: "宿主种子随机源" }],
  [
    "player.chooseBool",
    { status: "shimmed", replacement: "player-choice/bool" },
  ],
  [
    "player.chooseCard",
    { status: "shimmed", replacement: "player-choice/card" },
  ],
  [
    "player.chooseControl",
    { status: "shimmed", replacement: "player-choice/option" },
  ],
  [
    "player.chooseTarget",
    { status: "shimmed", replacement: "player-choice/target" },
  ],
  [
    "player.chooseToDiscard",
    { status: "shimmed", replacement: "player-choice/card" },
  ],
  [
    "player.gainPlayerCard",
    { status: "shimmed", replacement: "player-choice/card" },
  ],
  [
    "player.chooseButton",
    { status: "shimmed", replacement: "player-choice/button" },
  ],
  [
    "player.choosePlayerCard",
    { status: "shimmed", replacement: "player-choice/card" },
  ],
  [
    "player.discardPlayerCard",
    { status: "shimmed", replacement: "player-choice/card" },
  ],
  [
    "player.chooseUseTarget",
    { status: "shimmed", replacement: "player-choice/card+target" },
  ],
  [
    "player.chooseToCompare",
    { status: "shimmed", replacement: "player-choice/compare" },
  ],
  [
    "player.chooseToUse",
    { status: "shimmed", replacement: "player-choice/card+target" },
  ],
  [
    "player.chooseToRespond",
    { status: "shimmed", replacement: "player-choice/card" },
  ],
  [
    "player.chooseCardTarget",
    { status: "shimmed", replacement: "player-choice/card+target" },
  ],
  [
    "player.chooseDrawRecover",
    { status: "shimmed", replacement: "player-choice/option" },
  ],
  [
    "player.chooseControlList",
    { status: "shimmed", replacement: "player-choice/option" },
  ],
  ["get.suit", { status: "shimmed", replacement: "结构化卡牌花色" }],
  ["get.translation", { status: "shimmed", replacement: "稳定 ID/显示文本" }],
  ["game.log", { status: "shimmed", replacement: "runtime logs" }],
  ["get.name", { status: "migrated", replacement: "结构化卡牌 name" }],
  ["get.color", { status: "migrated", replacement: "由结构化 suit 推导" }],
  ["get.number", { status: "migrated", replacement: "结构化卡牌 rank" }],
  ["get.type", { status: "migrated", replacement: "结构化卡牌定义 type" }],
  ["get.type2", { status: "migrated", replacement: "结构化卡牌定义 type" }],
  ["get.event", { status: "migrated", replacement: "input.context.events" }],
  [
    "get.player",
    { status: "migrated", replacement: "input.context.actorPlayerId" },
  ],
  [
    "game.hasPlayer",
    { status: "migrated", replacement: "input.game.players.some" },
  ],
  [
    "game.filterPlayer",
    { status: "migrated", replacement: "input.game.players.filter" },
  ],
  [
    "game.countPlayer",
    { status: "migrated", replacement: "input.game.players" },
  ],
  [
    "player.countCards",
    { status: "migrated", replacement: "结构化玩家区域长度" },
  ],
  ["player.getCards", { status: "migrated", replacement: "结构化玩家区域" }],
  [
    "player.hasSkill",
    { status: "migrated", replacement: "general/grantedSkills" },
  ],
  [
    "player.getStorage",
    { status: "migrated", replacement: "runtime state/marks" },
  ],
  ["player.countMark", { status: "migrated", replacement: "player.marks" }],
  ["player.draw", { status: "migrated", replacement: "effect.draw" }],
  ["player.recover", { status: "migrated", replacement: "effect.recover" }],
  ["player.damage", { status: "migrated", replacement: "effect.damage" }],
  ["player.loseHp", { status: "migrated", replacement: "effect.loseHp" }],
  ["player.addMark", { status: "migrated", replacement: "effect.mark" }],
  ["player.addSkill", { status: "migrated", replacement: "effect.grantSkill" }],
  [
    "player.removeSkill",
    { status: "migrated", replacement: "effect.removeSkill" },
  ],
  ["player.gain", { status: "migrated", replacement: "effect.moveCards" }],
  ["player.discard", { status: "migrated", replacement: "effect.discard" }],
  [
    "player.addTempSkill",
    { status: "migrated", replacement: "effect.grantSkill(turn)" },
  ],
  [
    "player.addSkills",
    { status: "migrated", replacement: "effect.grantSkill(game)" },
  ],
  [
    "player.removeSkills",
    { status: "migrated", replacement: "effect.removeSkill" },
  ],
  [
    "player.removeMark",
    { status: "migrated", replacement: "effect.removeMark" },
  ],
  [
    "player.loseMaxHp",
    { status: "migrated", replacement: "effect.changeMaxHp(-n)" },
  ],
  [
    "player.gainMaxHp",
    { status: "migrated", replacement: "effect.changeMaxHp(+n)" },
  ],
  ["player.drawTo", { status: "migrated", replacement: "effect.draw" }],
  ["player.recoverTo", { status: "migrated", replacement: "effect.recover" }],
  [
    "player.awakenSkill",
    { status: "migrated", replacement: "effect.addMark(awakened)" },
  ],
  ["player.skip", { status: "migrated", replacement: "effect.skipPhase" }],
  ["player.hasCard", { status: "shimmed", replacement: "player proxy zones" }],
  ["player.hasCards", { status: "shimmed", replacement: "player proxy zones" }],
  ["player.getEquip", { status: "shimmed", replacement: "player equipment" }],
  ["player.getEquips", { status: "shimmed", replacement: "player equipment" }],
  ["player.getSkills", { status: "shimmed", replacement: "player skills" }],
  ["player.getHp", { status: "shimmed", replacement: "player hp" }],
  ["player.getDamagedHp", { status: "shimmed", replacement: "maxHp - hp" }],
  ["player.isDamaged", { status: "shimmed", replacement: "hp < maxHp" }],
  ["player.isHealthy", { status: "shimmed", replacement: "hp >= maxHp" }],
  ["player.isIn", { status: "shimmed", replacement: "player alive" }],
  [
    "player.setStorage",
    { status: "shimmed", replacement: "checkpointed runtime storage" },
  ],
  [
    "player.markAuto",
    { status: "shimmed", replacement: "checkpointed runtime storage" },
  ],
  [
    "player.unmarkAuto",
    { status: "shimmed", replacement: "checkpointed runtime storage" },
  ],
  ["player.getNext", { status: "shimmed", replacement: "seat order" }],
  ["player.getPrevious", { status: "shimmed", replacement: "seat order" }],
  ["player.logSkill", { status: "shimmed", replacement: "runtime logs" }],
  ["player.markSkill", { status: "shimmed", replacement: "runtime logs" }],
  ["player.unmarkSkill", { status: "shimmed", replacement: "runtime logs" }],
  ["player.line", { status: "shimmed", replacement: "runtime logs" }],
  ["player.popup", { status: "shimmed", replacement: "runtime logs" }],
  ["player.chat", { status: "shimmed", replacement: "runtime logs" }],
  [
    "event.getParent",
    { status: "shimmed", replacement: "serializable event parent graph" },
  ],
  [
    "trigger.getParent",
    { status: "shimmed", replacement: "serializable event parent graph" },
  ],
  [
    "event.getTrigger",
    { status: "shimmed", replacement: "serializable trigger link" },
  ],
  ["event.getl", { status: "shimmed", replacement: "structured loss history" }],
  [
    "trigger.getl",
    { status: "shimmed", replacement: "structured loss history" },
  ],
  ["event.getg", { status: "shimmed", replacement: "structured gain history" }],
  [
    "trigger.getg",
    { status: "shimmed", replacement: "structured gain history" },
  ],
  [
    "event.getd",
    { status: "shimmed", replacement: "structured discard history" },
  ],
  [
    "trigger.getd",
    { status: "shimmed", replacement: "structured discard history" },
  ],
  ["event.hasNature", { status: "shimmed", replacement: "event nature" }],
  ["trigger.hasNature", { status: "shimmed", replacement: "event nature" }],
  ["event.notLink", { status: "shimmed", replacement: "event linked flag" }],
  ["trigger.notLink", { status: "shimmed", replacement: "event linked flag" }],
  ["event.set", { status: "migrated", replacement: "event mutation journal" }],
  [
    "event.cancel",
    { status: "migrated", replacement: "event mutation journal" },
  ],
  [
    "trigger.cancel",
    { status: "migrated", replacement: "event mutation journal" },
  ],
  [
    "event.finish",
    { status: "migrated", replacement: "event mutation journal" },
  ],
  ["event.goto", { status: "migrated", replacement: "event mutation journal" }],
  [
    "trigger.untrigger",
    { status: "migrated", replacement: "event mutation journal" },
  ],
  [
    "trigger.changeToZero",
    { status: "migrated", replacement: "event mutation journal" },
  ],
]);

export async function auditPinnedNonameApiUsage(upstreamRoot: string) {
  const characterRoot = resolve(upstreamRoot, "apps/core/character");
  const entries = await readdir(characterRoot, { withFileTypes: true });
  const packs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const aggregate = new Map<string, { calls: number; packs: Set<string> }>();
  for (const pack of packs) {
    const source = await readFile(
      resolve(characterRoot, pack, "skill.js"),
      "utf8",
    );
    for (const [api, calls] of analyzeNonameApiUsage(source)) {
      const current = aggregate.get(api) ?? {
        calls: 0,
        packs: new Set<string>(),
      };
      current.calls += calls;
      current.packs.add(pack);
      aggregate.set(api, current);
    }
  }
  const usages: NonameApiUsage[] = [...aggregate]
    .map(([api, value]) => {
      const mapped = mappingForApi(api);
      return {
        api,
        calls: value.calls,
        packs: [...value.packs].sort(),
        compatibility: mapped?.status ?? ("unsupported" as const),
        replacement: mapped?.replacement,
      };
    })
    .sort(
      (left, right) =>
        right.calls - left.calls || left.api.localeCompare(right.api),
    );
  const summary: NonameCompatibilityAudit["summary"] = {
    direct: 0,
    shimmed: 0,
    migrated: 0,
    unsupported: 0,
  };
  const callSummary: NonameCompatibilityAudit["callSummary"] = {
    direct: 0,
    shimmed: 0,
    migrated: 0,
    unsupported: 0,
  };
  usages.forEach((usage) => {
    summary[usage.compatibility]++;
    callSummary[usage.compatibility] += usage.calls;
  });
  return {
    generatedFrom: resolve(upstreamRoot),
    packCount: packs.length,
    usages,
    summary,
    callSummary,
  } satisfies NonameCompatibilityAudit;
}

export function analyzeNonameApiUsage(source: string) {
  const result = new Map<string, number>();
  const pattern =
    /\b(player|game|get|event|trigger|ui|Math)\.([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const api = `${match[1]}.${match[2]}`;
    result.set(api, (result.get(api) ?? 0) + 1);
  }
  const proxiedPlayerMethods = [
    "chooseBool",
    "chooseCard",
    "chooseControl",
    "chooseTarget",
    "chooseToDiscard",
    "gainPlayerCard",
    "chooseButton",
    "choosePlayerCard",
    "discardPlayerCard",
    "chooseUseTarget",
    "chooseToCompare",
    "chooseToUse",
    "chooseToRespond",
    "chooseCardTarget",
    "chooseDrawRecover",
    "chooseControlList",
    "draw",
    "recover",
    "damage",
    "loseHp",
    "addMark",
    "addSkill",
    "removeSkill",
    "gain",
    "discard",
    "addTempSkill",
    "addSkills",
    "removeSkills",
    "removeMark",
    "loseMaxHp",
    "gainMaxHp",
    "drawTo",
    "recoverTo",
  ].join("|");
  const playerAliasPattern = new RegExp(
    `\\b(?!player\\b)[A-Za-z_$][\\w$]*\\s*\\.(${proxiedPlayerMethods})\\s*\\(`,
    "g",
  );
  for (const match of source.matchAll(playerAliasPattern)) {
    const api = `player.${match[1]}`;
    result.set(api, (result.get(api) ?? 0) + 1);
  }
  const proxiedEventMethods = [
    "getParent",
    "getTrigger",
    "getl",
    "getg",
    "getd",
    "hasNature",
    "notLink",
    "set",
    "cancel",
    "finish",
    "goto",
    "untrigger",
    "changeToZero",
  ].join("|");
  const eventAliasPattern = new RegExp(
    `\\b(?!event\\b|trigger\\b)[A-Za-z_$][\\w$]*\\s*\\.(${proxiedEventMethods})\\s*\\(`,
    "g",
  );
  for (const match of source.matchAll(eventAliasPattern)) {
    const api = `event.${match[1]}`;
    result.set(api, (result.get(api) ?? 0) + 1);
  }
  return result;
}

export function compatibilityForApi(api: string) {
  const mapped = mappingForApi(api);
  return {
    api,
    compatibility: mapped?.status ?? ("unsupported" as const),
    replacement: mapped?.replacement,
  };
}

function mappingForApi(api: string) {
  if (api.startsWith("Math."))
    return (
      compatibility.get(api) ?? {
        status: "direct" as const,
        replacement: "隔离运行时确定性 Math",
      }
    );
  return compatibility.get(api);
}
