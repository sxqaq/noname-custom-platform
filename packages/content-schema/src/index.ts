import { createHash } from "node:crypto";
import type { ExtensionPackageDto } from "@sgs/protocol";
export type ValidationResult =
  { ok: true; value: ExtensionPackageDto } | { ok: false; errors: string[] };
const idPattern = /^[a-z][a-z0-9_.-]{2,63}$/;
const colorPattern = /^#[0-9a-f]{6}$/i;
const validId = (id: unknown) => typeof id === "string" && idPattern.test(id);

export function validatePackage(input: unknown): ValidationResult {
  const errors: string[] = [];
  const value = input as Partial<ExtensionPackageDto>;
  if (!value || typeof value !== "object")
    return { ok: false, errors: ["扩展包必须是对象"] };
  if (
    value.schemaVersion !== 2 &&
    value.schemaVersion !== 3 &&
    value.schemaVersion !== 4
  )
    errors.push("schemaVersion 必须为 2、3 或 4");
  if (!validId(value.id)) errors.push("扩展 ID 不合法");
  if (!value.name?.trim()) errors.push("扩展名称不能为空");
  if (!value.version || !/^\d+\.\d+\.\d+$/.test(value.version))
    errors.push("版本必须使用 x.y.z 格式");
  if (
    value.author !== undefined &&
    (!value.author.trim() || value.author.length > 80)
  )
    errors.push("作者名称须为 1–80 个字符");
  if (
    value.license !== undefined &&
    (!value.license.trim() || value.license.length > 80)
  )
    errors.push("许可证须为 1–80 个字符");
  if (value.description !== undefined && value.description.length > 2000)
    errors.push("扩展说明不能超过 2000 个字符");
  validateRuntime(value.runtime, errors);
  const dependencyIds = new Set<string>();
  value.dependencies?.forEach((dependency) => {
    if (!validId(dependency.id) || dependency.id === value.id)
      errors.push("扩展依赖 ID 不合法");
    if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(dependency.version))
      errors.push(`扩展依赖 ${dependency.id} 的版本不合法`);
    if (dependencyIds.has(dependency.id))
      errors.push(`扩展依赖 ${dependency.id} 重复`);
    dependencyIds.add(dependency.id);
  });
  for (const key of [
    "generals",
    "skills",
    "cards",
    "decks",
    "modes",
    "tests",
  ] as const)
    if (!Array.isArray(value[key])) errors.push(`${key} 必须是数组`);
  if ((value.generals?.length ?? 0) > 200) errors.push("武将数量不能超过 200");
  if ((value.skills?.length ?? 0) > 1000) errors.push("技能数量不能超过 1000");
  if ((value.cards?.length ?? 0) > 1000) errors.push("卡牌数量不能超过 1000");
  const skillIds = new Set(value.skills?.map((item) => item.id));
  const assetIds = new Set(value.assets?.map((item) => item.id));
  if (
    (value.schemaVersion === 3 || value.schemaVersion === 4) &&
    !Array.isArray(value.assets)
  )
    errors.push(`schemaVersion ${value.schemaVersion} 的 assets 必须是数组`);
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
  const generalIds = new Set<string>();
  value.generals?.forEach((item, i) => {
    if (!validId(item.id)) errors.push(`武将 ${i + 1} ID 不合法`);
    if (generalIds.has(item.id)) errors.push(`武将 ID ${item.id} 重复`);
    generalIds.add(item.id);
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
    if (item.title !== undefined && item.title.length > 40)
      errors.push(`武将 ${item.name} 称号不能超过 40 个字符`);
    if (item.cardStyle) {
      if (!["classic", "minimal", "ink"].includes(item.cardStyle.template))
        errors.push(`武将 ${item.name} 卡面模板不合法`);
      if (
        !Number.isFinite(item.cardStyle.portraitX) ||
        item.cardStyle.portraitX < 0 ||
        item.cardStyle.portraitX > 100 ||
        !Number.isFinite(item.cardStyle.portraitY) ||
        item.cardStyle.portraitY < 0 ||
        item.cardStyle.portraitY > 100 ||
        !Number.isFinite(item.cardStyle.portraitScale) ||
        item.cardStyle.portraitScale < 0.5 ||
        item.cardStyle.portraitScale > 3
      )
        errors.push(`武将 ${item.name} 卡面构图参数不合法`);
      if (
        !colorPattern.test(item.cardStyle.accentColor) ||
        !colorPattern.test(item.cardStyle.textColor)
      )
        errors.push(`武将 ${item.name} 卡面颜色不合法`);
    }
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
  const seenSkills = new Set<string>();
  value.skills?.forEach((item, i) => {
    if (!validId(item.id)) errors.push(`技能 ${i + 1} ID 不合法`);
    if (seenSkills.has(item.id)) errors.push(`技能 ID ${item.id} 重复`);
    seenSkills.add(item.id);
    const kind = item.kind ?? "trigger";
    if (kind === "trigger" && !item.event)
      errors.push(`触发技能 ${item.name} 必须声明 event`);
    if (
      item.event &&
      ![
        "turnStart",
        "turnEnd",
        "playPhaseStart",
        "discardPhaseStart",
        "afterDamage",
        "afterUseSha",
      ].includes(item.event)
    )
      errors.push(`触发技能 ${item.name} 的事件不受支持`);
    if (item.when)
      validateCondition(item.when, `技能 ${item.name} 的触发条件`, errors);
    if ((item.modifiers?.length ?? 0) > 32)
      errors.push(`技能 ${item.name} 的持续修正器不能超过 32 个`);
    item.modifiers?.forEach((modifier, modifierIndex) => {
      if (
        ![
          "handLimit",
          "drawCount",
          "attackRange",
          "distanceFrom",
          "distanceTo",
        ].includes(modifier.type)
      )
        errors.push(
          `技能 ${item.name} 的修正器 ${modifierIndex + 1} 类型不支持`,
        );
      if (
        !Number.isInteger(modifier.amount) ||
        modifier.amount < -20 ||
        modifier.amount > 20
      )
        errors.push(
          `技能 ${item.name} 的修正器 ${modifierIndex + 1} 数值不合法`,
        );
      if (modifier.when)
        validateCondition(
          modifier.when,
          `技能 ${item.name} 的修正器 ${modifierIndex + 1} 条件`,
          errors,
        );
    });
    if (kind === "active") {
      if (item.event) errors.push(`主动技能 ${item.name} 不能声明 event`);
      if ((item.selections?.length ?? 0) > 8)
        errors.push(`主动技能 ${item.name} 的选择步骤不能超过 8 个`);
      const selectionIds = new Set<string>();
      item.selections?.forEach((selection, selectionIndex) => {
        if (
          !["target", "card", "option", "number", "suit"].includes(
            selection.kind,
          )
        )
          errors.push(
            `主动技能 ${item.name} 的第 ${selectionIndex + 1} 个选择类型不支持`,
          );
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
          selection.max < selection.min ||
          ((selection.kind === "target" || selection.kind === "card") &&
            (selection.min < 0 || selection.max > 8)) ||
          (selection.kind === "number" &&
            (selection.min < -1000 || selection.max > 1000))
        )
          errors.push(`主动技能 ${item.name} 的选择范围不合法`);
        if (selection.kind === "target" && !selection.targetFilter)
          errors.push(`主动技能 ${item.name} 的目标选择缺少 targetFilter`);
        if (selection.kind === "card" && !selection.cardZone)
          errors.push(`主动技能 ${item.name} 的卡牌选择缺少 cardZone`);
        if (selection.kind === "option") {
          if (
            !selection.options ||
            selection.options.length < 2 ||
            selection.options.length > 16
          )
            errors.push(`主动技能 ${item.name} 的选项须为 2–16 项`);
          const optionIds = new Set<string>();
          selection.options?.forEach((option) => {
            if (!validId(option.id) || optionIds.has(option.id))
              errors.push(`主动技能 ${item.name} 的选项 ID 不合法或重复`);
            optionIds.add(option.id);
            if (!option.label.trim() || option.label.length > 80)
              errors.push(`主动技能 ${item.name} 的选项名称不合法`);
            if (
              option.value !== undefined &&
              (!Number.isInteger(option.value) || Math.abs(option.value) > 1000)
            )
              errors.push(`主动技能 ${item.name} 的选项值不合法`);
          });
        }
        if (
          selection.kind === "suit" &&
          (selection.suits?.length === 0 ||
            selection.suits?.some(
              (suit) => !["spade", "heart", "club", "diamond"].includes(suit),
            ) ||
            (selection.suits &&
              new Set(selection.suits).size !== selection.suits.length))
        )
          errors.push(`主动技能 ${item.name} 的花色范围不合法`);
      });
    }
    validateEffects(item.effects, `技能 ${item.name}`, errors);
    if (countEffects(item.effects) > 256)
      errors.push(`技能 ${item.name} 的全部分支节点不能超过 256 个`);
    if (item.graph) validateGraph(item.graph, `技能 ${item.name}`, errors);
  });
  const seenCards = new Set<string>();
  value.cards?.forEach((item, i) => {
    if (!validId(item.id)) errors.push(`卡牌 ${i + 1} ID 不合法`);
    if (seenCards.has(item.id)) errors.push(`卡牌 ID ${item.id} 重复`);
    seenCards.add(item.id);
    if (!item.name?.trim()) errors.push(`卡牌 ${i + 1} 名称不能为空`);
    if (item.faceAssetId && !assetIds.has(item.faceAssetId))
      errors.push(
        `卡牌 ${item.name} 引用了不存在的卡面资源 ${item.faceAssetId}`,
      );
    validateEffects(item.effects, `卡牌 ${item.name}`, errors);
  });
  const seenDecks = new Set<string>();
  value.decks?.forEach((item) => {
    if (!validId(item.id)) errors.push(`牌堆 ${item.name} ID 不合法`);
    if (seenDecks.has(item.id)) errors.push(`牌堆 ID ${item.id} 重复`);
    seenDecks.add(item.id);
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
  const seenModes = new Set<string>();
  value.modes?.forEach((item) => {
    if (!validId(item.id)) errors.push(`模式 ${item.name} ID 不合法`);
    if (seenModes.has(item.id)) errors.push(`模式 ID ${item.id} 重复`);
    seenModes.add(item.id);
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

function validateGraph(
  graph: NonNullable<ExtensionPackageDto["skills"][number]["graph"]>,
  owner: string,
  errors: string[],
) {
  if (!validId(graph.entry)) errors.push(`${owner} 的节点图入口 ID 不合法`);
  validateEffects(graph.nodes, `${owner} 的节点图`, errors);
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.id || !validId(node.id)) {
      errors.push(`${owner} 的节点图存在无效节点 ID`);
      continue;
    }
    if (ids.has(node.id)) errors.push(`${owner} 的节点图节点 ${node.id} 重复`);
    ids.add(node.id);
  }
  if (!ids.has(graph.entry)) errors.push(`${owner} 的节点图入口不存在`);
  for (const node of graph.nodes)
    if (node.next && !ids.has(node.next))
      errors.push(`${owner} 的节点 ${node.id ?? "?"} 指向不存在的节点`);
  const visited = new Set<string>();
  let id: string | undefined = graph.entry;
  while (id && ids.has(id)) {
    if (visited.has(id)) {
      errors.push(`${owner} 的节点图存在循环：${id}`);
      break;
    }
    visited.add(id);
    id = graph.nodes.find((node) => node.id === id)?.next;
  }
  const unreachable = [...ids].filter((nodeId) => !visited.has(nodeId));
  if (unreachable.length)
    errors.push(`${owner} 的节点图存在不可达节点：${unreachable.join("、")}`);
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
        target?: unknown;
        count?: unknown;
        amount?: unknown;
        mark?: unknown;
        skillId?: unknown;
        duration?: unknown;
        phase?: unknown;
        fromZone?: unknown;
        to?: unknown;
        targetPlayerId?: unknown;
        toPlayerId?: unknown;
        toZone?: unknown;
      };
      if (
        ![
          "draw",
          "recover",
          "damage",
          "addMark",
          "removeMark",
          "discard",
          "judge",
          "if",
          "repeat",
          "setState",
          "changeState",
          "loseHp",
          "changeMaxHp",
          "grantSkill",
          "removeSkill",
          "skipPhase",
          "moveCards",
        ].includes(node.type)
      )
        errors.push(`${owner} 的节点 ${index + 1} 类型不支持`);
      if (
        !["self", "source", "selected", "allOthers"].includes(
          String(node.target),
        )
      )
        errors.push(`${owner} 的节点 ${index + 1} 目标不合法`);
      for (const [field, playerId] of [
        ["targetPlayerId", node.targetPlayerId],
        ["toPlayerId", node.toPlayerId],
      ] as const) {
        if (
          playerId !== undefined &&
          (typeof playerId !== "string" ||
            playerId.length < 1 ||
            playerId.length > 128)
        )
          errors.push(
            `${owner} 的节点 ${index + 1} ${field} 必须是 1–128 字符的玩家 ID`,
          );
      }
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
        (node.type === "addMark" || node.type === "removeMark") &&
        node.mark !== undefined &&
        (typeof node.mark !== "string" || !validId(node.mark))
      )
        errors.push(`${owner} 的节点 ${index + 1} 标记 ID 不合法`);
      const control = effect as {
        condition?: unknown;
        then?: unknown;
        else?: unknown;
        body?: unknown;
        times?: unknown;
        stateKey?: unknown;
        value?: unknown;
      };
      if (node.type === "if") {
        validateCondition(
          control.condition,
          `${owner} 的条件节点 ${index + 1}`,
          errors,
          depth + 1,
        );
        validateEffects(
          control.then,
          `${owner} 的条件成立分支`,
          errors,
          depth + 1,
          true,
        );
        if (control.else !== undefined)
          validateEffects(
            control.else,
            `${owner} 的条件不成立分支`,
            errors,
            depth + 1,
            true,
          );
      }
      if (node.type === "repeat") {
        if (
          !Number.isInteger(control.times) ||
          Number(control.times) < 0 ||
          Number(control.times) > 20
        )
          errors.push(`${owner} 的重复节点次数必须为 0–20`);
        validateEffects(control.body, `${owner} 的重复节点`, errors, depth + 1);
      }
      if (node.type === "setState" || node.type === "changeState") {
        if (!validId(control.stateKey))
          errors.push(`${owner} 的状态节点键名不合法`);
        if (
          !Number.isInteger(control.value) ||
          Number(control.value) < -1000 ||
          Number(control.value) > 1000
        )
          errors.push(`${owner} 的状态节点值必须为 -1000–1000 的整数`);
      }
      if (
        node.type === "changeMaxHp" &&
        (!Number.isInteger(control.value) ||
          Number(control.value) < -20 ||
          Number(control.value) > 20)
      )
        errors.push(`${owner} 的体力上限变化必须为 -20–20 的整数`);
      if (node.type === "grantSkill" || node.type === "removeSkill") {
        if (!validId(node.skillId))
          errors.push(`${owner} 的技能变更节点引用不合法`);
        if (
          node.type === "grantSkill" &&
          node.duration !== undefined &&
          node.duration !== "turn" &&
          node.duration !== "game"
        )
          errors.push(`${owner} 的技能授予期限不合法`);
      }
      if (
        node.type === "skipPhase" &&
        !["judge", "draw", "play", "discard", "end"].includes(
          String(node.phase),
        )
      )
        errors.push(`${owner} 的跳过阶段节点不合法`);
      if (node.type === "moveCards") {
        if (!["hand", "own"].includes(String(node.fromZone)))
          errors.push(`${owner} 的移动牌来源区域不合法`);
        if (
          !["self", "source", "selected", "current"].includes(String(node.to))
        )
          errors.push(`${owner} 的移动牌目标角色不合法`);
        if (!["hand", "discard"].includes(String(node.toZone)))
          errors.push(`${owner} 的移动牌目标区域不合法`);
      }
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
    const node = effect as {
      success?: unknown;
      failure?: unknown;
      then?: unknown;
      else?: unknown;
      body?: unknown;
      times?: unknown;
    };
    const repetitions =
      typeof node.times === "number" && Number.isInteger(node.times)
        ? Math.max(1, node.times)
        : 1;
    return (
      total +
      1 +
      countEffects(node.success) +
      countEffects(node.failure) +
      countEffects(node.then) +
      countEffects(node.else) +
      countEffects(node.body) * repetitions
    );
  }, 0);
}

