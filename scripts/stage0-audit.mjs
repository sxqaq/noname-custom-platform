import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../vendor/noname/apps/core/", import.meta.url);
const sourceRoot = new URL("noname/", root);
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? files(path)
      : /\.(js|ts)$/.test(name)
        ? [path]
        : [];
  });
}
const sourcePath = fileURLToPath(sourceRoot);
const sources = files(sourcePath);
const matchFiles = (pattern) =>
  sources
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map((file) => relative(sourcePath, file));
const networkFile = readFileSync(new URL("noname/game/index.js", root), "utf8");
const relayFile = readFileSync(
  new URL("../../packages/server/src/server/createServer.ts", root),
  "utf8",
);
let nodeImport;
try {
  await import(new URL("noname.js", root));
  nodeImport = { ok: true };
} catch (error) {
  nodeImport = { ok: false, error: `${error.name}: ${error.message}` };
}
const report = {
  upstream: "libnoname/noname",
  externalDrive: {
    supported:
      networkFile.includes("game.ws.onmessage") &&
      relayFile.includes('"onmessage"'),
    evidence: ["game.ws.onmessage", "relay handlers.send/onmessage"],
  },
  nodeWithoutDom: {
    supported: nodeImport.ok,
    importResult: nodeImport,
    browserGlobalFiles: matchFiles(
      /\b(document|window|localStorage|HTMLElement)\b/,
    ).length,
  },
  deterministicReplay: {
    supportedAsIs: false,
    mathRandomFiles: matchFiles(/Math\.random\s*\(/).length,
  },
  decision:
    "使用独立的无 DOM、种子随机、服务端权威规则模块；无名杀只作为内容兼容来源。",
};
console.log(JSON.stringify(report, null, 2));
