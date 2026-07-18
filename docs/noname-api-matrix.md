# 无名杀 API 兼容矩阵

本矩阵针对固定提交 `632d2d3c8da2893466a8c440a18861c9ed49813d` 静态生成。它衡量源码中出现的“调用形式”，不等于技能兼容率；一个技能只要仍包含关键的 `unsupported` 调用，就不能宣称可直接运行。

## 当前审计结果

- 26 个官方武将技能包全部可在无 DOM Node.js 环境完成声明加载，包括带额外导入的 `offline` 和 `xianding`。
- 共发现 604 种调用形式：13 种 `direct`、53 种 `shimmed`、41 种 `migrated`、497 种尚未映射。
- 按静态调用次数计，85,852 次中有 52,729 次已分类为 `direct`/`shimmed`/`migrated`，33,123 次仍未映射。这是 API 覆盖率，不是技能可玩率。
- `standard.fanjian` 已完成真实异步选择、检查点恢复和确定性回放；`standard.kurou` 已通过权威效果桥原子执行；`standard.luoyi` 已验证临时技能效果；`standard.yingzi` 已验证可序列化事件修改日志。“可加载”仍不自动等于“可完整执行”。

状态含义：

| 状态          | 含义                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `direct`      | 隔离运行时可直接提供，例如确定性 `Math`。                                   |
| `shimmed`     | 由显式宿主代理提供，例如 `chooseTarget`、`chooseCard`、日志和基础卡牌属性。 |
| `migrated`    | 不原样暴露对象方法，迁移到结构化状态、效果或事件上下文。                    |
| `unsupported` | 尚未建立安全、确定、服务端权威的等价能力。                                  |

高频未映射能力决定下一轮优先级：AI 估值（`get.attitude/value/effect`）、扩展区、全局/玩家历史、卡牌标签与合法性检查。父事件链、基础事件变更、常用临时技能和 16 类玩家选择已建立可序列化桥。AI/显示 API 必须与规则 API 分离；规则相关能力必须同时补齐快照、回放、权限、AI 和测试。

## 0.3.0 之后的执行桥

- `NonameEffectBridge` 从权威 `GameState` 生成受限玩家代理，将体力、摸牌、伤害、标记、技能和跳阶段操作转换为结构化效果。
- 效果可用 `targetPlayerId`/`toPlayerId` 指定任意存活玩家，整批效果由引擎原子应用；无效 ID 会回滚状态与随机源。
- `NonameInteractionHost` 支持 16 类选择、`.set(...)` 链、直接 `await`、检查点和无代码回放。
- `NonameEventBridge` 将父事件、触发事件、失牌/得牌/弃牌记录以及 `set/cancel/finish/goto` 保存为有界变更日志。

`phaseDrawBegin2` 已接入真实引擎中断，但事件变更日志还没有接入用牌、伤害、濒死、判定和其余阶段中断点；扩展区和完整历史模型也尚未完成，因此不宣称上游技能已全量可玩。

## 可复现命令

```powershell
npm.cmd run build:packages
node packages/plugin-cli/dist/index.js audit-noname --upstream vendor/noname --out noname-compatibility.json
```

为指定真实技能生成高级插件迁移骨架：

```powershell
node packages/plugin-cli/dist/index.js migrate-noname standard fanjian --upstream vendor/noname --out fanjian-plugin.ts
node packages/plugin-cli/dist/index.js build fanjian-plugin.ts --out fanjian-plugin.sgs.json
```

迁移骨架写入原触发元数据、实际调用频率、每项兼容状态和建议替代 API，并可立即通过插件构建；其中规则逻辑保留明确的 `TODO`，不会把静态扫描误装成自动正确迁移。
