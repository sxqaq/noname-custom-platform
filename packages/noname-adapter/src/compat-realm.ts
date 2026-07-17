import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { createContext, Script, type Context } from "node:vm";

export interface NonameCompatibilityGlobals {
  lib?: Record<string, unknown>;
  game?: Record<string, unknown>;
  ui?: Record<string, unknown>;
  get?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  _status?: Record<string, unknown>;
}

export interface NonameSkillDefinition {
  trigger?: Record<string, string | string[]>;
  filter?: (...args: any[]) => boolean;
  check?: (...args: any[]) => boolean;
  cost?: (...args: any[]) => Promise<unknown> | unknown;
  content?: (...args: any[]) => Promise<unknown> | unknown;
  [key: string]: unknown;
}

export interface PinnedNonameSkillModule {
  readonly pack: string;
  readonly skills: Readonly<Record<string, NonameSkillDefinition>>;
  snapshotRandom(): number;
  restoreRandom(state: number): void;
  dispose(): void;
}

interface RealmSandbox extends Record<string, unknown> {
  __nonameExport?: Record<string, NonameSkillDefinition>;
}

/**
 * Loads a character pack's real upstream skill declarations without starting
 * the browser client. This is deliberately limited to the pinned, trusted
 * submodule; arbitrary third-party mods must later run in a separate process.
 */
export async function loadPinnedNonameSkillModule(options: {
  upstreamRoot: string;
  pack: string;
  seed: string;
  globals?: NonameCompatibilityGlobals;
}): Promise<PinnedNonameSkillModule> {
  if (!/^[A-Za-z0-9_-]+$/.test(options.pack)) {
    throw new Error("无名杀武将包 ID 不合法");
  }

  const upstreamRoot = await realpath(options.upstreamRoot);
  const sourcePath = await realpath(
    resolve(
      upstreamRoot,
      "apps",
      "core",
      "character",
      options.pack,
      "skill.js",
    ),
  );
  assertWithin(upstreamRoot, sourcePath);

  const source = transformSkillModule(
    await readFile(sourcePath, "utf8"),
    options.pack,
  );
  const random = createSeededRandom(options.seed);
  const globals = options.globals ?? {};
  const sandbox: RealmSandbox = {
    lib: globals.lib ?? createLoadTimeLibShim(),
    game: globals.game ?? createLoadTimeGameShim(),
    ui: globals.ui ?? { selected: { buttons: [], cards: [], targets: [] } },
    get: globals.get ?? createLoadTimeGetShim(),
    ai: globals.ai ?? {},
    _status: globals._status ?? {},
    Math: createDeterministicMath(random),
    Date: Object.freeze({
      now() {
        throw new Error("兼容技能必须使用宿主提供的确定性时间");
      },
    }),
  };
  const context = createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    name: `noname:${options.pack}`,
  });

  new Script(source, {
    filename: sourcePath,
  }).runInContext(context, { timeout: 1_000 });

  const skills = sandbox.__nonameExport;
  delete sandbox.__nonameExport;
  if (!skills || typeof skills !== "object") {
    throw new Error(`无名杀武将包 ${options.pack} 没有导出技能对象`);
  }

  return new LoadedSkillModule(options.pack, skills, random, context);
}

class LoadedSkillModule implements PinnedNonameSkillModule {
  private active = true;

  constructor(
    readonly pack: string,
    readonly skills: Readonly<Record<string, NonameSkillDefinition>>,
    private readonly random: SeededRandom,
    private context: Context | undefined,
  ) {}

  snapshotRandom() {
    this.assertActive();
    return this.random.snapshot();
  }

  restoreRandom(state: number) {
    this.assertActive();
    this.random.restore(state);
  }

  dispose() {
    this.active = false;
    this.context = undefined;
  }

  private assertActive() {
    if (!this.active || !this.context) {
      throw new Error("无名杀兼容技能模块已经释放");
    }
  }
}

function transformSkillModule(source: string, pack: string) {
  const withoutImport = source.replace(
    /import\s+\{[^}]+\}\s+from\s+["']noname["'];\s*/,
    "",
  );
  if (withoutImport === source) {
    throw new Error(`无名杀武将包 ${pack} 使用了未知的核心导入格式`);
  }

  const transformed = withoutImport.replace(
    /export\s+default\s+skills\s*;\s*$/,
    "globalThis.__nonameExport = skills;",
  );
  if (transformed === withoutImport) {
    throw new Error(`无名杀武将包 ${pack} 使用了未知的技能导出格式`);
  }
  return `"use strict";\n${transformed}`;
}

function assertWithin(root: string, path: string) {
  const child = relative(root, path);
  if (child.startsWith("..") || isAbsolute(child)) {
    throw new Error("无名杀兼容模块越过了固定上游目录");
  }
}

interface SeededRandom {
  next(): number;
  snapshot(): number;
  restore(state: number): void;
}

function createSeededRandom(seed: string): SeededRandom {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0) || 1;
  return {
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0x1_0000_0000;
    },
    snapshot: () => state,
    restore(nextState) {
      if (!Number.isInteger(nextState) || nextState < 0 || nextState > 0xffff_ffff) {
        throw new Error("无名杀兼容随机状态不合法");
      }
      state = nextState || 1;
    },
  };
}

function createDeterministicMath(random: SeededRandom) {
  const math = Object.create(Math) as Math;
  Object.defineProperty(math, "random", {
    configurable: false,
    enumerable: false,
    value: () => random.next(),
    writable: false,
  });
  return Object.freeze(math);
}

function createLoadTimeGetShim() {
  return Object.freeze({
    poptip(value: unknown) {
      return String(value ?? "");
    },
  });
}

function createLoadTimeLibShim() {
  return {
    filter: Object.freeze({
      notMe(_card: unknown, player: unknown, target: unknown) {
        return player !== target;
      },
    }),
    zhanfa: Object.freeze({
      getList() {
        return [];
      },
    }),
  };
}

function createLoadTimeGameShim() {
  return Object.freeze({
    generateBeatmapTimeleap(..._args: unknown[]) {
      return () => 0;
    },
  });
}
