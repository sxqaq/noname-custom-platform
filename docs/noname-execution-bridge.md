# 无名杀执行桥

该执行桥用于在不引入 DOM、不把规则权交给客户端的前提下，复用固定 GPL-3.0 无名杀源码中的真实技能函数。

## 三层边界

1. `NonameEffectBridge`：向上游技能暴露受限玩家代理，只输出结构化 `Effect[]`。权威引擎验证数量、玩家 ID 和字段后原子应用。
2. `NonameInteractionHost`：将 `choose*` 事件转换为可序列化请求，只允许指定玩家回答，并记录请求/结果日志。
3. `NonameEventBridge`：保存父事件链、触发链和牌移动摘要，将事件字段修改记录为可重放变更日志。

三层均只处理可结构化数据，不向技能代码暴露文件系统、网络、实时时钟或服务器对象。

## 已验证的真实技能

- `standard.fanjian`：多步选择、断线检查点、回放。
- `standard.kurou`：失去体力与摸牌的原子效果批。
- `standard.luoyi`：回合期限临时技能与触发字段修改。
- `standard.yingzi`：对摸牌事件 `num` 的可序列化修改。

## 高级 SDK 精确玩家效果

```ts
effect.forPlayer("player-b", effect.removeMark("charge", 1));

effect.moveCards({
  count: 1,
  fromPlayerId: "player-b",
  fromZone: "hand",
  toPlayerId: "player-c",
  toZone: "hand",
});
```

玩家 ID 由房主的权威状态提供；不存在的 ID 会使整批效果失败并回滚。

## 尚未完成

- `phaseDrawBegin2`、`useCard/useCard1/useCard2` 以及 `damageBegin1/2/3/4 → damageSource → damageEnd` 已完成“引擎暂停 → 隔离 Mod 修改/取消 → 引擎验证恢复 → 快照/基础回放”纵切；用牌目标逐个事件、濒死、判定和其余阶段中断点尚未接入。
- 完整的扩展区、全局历史和事件牌移动模型。
- 与规则无关的 AI 估值、动画和客户端广播兼容层。

只有当某个技能所有规则调用都完成权威执行、外部输入、快照、回放和 AI 验证后，才能计入“可玩”覆盖率。
