import { hostname } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  session,
  shell,
} from "electron";
import { startHostRuntime, type HostRuntime } from "@sgs/game-server";

const isLanMode = process.argv.includes("--lan");
const isSmokeTest = process.argv.includes("--smoke-test");
let hostRuntime: HostRuntime | undefined;
let closing = false;

if (!app.requestSingleInstanceLock()) app.quit();

app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window?.isMinimized()) window.restore();
  window?.focus();
});

void app
  .whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    const webDist = app.isPackaged
      ? resolve(process.resourcesPath, "web")
      : resolve(fileURLToPath(new URL("../../web/dist", import.meta.url)));
    hostRuntime = startHostRuntime({
      bindAddress: isLanMode ? "0.0.0.0" : "127.0.0.1",
      port: 0,
      dataDir: resolve(app.getPath("userData"), "node-data"),
      webDist,
      nodeName: `${hostname()} 的房间`,
      lanDiscovery: isLanMode,
    });
    const ready = await hostRuntime.ready;
    if (isSmokeTest) {
      const health = (await fetch(`${ready.url}/health`).then((response) =>
        response.json(),
      )) as { ok?: boolean; service?: string };
      if (!health.ok || health.service !== "host-runtime")
        throw new Error("Packaged host runtime health check failed");
      closing = true;
      await hostRuntime.close();
      app.exit(0);
      return;
    }
    installMenu();
    const window = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 900,
      minHeight: 620,
      title: `无名杀自定义联机平台${isLanMode ? " · 局域网主机" : " · 本机模式"}`,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const allowedOrigin = new URL(ready.url).origin;
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://")) void shell.openExternal(url);
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (new URL(url).origin !== allowedOrigin) event.preventDefault();
    });
    await window.loadURL(ready.url);
  })
  .catch((error) => {
    console.error("Desktop startup failed", error);
    app.exit(1);
  });

app.on("window-all-closed", () => void shutdown());
app.on("before-quit", (event) => {
  if (!closing && hostRuntime) {
    event.preventDefault();
    void shutdown();
  }
});

function installMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "主机",
      submenu: [
        {
          label: "仅本机模式",
          type: "radio",
          checked: !isLanMode,
          click: () => relaunch(false),
        },
        {
          label: "局域网主机模式",
          type: "radio",
          checked: isLanMode,
          click: () => relaunch(true),
        },
        { type: "separator" },
        {
          label: "打开数据目录",
          click: () =>
            void shell.openPath(resolve(app.getPath("userData"), "node-data")),
        },
        { type: "separator" },
        { role: "quit", label: "退出" },
      ],
    },
    {
      label: "查看",
      submenu: [
        { role: "reload", label: "重新载入" },
        { role: "togglefullscreen", label: "全屏" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function relaunch(lan: boolean) {
  if (lan === isLanMode) return;
  const args = process.argv.slice(1).filter((argument) => argument !== "--lan");
  if (lan) args.push("--lan");
  app.relaunch({ args });
  void shutdown();
}

async function shutdown() {
  if (closing) return;
  closing = true;
  await hostRuntime
    ?.close()
    .catch((error) => console.error("Host shutdown failed", error));
  app.quit();
}
