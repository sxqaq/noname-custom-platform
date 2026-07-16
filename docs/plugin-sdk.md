# 开放代码插件 SDK

## 执行边界

作者可以用 TypeScript 和 `@sgs/script-sdk` 编写武将、技能、卡牌、牌堆与模式。`@sgs/plugin-cli` 在作者自己的设备上执行构建代码，输出 `sgs-compiled-plugin` JSON。房主导入和发布的是编译后的数据；房主服务器、远程玩家浏览器和回放系统都不会执行作者提交的 JavaScript。

这意味着代码插件分为两个信任域：

- **作者本地构建是受信任开发行为。** 插件源码与普通 npm 构建脚本一样，拥有作者账号可访问的本地权限，只应构建自己编写或审查过的源码。
- **联机分发是不受信任内容。** 联机只分发经过 Schema 校验、有能力声明、有版本号、可哈希的规则 IR 和静态资源。

当前引擎 API 是 `rules-ir/v1`。插件只能申请 `rules` 和 `assets` 能力。网络、文件系统、系统时间、环境变量、非种子随机数和动态代码执行不是联机运行时能力。

## 创建工程

在发布 npm 包后可以运行：

```bash
npx @sgs/plugin-cli init my-plugin
cd my-plugin
npm install
npm run build
```

在本仓库中开发可以运行：

```bash
npm run build -w @sgs/script-sdk -w @sgs/content-schema -w @sgs/plugin-cli
node packages/plugin-cli/dist/index.js init .tmp-my-plugin
```

生成的 `plugin.ts` 使用 `definePlugin`、`definePackage`、`defineGeneral`、`defineSkill` 和 `effect`。构建输出默认为 `dist/plugin.sgs.json`，可在网页创作工坊中导入、自动测试和发布。

开发时可使用：

```bash
npx @sgs/plugin-cli watch plugin.ts
npx @sgs/plugin-cli test plugin.ts
```

`watch` 在源码变化后重新编译，`test` 使用与服务器相同的无 DOM 规则引擎检查 Schema、确定性和插件声明的对局断言。仓库的 `examples/plugins/` 提供触发技、多段主动技和判定响应三个完整样例。

## 最小示例

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
  event: "turnStart",
  effects: [effect.draw(1)],
});

export default definePlugin({
  engineApi: "rules-ir/v1",
  capabilities: ["rules"],
  content: definePackage({
    id: "example.my_plugin",
    name: "我的插件",
    version: "1.0.0",
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

## 版本和确定性

- 已发布的 `id@version` 不可覆盖；内容改变必须提升语义版本。
- 房间保存扩展内容哈希，重连和回放按相同哈希恢复。
- 编译器通过 `structuredClone` 拒绝函数等不可序列化值，再通过共享 Schema 校验内容。
- CLI 子进程有 15 秒构建超时；服务端还会限制节点数量、图片尺寸和上传大小。

当前 `rules-ir/v1` 已覆盖基础触发、摸牌、回复、伤害、弃牌和标记效果，也支持：

- 多段主动技能的选牌与选目标步骤；每一步都进入快照，可断线恢复、AI 托管和逐命令回放。
- 每回合使用次数、目标过滤、手牌/己方区域选牌，以及弃置费用。
- 判定效果及成功/失败分支，并复用标准判定响应流程，因此可以被“鬼才”等技能响应。
- 递归深度、分支节点、选择步骤、数量和伤害值配额，避免插件制造无界工作量。

更复杂的通用条件表达式会以后向兼容的新 IR 节点继续扩展；不会用“允许远程 JavaScript”绕过表达能力不足。
