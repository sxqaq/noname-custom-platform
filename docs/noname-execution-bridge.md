# 无名杀执行桥

该执行桥用于在不引入 DOM、不把规则权交给客户端的前提下，复用固定 GPL-3.0 无名杀源码中的真实技能函数。

## 三层边界

1. `NonameEffectBridge`：向上游技能暴露受限玩家代理，只输出结构化 `Effect[]`。权威引擎验证数量、玩家 ID 和字段后原子应用。
2. `NonameInteractionHost`：将 `choose*` 事件转换为可序列化请求，只允许指定玩家回答，并记录请求/结果日志。
3. `NonameEventBridge`：保存父事件链、触发链和牌移动摘要，将事件字段及 `targets/directHit/excluded` 集合修改记录为有界变更日志，并可转换成权威事件补丁。

三层均只处理可结构化数据，不向技能代码暴露文件系统、网络、实时时钟或服务器对象。

`defineNonameSkillRuntime()` 把这套边界提供给普通高级创作者：扩展以 `runtimeOnly` 技能声明武将归属，运行时按 `player/source/target/global` 匹配事件，在隔离 Worker 中执行同步 `filter/content`。玩家方法输出 `Effect[]`，事件字段和目标集合输出规则事件补丁；房主随后执行权限、配额和权威规则校验，其他联机客户端只接收结果。

## 已验证的真实技能

- `standard.fanjian`：多步选择、断线检查点、回放。
- `standard.kurou`：失去体力与摸牌的原子效果批。
- `standard.luoyi`：回合期限临时技能与触发字段修改。
- `standard.yingzi`：固定上游真实 `filter/content` 可通过事件桥记录 `num` 修改，也可由 `defineNonameSkillRuntime()` 在房主隔离 Worker 中执行并把摸牌数补丁交回权威事件链。
- `examples/plugins/noname-compatible-skill.ts`：可编译、可分发的无名杀式同步触发技，逐目标把杀设为不可响应。

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

- `phaseDrawBegin2`、三段用牌主链、逐目标 `useCardToTarget/Playered/Targeted`、`directHit/excluded` 以及 `damageBegin1/2/3/4 → damageSource → damageEnd` 已完成权威纵切；濒死、判定和其余阶段中断点尚未接入。
- 完整的扩展区、全局历史和事件牌移动模型。
- 与规则无关的 AI 估值、动画和客户端广播兼容层。

只有当某个技能所有规则调用都完成权威执行、外部输入、快照、回放和 AI 验证后，才能计入“可玩”覆盖率。
