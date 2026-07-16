# Windows 安装版

## 设计

安装版内置 Electron、网页客户端与同一个 `Host Runtime`。它不依赖用户预装 Node.js，也不连接中央规则服务器。每个安装者都拥有独立的节点密钥、扩展库、图片资源、房间和回放数据。

- 默认以 `127.0.0.1` 和随机空闲端口启动，只允许本机使用。
- 在“主机”菜单切换到“局域网主机模式”后，应用重启并绑定 `0.0.0.0`、发布 mDNS 节点；此时 Windows 可能显示防火墙授权提示。
- 用户数据写入 Electron 的 `userData/node-data`，不写入安装目录；默认卸载不会删除创作内容。
- 渲染进程启用沙箱和上下文隔离，禁用 Node.js 集成，并拒绝权限请求和非本地主机导航。

## 本地构建

```powershell
npm.cmd ci
npm.cmd run installer:win
```

产物写入 `release/`。打包器先在系统临时目录工作，以避免 Windows 对可执行文件扫描期间在非系统盘执行原子重命名失败。

## 发布

推送 `v*` 标签会触发 `.github/workflows/release.yml`，在 GitHub 托管的 Windows 环境重新测试和构建，并把安装程序与 blockmap 附加到 GitHub Release。安装程序不提交进 Git，以避免二进制文件污染源码历史。

## 已执行的本机验收

版本 `0.2.0` 已完成以下闭环：

1. 构建 x64 NSIS assisted installer；
2. 静默安装到干净临时目录；
3. 从安装目录运行 `NonameCustomPlatform.exe --smoke-test`；
4. 内置主机启动并通过 `/health` 检查；
5. 主机正常关闭并释放端口；
6. 静默卸载，确认安装目录中的程序文件被删除。

本次本地产物 SHA-256：`080183851B904B3673AE431BF46586CE0FF2401CD421FEDE9BBA8D04FCBD0711`。未配置商业代码签名证书，因此公开下载时 Windows SmartScreen 仍可能提示未知发布者；正式分发应在发布工作流中注入项目自己的签名证书。