function validateCondition(
  condition: unknown,
  owner: string,
  errors: string[],
  depth = 0,
) {
  if (depth > 8) {
    errors.push(`${owner} 的条件嵌套不能超过 8 层`);
    return;
  }
  if (!condition || typeof condition !== "object" || !("op" in condition)) {
    errors.push(`${owner} 不合法`);
    return;
  }
  const value = condition as Record<string, unknown>;
  if (value.op === "and" || value.op === "or") {
    if (
      !Array.isArray(value.conditions) ||
      !value.conditions.length ||
      value.conditions.length > 16
    ) {
      errors.push(`${owner} 的组合条件须包含 1–16 项`);
      return;
    }
    value.conditions.forEach((item) =>
      validateCondition(item, owner, errors, depth + 1),
    );
    return;
  }
  if (value.op === "not") {
    validateCondition(value.condition, owner, errors, depth + 1);
    return;
  }
  if (value.op === "predicate") {
    if (!["alive", "wounded", "hasSkill"].includes(String(value.predicate)))
      errors.push(`${owner} 的谓词不受支持`);
    if (
      !["self", "source", "selected", "current"].includes(String(value.subject))
    )
      errors.push(`${owner} 的角色引用不合法`);
    if (value.predicate === "hasSkill" && !validId(value.skillId))
      errors.push(`${owner} 的技能引用不合法`);
    return;
  }
  if (value.op === "compare") {
    if (
      !["eq", "neq", "lt", "lte", "gt", "gte"].includes(
        String(value.comparator),
      )
    )
      errors.push(`${owner} 的比较符不受支持`);
    validateRuleValue(value.left, owner, errors);
    validateRuleValue(value.right, owner, errors);
    return;
  }
  errors.push(`${owner} 的运算符不受支持`);
}

