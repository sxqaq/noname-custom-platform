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
    validateEffects(item.effects, `技能 ${item.name}`, errors);
    if (item.effects.length > 64)
      errors.push(`技能 ${item.name} 节点超过 64 个`);
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
function validateEffects(effects: unknown, owner: string, errors: string[]) {
  if (!Array.isArray(effects) || !effects.length) {
    errors.push(`${owner} 至少需要一个效果节点`);
    return;
  }
  effects.forEach((effect, index) => {
    if (
      !effect ||
      typeof effect !== "object" ||
      !("type" in effect) ||
      !("target" in effect)
    )
      errors.push(`${owner} 的节点 ${index + 1} 不合法`);
  });
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
