# 开放代码插件 SDK

开放插件允许作者用 TypeScript 组织武将、技能、卡牌、牌堆和模式。普通插件编译成无函数规则 IR；当 IR 无法表达复杂机制时，作者可显式申请 `advanced-runtime`，把自包含钩子编译进扩展包，由房主服务器隔离执行。

## 信任边界

插件分为三个阶段：

1. 作者源码：只在构建阶段使用；
2. 编译产物：`sgs-compiled-plugin`；普通内容没有函数，高级内容只携带一个固定源码入口及权限/资源上限；
3. 联机扩展：由房主校验、锁定版本并通过 `.sgspack` 分发规则、运行时和静态资源。

`@sgs/plugin-cli` 使用独立进程和受限 VM：只链接 `@sgs/script-sdk`，不提供文件系统、网络、进程、环境变量、动态导入、系统时间或 `Math.random`，并限制构建时间。VM 不是操作系统级容器，因此仍不要执行来源不明的 npm 安装脚本；公开收到的插件应优先使用已经编译的 JSON 或 `.sgspack`。

浏览器和其他玩家绝不执行作者 JavaScript。高级入口只在房主的“一次性 Worker + 内层无系统 API VM”中运行；返回效果再次通过规则 Schema 校验并由权威引擎原子应用。回放保存已校验输出，不重新执行作者源码。Worker/VM 不是操作系统容器，因此仍只应启用朋友间可信来源的代码插件。

## 兼容版本

- 插件声明：`sgs.plugin/v1`
- 当前规则 API：`rules-ir/v2`
- 向后兼容：`rules-ir/v1`
- 当前扩展 Schema：4
- 能力声明：`rules`、`assets`、`advanced-runtime`
- 高级运行时 API：`noname-compat/v1`

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
node packages/plugin-cli/dist/index.js init my-advanced-plugin --advanced
```

CLI 命令：

```text
sgs-plugin init [directory] [--advanced]
sgs-plugin build [entry] --out [file]
sgs-plugin watch [entry] --out [file]
sgs-plugin test [entry]
sgs-plugin audit-noname [--upstream path] [--out report.json]
sgs-plugin migrate-noname <pack> <skill> [--upstream path] [--out plugin.ts]
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

## 高级运行时插件

`defineRuntime()` 接收一个同步、自包含的 TypeScript 函数。函数只能使用输入、JavaScript 内建值和宿主提供的确定性 `Math.random`；不能捕获导入的帮助函数或模块局部变量。它接收 `roomStart`、`afterCommand`、`choiceResponse` 和 `ruleEvent` 钩子、上次持久状态、实际命令、命令产生的核心事件、操作者/首个目标以及经过权限裁剪的权威游戏状态，返回新状态、规则效果及有限日志。效果中的 `self` 和 `selected` 分别映射实际操作者和目标，而不是误用当前回合角色。

```ts
const runtime = defineRuntime<{ calls: number }>(
  (input) => ({
    state: { calls: (input.state?.calls ?? 0) + 1 },
    effects:
      input.hook === "roomStart"
        ? [
            {
              type: "addMark",
              target: "self",
              mark: "author_started",
              count: 1,
            },
          ]
        : [],
  }),
  { permissions: ["game-state"], timeoutMs: 500, memoryMb: 32 },
);
```

插件同时在 `capabilities` 中声明 `advanced-runtime`，并把 `runtime` 放进 `definePackage()`。CLI 会用服务器相同的隔离执行器运行两次确定性冒烟测试；房主仍会在每次实际调用后校验权限、输出大小、日志和每一个效果。完整样例见 `examples/plugins/advanced-runtime.ts`。

申请 `player-choice` 权限后，钩子还可以返回一个 `request`。当前统一支持目标、卡牌、选项、数字和花色五类选择；服务器校验请求与响应、保存指定响应玩家和稳定 `requestId`，并在 `choiceResponse` 钩子的 `input.context.choice` 中恢复执行。等待状态进入房间快照，因此指定玩家断线重连后仍看到同一个请求；离线超时可由确定性 AI 选择。响应和已校验输出进入回放，回放过程不重跑作者代码。

### 权威规则事件

`ruleEvent` 在引擎的内部规则点暂停。当前第一个稳定事件是 `phaseDrawBegin2`：

```ts
if (
  input.hook === "ruleEvent" &&
  input.context.ruleEvent?.name === "phaseDrawBegin2"
) {
  const count = Number(input.context.ruleEvent.data.num ?? 2);
  return { ruleEvent: { data: { num: count + 1 } } };
}
```

事件变更需要 `game-state` 权限，会进入房主快照和回放。该钩子当前不允许请求玩家输入；为避免覆盖未完成的内部中断，伤害、失去体力、判定、弃牌和移牌效果也暂时拒绝。

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

高级运行时已知道权威玩家 ID 时，可以精确定位不同来源和去向：

```ts
effect.forPlayer("player-b", effect.removeMark("charge", 1));
effect.moveCards({
  fromPlayerId: "player-b",
  fromZone: "hand",
  toPlayerId: "player-c",
  toZone: "hand",
});
```

不存在的玩家 ID 会使当次权威效果批整体回滚。

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
3. 普通 IR 无函数序列化，高级运行时只有单一固定入口；
4. 两次相同种子和操作的快照一致性；
5. 高级入口在服务器同款 Worker/VM 中的双次确定性测试；
6. 插件自带的冒烟断言。

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
- `examples/plugins/advanced-runtime.ts`：显式权限、持久状态和服务器权威代码钩子。

能用 IR 表达时仍优先使用 IR；无法表达时使用显式授权的高级运行时。任何情况下都不允许浏览器执行远程脚本，也不允许代码插件直接修改权威状态对象。
