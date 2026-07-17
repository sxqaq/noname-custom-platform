# 开放代码插件 SDK

开放插件允许作者用 TypeScript 组织武将、技能、卡牌、牌堆和模式，但作者代码不会进入联机对局。构建器只接受插件返回的数据，将其编译为可校验、可哈希、可回放的规则 IR。

## 信任边界

插件分为三个阶段：

1. 作者源码：只在构建阶段使用；
2. 编译产物：`sgs-compiled-plugin`，其中不允许函数；
3. 联机扩展：由房主校验、锁定版本并通过 `.sgspack` 分发规则和静态资源。

`@sgs/plugin-cli` 使用独立进程和受限 VM：只链接 `@sgs/script-sdk`，不提供文件系统、网络、进程、环境变量、动态导入、系统时间或 `Math.random`，并限制构建时间。VM 不是操作系统级容器，因此仍不要执行来源不明的 npm 安装脚本；公开收到的插件应优先使用已经编译的 JSON 或 `.sgspack`。

房主服务器、浏览器、AI、快照恢复和回放系统只执行规则 IR，绝不执行插件作者提交的 JavaScript。

## 兼容版本

- 插件声明：`sgs.plugin/v1`
- 当前规则 API：`rules-ir/v2`
- 向后兼容：`rules-ir/v1`
- 当前扩展 Schema：4
- 能力声明：`rules`、`assets`

已发布的 `id@version` 不可覆盖。修改规则、资源或依赖后必须提升版本号；房间和回放保存版本与 SHA-256 内容锁。

## 在本仓库中构建

先安装依赖并构建工具链：

```bash
npm install
npm run build -w @sgs/protocol -w @sgs/content-schema -w @sgs/headless-engine -w @sgs/script-sdk -w @sgs/plugin-cli
```

编译仓库中的示例：

```bash
node packages/plugin-cli/dist/index.js build examples/plugins/conditional-state.ts --out conditional-state.sgs.json
node packages/plugin-cli/dist/index.js test examples/plugins/conditional-state.ts
```

创建模板：

```bash
node packages/plugin-cli/dist/index.js init my-plugin
```

CLI 命令：

```text
sgs-plugin init [directory]
sgs-plugin build [entry] --out [file]
sgs-plugin watch [entry] --out [file]
sgs-plugin test [entry]
```

独立 npm 分发包发布后，也可以用 `npx @sgs/plugin-cli` 调用相同命令。在此之前，仓库内开发应使用上面的 `node packages/plugin-cli/dist/index.js` 形式，避免依赖尚未发布的 npm 包。

## 最小插件

```ts
import {
  defineGeneral,
  definePackage,
  definePlugin,
  defineSkill,
  effect,
} from "@sgs/script-sdk";

const preparation = defineSkill({
  id: "example.preparation",
  name: "整备",
  kind: "trigger",
  event: "turnStart",
  effects: [effect.draw(1)],
});

export default definePlugin({
  engineApi: "rules-ir/v2",
  capabilities: ["rules"],
  content: definePackage({
    id: "example.my_plugin",
    name: "我的插件",
    version: "1.0.0",
    author: "作者名",
    license: "CC-BY-4.0",
    generals: [
      defineGeneral({
        id: "example.hero",
        name: "自定义武将",
        faction: "qun",
        hp: 4,
        skills: [preparation.id],
      }),
    ],
    skills: [preparation],
    cards: [],
    decks: [],
    modes: [],
    tests: [],
  }),
});
```

所有 ID 必须稳定且带命名空间，例如 `author.hero_name`。不要使用显示名称充当 ID，也不要在发布后修改既有 ID 的语义。

## SDK 能力

### 效果 `effect`

