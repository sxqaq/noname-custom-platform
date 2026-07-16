import { resolve } from "node:path";

export interface HostRuntimeOptions {
  bindAddress: string;
  port: number;
  dataDir: string;
  webDist: string;
  nodeName: string;
  lanDiscovery: boolean;
}

export type HostRuntimeOverrides = Partial<HostRuntimeOptions>;

export function parseHostArgs(argv: string[]): HostRuntimeOverrides {
  const result: HostRuntimeOverrides = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--lan") {
      result.bindAddress = "0.0.0.0";
      result.lanDiscovery = true;
      continue;
    }
    if (argument === "--no-discovery") {
      result.lanDiscovery = false;
      continue;
    }
    const [flag, inlineValue] = argument.split("=", 2);
    if (
      !["--bind", "--port", "--data-dir", "--web-dist", "--name"].includes(flag)
    )
      throw new Error(`未知主机参数：${argument}`);
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${flag} 缺少参数值`);
    if (flag === "--bind") result.bindAddress = value;
    if (flag === "--port") result.port = parsePort(value);
    if (flag === "--data-dir") result.dataDir = value;
    if (flag === "--web-dist") result.webDist = value;
    if (flag === "--name") result.nodeName = value.slice(0, 48);
  }
  return result;
}

export function resolveHostConfig(
  overrides: HostRuntimeOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): HostRuntimeOptions {
  const port = overrides.port ?? parsePort(env.PORT ?? "3001");
  const bindAddress =
    overrides.bindAddress ?? env.HOST_BIND?.trim() ?? "127.0.0.1";
  const nodeName =
    overrides.nodeName ?? env.HOST_NAME?.trim().slice(0, 48) ?? "本地主机";
  if (!bindAddress) throw new Error("HOST_BIND 不能为空");
  if (!nodeName) throw new Error("HOST_NAME 不能为空");
  return {
    bindAddress,
    port,
    dataDir: resolve(overrides.dataDir ?? env.DATA_DIR ?? "data"),
    webDist: resolve(overrides.webDist ?? env.WEB_DIST ?? "apps/web/dist"),
    nodeName,
    lanDiscovery: overrides.lanDiscovery ?? env.HOST_DISCOVERY === "1",
  };
}

function parsePort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535)
    throw new Error("PORT 必须是 0–65535 的整数");
  return port;
}
