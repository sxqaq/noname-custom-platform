import { createHash } from "node:crypto";
import type { ExtensionPackageDto } from "@sgs/protocol";
export type ValidationResult =
  { ok: true; value: ExtensionPackageDto } | { ok: false; errors: string[] };
const idPattern = /^[a-z][a-z0-9_.-]{2,63}$/;
const validId = (id: unknown) => typeof id === "string" && idPattern.test(id);

export function validatePackage(input: unknown): ValidationResult {
  const errors: string[] = [];
  const value = input as Partial<ExtensionPackageDto>;
  if (!value || typeof value !== "object")
    return { ok: false, errors: ["扩展包必须是对象"] };
  if (value.schemaVersion !== 2 && value.schemaVersion !== 3)
    errors.push("schemaVersion 必须为 2 或 3");
  if (!validId(value.id)) errors.push("扩展 ID 不合法");
  if (!value.name?.trim()) errors.push("扩展名称不能为空");
  if (!value.version || !/^\d+\.\d+\.\d+$/.test(value.version))
    errors.push("版本必须使用 x.y.z 格式");
  for (const key of [
    "generals",
    "skills",
    "cards",
    "decks",
    "modes",
    "tests",
  ] as const)
    if (!Array.isArray(value[key])) errors.push(`${key} 必须是数组`);
  const skillIds = new Set(value.skills?.map((item) => item.id));
  const assetIds = new Set(value.assets?.map((item) => item.id));
  if (value.schemaVersion === 3 && !Array.isArray(value.assets))
    errors.push("schemaVersion 3 的 assets 必须是数组");
  const cardIds = new Set([
    "sha",
    "shan",
    "tao",
    "wuxie",
    "wuzhong",
    "guohe",
    "shunshou",
    "juedou",
    "nanman",
    "wanjian",
    "taoyuan",
    "wugu",
    "jiedao",
    "lebu",
    "shandian",
    "zhuge",
    "cixiong",
    "qinggang",
    "qinglong",
    "zhangba",
    "guanshi",
    "fangtian",
    "qilin",
    "hanbing",
    "bagua",
    "renwang",
    "chitu",
    "dawan",
    "zixin",
    "jueying",
    "dilu",
    "zhuahuang",
    ...(value.cards?.map((item) => item.id) ?? []),
  ]);
  const deckIds = new Set(value.decks?.map((item) => item.id));
  value.generals?.forEach((item, i) => {
    if (!validId(item.id)) errors.push(`武将 ${i + 1} ID 不合法`);
    if (!item.name?.trim()) errors.push(`武将 ${i + 1} 名称不能为空`);
    if (!Number.isInteger(item.hp) || item.hp < 1 || item.hp > 20)
      errors.push(`武将 ${i + 1} 体力须为 1–20`);
    if (item.gender && item.gender !== "male" && item.gender !== "female")
      errors.push(`武将 ${i + 1} 性别不合法`);
    item.skills?.forEach((id) => {
      if (!skillIds.has(id))
        errors.push(`武将 ${item.name} 引用了不存在的技能 ${id}`);
    });
    if (item.portraitAssetId && !assetIds.has(item.portraitAssetId))
      errors.push(
        `武将 ${item.name} 引用了不存在的立绘资源 ${item.portraitAssetId}`,
      );
  });
  const seenAssets = new Set<string>();
  value.assets?.forEach((item, i) => {
    if (!validId(item.id)) errors.push(`资源 ${i + 1} ID 不合法`);
    if (seenAssets.has(item.id)) errors.push(`资源 ID ${item.id} 重复`);
    seenAssets.add(item.id);
    if (!/^[a-f0-9]{64}$/.test(item.hash))
      errors.push(`资源 ${item.id} 哈希不合法`);
    if (item.thumbnailHash && !/^[a-f0-9]{64}$/.test(item.thumbnailHash))
      errors.push(`资源 ${item.id} 缩略图哈希不合法`);
    if (!Number.isInteger(item.bytes) || item.bytes < 1)
      errors.push(`资源 ${item.id} 大小不合法`);
    if (!item.mediaType?.startsWith("image/") && item.kind !== "audio")
      errors.push(`资源 ${item.id} 媒体类型不合法`);
  });
  value.skills?.forEach((item, i) => {
    if (!validId(item.id)) errors.push(`技能 ${i + 1} ID 不合法`);
    const kind = item.kind ?? "trigger";
    if (kind === "trigger" && !item.event)
      errors.push(`触发技能 ${item.name} 必须声明 event`);
    if (kind === "active") {
      if (item.event) errors.push(`主动技能 ${item.name} 不能声明 event`);
      if ((item.selections?.length ?? 0) > 8)
        errors.push(`主动技能 ${item.name} 的选择步骤不能超过 8 个`);
      const selectionIds = new Set<string>();
      item.selections?.forEach((selection, selectionIndex) => {
        if (!validId(selection.id))
          errors.push(
            `主动技能 ${item.name} 的第 ${selectionIndex + 1} 个选择 ID 不合法`,
          );
        if (selectionIds.has(selection.id))
          errors.push(`主动技能 ${item.name} 的选择 ID ${selection.id} 重复`);
        selectionIds.add(selection.id);
        if (!selection.prompt?.trim() || selection.prompt.length > 120)
          errors.push(`主动技能 ${item.name} 的选择提示不合法`);
        if (
          !Number.isInteger(selection.min) ||
          !Number.isInteger(selection.max) ||
          selection.min < 0 ||
          selection.max < selection.min ||
          selection.max > 8
        )
          errors.push(`主动技能 ${item.name} 的选择数量不合法`);
        if (selection.kind === "target" && !selection.targetFilter)
          errors.push(`主动技能 ${item.name} 的目标选择缺少 targetFilter`);
        if (selection.kind === "card" && !selection.cardZone)
          errors.push(`主动技能 ${item.name} 的卡牌选择缺少 cardZone`);
      });
    }
    validateEffects(item.effects, `技能 ${item.name}`, errors);
    if (countEffects(item.effects) > 256)
      errors.push(`技能 ${item.name} 的全部分支节点不能超过 256 个`);
  });
  value.cards?.forEach((item, i) => {
    if (!validId(item.id)) errors.push(`卡牌 ${i + 1} ID 不合法`);
    if (!item.name?.trim()) errors.push(`卡牌 ${i + 1} 名称不能为空`);
    validateEffects(item.effects, `卡牌 ${item.name}`, errors);
  });
  value.decks?.forEach((item) => {
    if (!validId(item.id)) errors.push(`牌堆 ${item.name} ID 不合法`);
    let total = 0;
    item.cards.forEach((entry) => {
      total += entry.count;
      if (!cardIds.has(entry.cardId))
        errors.push(`牌堆 ${item.name} 引用了不存在的卡牌 ${entry.cardId}`);
      if (
        !Number.isInteger(entry.count) ||
        entry.count < 1 ||
        entry.count > 200
      )
        errors.push(`牌堆 ${item.name} 数量不合法`);
    });
    if (total < 16 || total > 500)
      errors.push(`牌堆 ${item.name} 总数须为 16–500`);
  });
  value.modes?.forEach((item) => {
    if (!validId(item.id)) errors.push(`模式 ${item.name} ID 不合法`);
    if (
      item.minPlayers < 2 ||
      item.maxPlayers > 8 ||
      item.minPlayers > item.maxPlayers
    )
      errors.push(`模式 ${item.name} 玩家数不合法`);
    if (item.deckId && !deckIds.has(item.deckId))
      errors.push(`模式 ${item.name} 引用了不存在的牌堆 ${item.deckId}`);
  });
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: structuredClone(value as ExtensionPackageDto) };
}
function validateEffects(
  effects: unknown,
  owner: string,
  errors: string[],
  depth = 0,
  allowEmpty = false,
) {
  if (depth > 8) {
    errors.push(`${owner} 的效果嵌套不能超过 8 层`);
    return;
  }
  if (!Array.isArray(effects) || (!effects.length && !allowEmpty)) {
    errors.push(`${owner} 至少需要一个效果节点`);
    return;
  }
  if (!effects.length) return;
  effects.forEach((effect, index) => {
    if (
      !effect ||
      typeof effect !== "object" ||
      !("type" in effect) ||
      !("target" in effect)
    )
      errors.push(`${owner} 的节点 ${index + 1} 不合法`);
    else {
      const node = effect as {
        type: string;
        count?: unknown;
        amount?: unknown;
        mark?: unknown;
      };
      if (
        !["draw", "recover", "damage", "addMark", "discard", "judge"].includes(
          node.type,
        )
      )
        errors.push(`${owner} 的节点 ${index + 1} 类型不支持`);
      for (const [field, value] of [
        ["count", node.count],
        ["amount", node.amount],
      ] as const)
        if (
          value !== undefined &&
          (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 20)
        )
          errors.push(
            `${owner} 的节点 ${index + 1} ${field} 必须为 0–20 的整数`,
          );
      if (
        node.type === "addMark" &&
        node.mark !== undefined &&
        (typeof node.mark !== "string" || !validId(node.mark))
      )
        errors.push(`${owner} 的节点 ${index + 1} 标记 ID 不合法`);
    }
    if (effect.type === "judge") {
      const judge = effect as {
        target?: string;
        successSuits?: unknown;
        success?: unknown;
        failure?: unknown;
      };
      if (judge.target === "allOthers")
        errors.push(`${owner} 的判定节点不能以所有其他角色为目标`);
      if (
        !Array.isArray(judge.successSuits) ||
        !judge.successSuits.length ||
        judge.successSuits.some(
          (suit) =>
            !["spade", "heart", "club", "diamond"].includes(String(suit)),
        )
      )
        errors.push(`${owner} 的判定节点花色条件不合法`);
      validateEffects(
        judge.success,
        `${owner} 的判定成功分支`,
        errors,
        depth + 1,
      );
      if (judge.failure !== undefined)
        validateEffects(
          judge.failure,
          `${owner} 的判定失败分支`,
          errors,
          depth + 1,
          true,
        );
    }
  });
}

function countEffects(effects: unknown): number {
  if (!Array.isArray(effects)) return 0;
  return effects.reduce((total, effect) => {
    if (!effect || typeof effect !== "object") return total + 1;
    const node = effect as { success?: unknown; failure?: unknown };
    return total + 1 + countEffects(node.success) + countEffects(node.failure);
  }, 0);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function packageHash(value: ExtensionPackageDto): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export type { ExtensionPackageDto } from "@sgs/protocol";
