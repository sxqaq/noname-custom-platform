# Contributing

感谢你帮助改进本项目。

## 开始之前

1. 搜索现有 Issue，避免重复工作。
2. 规则行为变更请说明采用的规则版本或无名杀上游出处。
3. 安全漏洞不要提交公开 Issue，请按 `SECURITY.md` 报告。

## 开发流程

```bash
git clone --recurse-submodules https://github.com/sxqaq/noname-custom-platform.git
cd noname-custom-platform
npm install
npm test
```

建议从 `main` 创建短生命周期分支。提交应聚焦单一问题，并包含相应测试。

提交 Pull Request 前运行：

```bash
npm run typecheck
npm test
npm run build
```

规则内核改动还应运行：

```bash
SIM_GAMES=1000 npm run test:simulation
```

## 代码约束

- 客户端不能成为对局权威来源。
- 随机行为必须经过种子随机源，不能直接使用 `Math.random()`。
- 扩展作者代码不能在服务器上直接执行；扩展能力应落入可校验 DSL。
- 新的交互步骤必须支持快照恢复、AI/托管和回放。
- 不提交密钥、令牌、个人数据、官方商业素材、`node_modules` 或构建产物。

## AI 辅助贡献

允许使用 AI 工具，但贡献者应说明重要的 AI 生成内容，并对提交结果负责。请优先增加人工可读的测试和规则说明。