function validateRuleValue(value: unknown, owner: string, errors: string[]) {
  if (!value || typeof value !== "object" || !("kind" in value)) {
    errors.push(`${owner} 的比较值不合法`);
    return;
  }
  const item = value as Record<string, unknown>;
  if (item.kind === "number") {
    if (!Number.isInteger(item.value) || Math.abs(Number(item.value)) > 100000)
      errors.push(`${owner} 的常量不合法`);
    return;
  }
  if (item.kind !== "property") {
    errors.push(`${owner} 的比较值类型不受支持`);
    return;
  }
  if (!["self", "source", "selected", "current"].includes(String(item.subject)))
    errors.push(`${owner} 的角色引用不合法`);
  if (
    ![
      "hp",
      "maxHp",
      "lostHp",
      "handCount",
      "mark",
      "state",
      "selection",
    ].includes(String(item.property))
  )
    errors.push(`${owner} 的属性引用不合法`);
  if (
    (item.property === "mark" ||
      item.property === "state" ||
      item.property === "selection") &&
    !validId(item.key)
  )
    errors.push(`${owner} 的状态键名不合法`);
}
function validateRuntime(
  runtime: ExtensionPackageDto["runtime"] | undefined,
  errors: string[],
) {
  if (runtime === undefined) return;
  if (!runtime || typeof runtime !== "object") {
    errors.push("高级运行时声明必须是对象");
    return;
  }
  if (runtime.kind !== "noname-compat") errors.push("高级运行时类型不受支持");
  if (runtime.apiVersion !== "noname-compat/v1")
    errors.push("无名杀兼容 API 版本不受支持");
  if (!/^[a-f0-9]{40}$/i.test(runtime.upstreamCommit))
    errors.push("无名杀上游提交必须是 40 位 Git 提交哈希");
  if (
    typeof runtime.source !== "string" ||
    !runtime.source.trim() ||
    Buffer.byteLength(runtime.source, "utf8") > 1024 * 1024 ||
    runtime.source.includes("\0")
  )
    errors.push("高级 Mod 编译源码必须为非空文本且不能超过 1 MiB");
  const allowedPermissions = new Set([
    "game-state",
    "player-choice",
    "deterministic-random",
    "custom-ui",
    "mode-control",
    "ai",
  ]);
  if (!Array.isArray(runtime.permissions)) {
    errors.push("高级 Mod 权限必须是数组");
  } else {
    const seen = new Set<string>();
    for (const permission of runtime.permissions) {
      if (!allowedPermissions.has(permission))
        errors.push(`高级 Mod 权限 ${permission} 不受支持`);
      if (seen.has(permission)) errors.push(`高级 Mod 权限 ${permission} 重复`);
      seen.add(permission);
    }
  }
  if (
    !runtime.limits ||
    !Number.isInteger(runtime.limits.timeoutMs) ||
    runtime.limits.timeoutMs < 10 ||
    runtime.limits.timeoutMs > 5000
  )
    errors.push("高级 Mod 单次执行超时须为 10–5000ms");
  if (
    !runtime.limits ||
    !Number.isInteger(runtime.limits.memoryMb) ||
    runtime.limits.memoryMb < 16 ||
    runtime.limits.memoryMb > 128
  )
    errors.push("高级 Mod 内存上限须为 16–128MiB");
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