| API                               | 用途                                              |
| --------------------------------- | ------------------------------------------------- |
| `draw`、`discard`                 | 摸牌、弃牌                                        |
| `recover`、`damage`、`loseHp`     | 回复、伤害、失去体力                              |
| `changeMaxHp`                     | 修改体力上限                                      |
| `mark`、`setState`、`changeState` | 公共标记与技能私有状态                            |
| `judge`                           | 进入标准判定及成功/失败分支                       |
| `when`                            | 条件成立和不成立分支                              |
| `repeat`                          | 最多 20 次的有界重复                              |
| `grantSkill`、`removeSkill`       | 临时或本局授予技能、移除授予技能                  |
| `skipPhase`                       | 跳过判定、摸牌、出牌、弃牌或结束阶段              |
| `moveCards`                       | 在角色手牌/装备区、另一角色手牌区和弃牌堆间移动牌 |

效果目标可以是 `self`、`source`、`selected` 或 `allOthers`。涉及所选目标时，技能必须先声明相应的选择步骤。

### 选择 `selection`

- `target`：选择角色，可限制自己、其他角色、任意角色或受伤角色；
- `card`：选择手牌或自己的牌，可声明是否作为费用弃置；
- `option`：从稳定选项 ID 中选择；
- `number`：选择限定范围内整数；
- `suit`：选择允许的花色。

每一步选择都会写入权威快照，因此可以断线恢复、AI 托管和确定性回放。

### 条件和值

`condition` 提供 `compare`、`and`、`or`、`not`、`wounded` 和 `hasSkill`。`ruleValue` 可以读取体力、体力上限、已损失体力、手牌数、标记、技能状态和前序选择值。

连续修正器 `modifier` 支持：

- 手牌上限；
- 摸牌数；
- 攻击范围；
- 从自己到他人的距离；
- 从他人到自己的距离。

修正器也可以附带规则条件。

## 节点图

技能可以同时提供 `graph`：

```ts
const graphSkill = defineSkill({
  id: "example.graph_skill",
  name: "图策",
  kind: "active",
  usage: "oncePerTurn",
  effects: [],
  graph: {
    entry: "example.start",
    nodes: [
      {
        id: "example.start",
        type: "draw",
        target: "self",
        count: 1,
        next: "example.finish",
      },
      {
        id: "example.finish",
        type: "setState",
        target: "self",
        stateKey: "finished",
        value: 1,
      },
    ],
  },
});
```

发布校验会拒绝重复 ID、入口缺失、断链、循环和不可达节点。运行时会记录逐节点轨迹。

## 自动测试与确定性

`sgs-plugin test` 会执行以下检查：

1. 插件声明和能力版本；
2. Schema、ID、资源引用和节点配额；
3. 无函数序列化；
4. 两次相同种子和操作的快照一致性；
5. 插件自带的冒烟断言。

规则限制包括最多 256 个效果节点、最多 8 层嵌套、最多 20 次重复，以及选择数量、伤害数值、图片大小和资源总量限制。插件不能用死循环或远程 JavaScript 绕过这些限制。

## 发布与局域网共享

1. 把编译 JSON 导入网页工坊；
2. 运行本地预览和扩展自动测试；
3. 发布新的不可覆盖版本；
4. 从在线内容库下载 `.sgspack`；
5. 朋友在自己的完整安装版中导入该文件；
6. 创建房间时选择扩展版本，房间锁定 ID、版本和哈希。

`.sgspack` 会校验内容哈希、每个资源哈希和精确依赖。旧版本可以并存；仍被其他扩展依赖的版本不能卸载。

## 示例

- `examples/plugins/trigger-skill.ts`：`rules-ir/v1` 简单触发技兼容样例；
- `examples/plugins/multi-step-active.ts`：`rules-ir/v1` 多段选牌和选目标主动技兼容样例；
- `examples/plugins/judgment-response.ts`：`rules-ir/v1` 标准判定/响应链兼容样例；
- `examples/plugins/conditional-state.ts`：IR 2.0 条件、状态和有界流程。

当现有 IR 表达能力不足时，应给协议、Schema、权威引擎、AI、快照、编辑器和测试同时增加新的受限能力，而不是允许房主或客户端执行远程脚本。
