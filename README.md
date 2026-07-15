# Noname Custom Platform / 无名杀自定义联机平台

一个网页优先、服务端权威、面向朋友房的三国杀风格联机与内容创作平台。项目以固定版本的[无名杀](https://github.com/libnoname/noname)源码作为内容和兼容行为参考，但规则执行、房间服务、回放与创作系统均采用独立架构实现。

> **AI 制作声明：本项目的全部代码、测试、配置与文档（包括本 README）均由 OpenAI GPT-5.6 在用户指导下制作。发布前已执行自动化测试，但尚不等同于专业团队逐行人工审计。**

## 项目定位

- 给朋友之间开房游玩，不做公共竞技平台。
- 网页端优先，同时保持 PWA、移动外壳和桌面外壳的架构扩展能力。
- 客户端只负责展示与提交操作；身份、随机数、牌局状态和胜负全部由服务端决定。
- 扩展内容使用声明式 DSL；服务器不执行扩展作者提交的 JavaScript。

## 已实现内容

### 标准身份局

- 游客会话、大厅、邀请链接、密码房、2–8 人创建/加入/准备/开始房间。
- 服务端权威身份分配和候选选将；候选仅当前玩家可见。
- 25 名标准武将、40 个技能、32 种牌定义和固定的 108 张标准牌堆。
- 六阶段、距离、手牌上限、装备区、判定区、濒死救援、身份胜负和击杀奖惩。
- 基本牌、普通锦囊、延时锦囊、逐目标无懈响应、武器、护甲和坐骑效果。
- 在线超时托管、离线托管、断线重连、私有视图裁剪和确定性逐命令回放。
- 非法客户端命令原子回滚，不污染牌局状态或随机数状态。

### 内容创作

- 武将基本信息和节点技能编辑器。
- 自定义卡牌、牌堆、模式和胜利条件。
- 与服务端共用规则内核的本地预览及扩展自动测试。
- JSON 导入/导出、不可覆盖版本、SHA-256 内容锁和分享 ID。
- `@sgs/script-sdk` 将高级 TypeScript 创作编译成声明式 DSL。

### 交付能力

- React Web 客户端、PWA manifest 和 Service Worker 应用外壳缓存。
- 单端口生产服务：网页、HTTP API 和 WebSocket 由同一服务提供。
- Docker 单机部署和可持久化扩展内容库。
- 平台能力桥已隔离文件、分享和存储 API，便于未来接入 Capacitor/Tauri。

## 明确不在当前范围

注册账号、匹配、排位、反作弊、公开扩展审核、举报、版权工单、公共社区、Capacitor/Tauri 安装包以及公共大服的横向扩容。

## 技术架构

```text
apps/web                  React 网页、大厅、牌桌、回放、创作工坊
apps/game-server          会话、房间、内容仓库、权威对局、WebSocket
packages/headless-engine  无 DOM、种子随机、快照与规则内核
packages/protocol         客户端/服务端共享协议
packages/content-schema   扩展 Schema、校验与内容哈希
packages/noname-adapter   无名杀兼容边界
packages/script-sdk       高级创作 API 到安全 DSL 的编译层
vendor/noname             固定提交的上游 Git submodule
```

## 环境要求

- Node.js 20.19 或更高版本
- npm 10 或兼容版本
- Git（克隆时需要拉取 submodule）

## 获取源码

```bash
git clone --recurse-submodules https://github.com/sxqaq/noname-custom-platform.git
cd noname-custom-platform
npm install
```

如果已经普通克隆：

```bash
git submodule update --init --recursive
```

## 本地开发

```bash
npm run dev
```

- Web 开发地址：`http://localhost:5173`
- 游戏服务：`http://localhost:3001`
- 健康检查：`http://localhost:3001/health`

## 生产运行

```bash
npm run build
npm run start -w @sgs/game-server
```

构建后访问 `http://localhost:3001`。

Docker：

```bash
docker compose up -d --build
```

## 测试与验收

```bash
npm test
npm run typecheck
npm run build
node scripts/stage0-audit.mjs
npm run test:simulation
```

PowerShell 下执行 10,000 局完整模拟：

```powershell
$env:SIM_GAMES='10000'; npm.cmd run test:simulation
```

服务启动后可执行真实双客户端 E2E：

```bash
node scripts/e2e-smoke.mjs
node scripts/e2e-content.mjs
```

当前验收结果：90 项工作区测试通过；含选将的 10,000 局 2–8 人 AI 对局全部结束、零死锁，前 100 局逐命令回放与原快照一致。详细内容见 [标准身份局验收](docs/standard-content-progress.md)和[阶段 0–4 验收](docs/acceptance.md)。

## 安全与数据说明

- 当前身份是本地游客会话，不是安全账号体系。
- 扩展 DSL 会经过 Schema 校验，但本项目尚未接受独立安全审计。
- 不要把公开部署实例当作受信任的商业服务。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 上游、版权与商标

- 无名杀上游代码由其原作者和贡献者拥有，固定提交见 `vendor/noname` submodule。
- 本项目是非官方社区项目，与无名杀、三国杀及其权利人不存在隶属、赞助或背书关系。
- “三国杀”等名称及相关素材权利归各自权利人所有。本仓库不附带官方美术、音频或商业素材。
- 详细声明见 [NOTICE.md](NOTICE.md)。

## 许可证

项目代码以 [GNU General Public License v3.0](LICENSE) 发布。GPL 本身允许商业使用、修改和再分发，但要求满足相应的源码开放与许可证义务；“面向非商业朋友房”是本项目定位，不是额外许可证限制。

## 参与贡献

提交 Issue 或 Pull Request 前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。由于代码由 AI 生成，贡献时尤其欢迎补充人工审查、边界测试和规则出处。
