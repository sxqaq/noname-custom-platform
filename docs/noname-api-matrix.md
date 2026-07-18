# 无名杀 API 兼容矩阵

本矩阵针对固定提交 `632d2d3c8da2893466a8c440a18861c9ed49813d` 静态生成。它衡量源码中出现的“调用形式”，不等于技能兼容率；一个技能只要仍包含关键的 `unsupported` 调用，就不能宣称可直接运行。

## 当前审计结果

- 26 个官方武将技能包全部可在无 DOM Node.js 环境完成声明加载，包括带额外导入的 `offline` 和 `xianding`。
- 共发现 602 种调用形式：13 种 `direct`、9 种 `shimmed`、24 种 `migrated`、556 种尚未映射。
- `standard.fanjian` 已完成真实异步执行、两次外部选择、检查点恢复和确定性回放；其余“可加载”技能不自动等于“可完整执行”。

状态含义：

| 状态          | 含义                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `direct`      | 隔离运行时可直接提供，例如确定性 `Math`。                                   |
| `shimmed`     | 由显式宿主代理提供，例如 `chooseTarget`、`chooseCard`、日志和基础卡牌属性。 |
| `migrated`    | 不原样暴露对象方法，迁移到结构化状态、效果或事件上下文。                    |
| `unsupported` | 尚未建立安全、确定、服务端权威的等价能力。                                  |

高频未映射能力决定下一轮优先级：AI 估值（`get.attitude/value/effect`）、临时技能与扩展区、父事件链、技能元数据/卡牌标签，以及仅用于动画或提示的客户端 API。AI/显示 API 可以与规则 API 分离；规则相关能力必须同时补齐快照、回放、权限、AI 和测试。

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
