import { Worker } from "node:worker_threads";

export interface IsolatedModEvaluationOptions {
  source: string;
  input?: unknown;
  seed: string;
  timeoutMs?: number;
  memoryMb?: number;
}

/**
 * Executes advanced author code inside a disposable Worker and an inner VM.
 * The Worker bounds memory and permits hard termination; the VM exposes no
 * process, require, filesystem, network, timers, system clock or codegen.
 */
export function evaluateIsolatedMod<T = unknown>(
  options: IsolatedModEvaluationOptions,
): Promise<T> {
  const timeoutMs = boundedInteger(options.timeoutMs ?? 500, 10, 5_000, "执行超时");
  const memoryMb = boundedInteger(options.memoryMb ?? 32, 16, 128, "内存上限");

  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      resourceLimits: {
        maxOldGenerationSizeMb: memoryMb,
        maxYoungGenerationSizeMb: Math.max(4, Math.floor(memoryMb / 4)),
        stackSizeMb: 2,
      },
      workerData: {
        source: options.source,
        input: structuredClone(options.input),
        seed: options.seed,
      },
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      reject(new Error(`Mod 执行超过 ${timeoutMs}ms，已强制终止`));
    }, timeoutMs);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
      void worker.terminate();
    };
    worker.once("message", (message: { ok: boolean; value?: T; error?: string }) =>
      finish(() =>
        message.ok
          ? resolve(message.value as T)
          : reject(new Error(message.error ?? "Mod 隔离执行失败")),
      ),
    );
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => {
      if (!settled && code !== 0) finish(() => reject(new Error(`Mod Worker 异常退出：${code}`)));
    });
  });
}

function boundedInteger(value: number, min: number, max: number, name: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name}必须是 ${min}–${max} 的整数`);
  }
  return value;
}

const workerSource = String.raw`
const { workerData, parentPort } = require("node:worker_threads");
const { createContext, Script } = require("node:vm");
const { createHash } = require("node:crypto");

let state = createHash("sha256").update(workerData.seed).digest().readUInt32LE(0) || 1;
const math = Object.create(Math);
Object.defineProperty(math, "random", {
  value() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  },
});
Object.freeze(math);

const sandbox = {
  input: workerData.input,
  Math: math,
  Date: Object.freeze({ now() { throw new Error("禁止访问系统时间"); } }),
  __result: undefined,
};
const context = createContext(sandbox, {
  codeGeneration: { strings: false, wasm: false },
  name: "noname-untrusted-mod",
});

try {
  const script = new Script(
    '"use strict"; globalThis.__result = (' + workerData.source + ')(globalThis.input);',
    { filename: "author-mod.js" },
  );
  script.runInContext(context);
  if (sandbox.__result && typeof sandbox.__result.then === "function") {
    throw new Error("隔离求值入口暂不接受 Promise；异步交互必须通过宿主协议");
  }
  parentPort.postMessage({ ok: true, value: sandbox.__result });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
}
`;
