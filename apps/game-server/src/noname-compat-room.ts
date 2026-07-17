import { createHash } from "node:crypto";
import { validatePackage } from "@sgs/content-schema";
import { HeadlessGame, type Effect } from "@sgs/headless-engine";
import { evaluateIsolatedMod } from "@sgs/noname-adapter";
import type { EffectDto, ExtensionPackageDto } from "@sgs/protocol";

export type NonameCompatHook = "roomStart" | "afterCommand";

export interface NonameCompatHookRecord {
  index: number;
  packageId: string;
  hook: NonameCompatHook;
  commandIndex?: number;
  inputHash: string;
  output: {
    state?: unknown;
    effects: EffectDto[];
    logs: string[];
  };
}

export interface NonameCompatRoomSnapshot {
  version: 1;
  nextHookIndex: number;
  states: Record<string, unknown>;
  records: NonameCompatHookRecord[];
}

interface HookOutput {
  state?: unknown;
  effects?: EffectDto[];
  logs?: string[];
}

export class NonameCompatRoomRuntime {
  private nextHookIndex = 0;
  private readonly states = new Map<string, unknown>();
  private readonly records: NonameCompatHookRecord[] = [];

  constructor(
    private readonly packages: ExtensionPackageDto[],
    private readonly roomSeed: string,
  ) {}

  static restore(
    packages: ExtensionPackageDto[],
    roomSeed: string,
    snapshot: NonameCompatRoomSnapshot,
  ) {
    if (snapshot.version !== 1) throw new Error("不支持的兼容房间快照版本");
    const runtime = new NonameCompatRoomRuntime(packages, roomSeed);
    runtime.nextHookIndex = snapshot.nextHookIndex;
    Object.entries(snapshot.states).forEach(([id, state]) =>
      runtime.states.set(id, structuredClone(state)),
    );
    runtime.records.push(...structuredClone(snapshot.records));
    return runtime;
  }

  async run(hook: NonameCompatHook, game: HeadlessGame, commandIndex?: number) {
    for (const pack of this.packages) {
      if (!pack.runtime) continue;
      const index = this.nextHookIndex++;
      const input = this.createInput(pack, hook, game, index, commandIndex);
      const output = await evaluateIsolatedMod<HookOutput>({
        source: pack.runtime.source,
        input,
        seed: `${this.roomSeed}:${pack.id}:${index}`,
        timeoutMs: pack.runtime.limits.timeoutMs,
        memoryMb: pack.runtime.limits.memoryMb,
      });
      const normalized = normalizeOutput(pack, output);
      if (normalized.effects.length) {
        game.applyExternalEffects(
          normalized.effects as Effect[],
          game.state.currentPlayerId,
          undefined,
          `${pack.id}:${hook}`,
        );
      }
      this.states.set(pack.id, structuredClone(normalized.state));
      this.records.push({
        index,
        packageId: pack.id,
        hook,
        commandIndex,
        inputHash: hash(input),
        output: structuredClone(normalized),
      });
    }
  }

  replay(record: NonameCompatHookRecord, game: HeadlessGame) {
    if (record.index !== this.nextHookIndex)
      throw new Error("兼容 Mod 回放钩子顺序不一致");
    const pack = this.packages.find((item) => item.id === record.packageId);
    if (!pack?.runtime) throw new Error(`回放缺少兼容扩展 ${record.packageId}`);
    const input = this.createInput(
      pack,
      record.hook,
      game,
      record.index,
      record.commandIndex,
    );
    if (hash(input) !== record.inputHash)
      throw new Error(`兼容扩展 ${pack.id} 回放输入状态分叉`);
    if (record.output.effects.length)
      game.applyExternalEffects(
        record.output.effects as Effect[],
        game.state.currentPlayerId,
        undefined,
        `${pack.id}:${record.hook}`,
      );
    this.states.set(pack.id, structuredClone(record.output.state));
    this.records.push(structuredClone(record));
    this.nextHookIndex++;
  }

  snapshot(): NonameCompatRoomSnapshot {
    return {
      version: 1,
      nextHookIndex: this.nextHookIndex,
      states: Object.fromEntries(
        [...this.states].map(([id, state]) => [id, structuredClone(state)]),
      ),
      records: structuredClone(this.records),
    };
  }

  private createInput(
    pack: ExtensionPackageDto,
    hook: NonameCompatHook,
    game: HeadlessGame,
    index: number,
    commandIndex?: number,
  ) {
    const fullState = pack.runtime!.permissions.includes("game-state");
    return {
      apiVersion: pack.runtime!.apiVersion,
      hook,
      hookIndex: index,
      commandIndex,
      packageId: pack.id,
      state: structuredClone(this.states.get(pack.id)),
      game: fullState
        ? JSON.parse(game.snapshot())
        : {
            status: game.state.status,
            sequence: game.state.sequence,
            currentPlayerId: game.state.currentPlayerId,
            turn: game.state.turn,
            phase: game.state.phase,
          },
    };
  }
}

function normalizeOutput(pack: ExtensionPackageDto, output: HookOutput) {
  if (!output || typeof output !== "object")
    throw new Error(`兼容扩展 ${pack.id} 必须返回对象`);
  const effects = output.effects ?? [];
  if (!Array.isArray(effects))
    throw new Error(`兼容扩展 ${pack.id} 的 effects 必须是数组`);
  if (effects.length && !pack.runtime!.permissions.includes("game-state"))
    throw new Error(
      `兼容扩展 ${pack.id} 未申请 game-state 权限，不能修改规则状态`,
    );
  if (effects.length) validateEffects(pack.id, effects);
  const logs = output.logs ?? [];
  if (
    !Array.isArray(logs) ||
    logs.length > 32 ||
    logs.some((item) => typeof item !== "string" || item.length > 200)
  )
    throw new Error(`兼容扩展 ${pack.id} 的日志不合法`);
  const state = structuredClone(output.state);
  if (Buffer.byteLength(JSON.stringify(state ?? null), "utf8") > 256 * 1024)
    throw new Error(`兼容扩展 ${pack.id} 的状态超过 256 KiB`);
  return { state, effects: structuredClone(effects), logs: [...logs] };
}

function validateEffects(packageId: string, effects: EffectDto[]) {
  const result = validatePackage({
    schemaVersion: 4,
    id: "runtime.validation",
    name: "运行时效果校验",
    version: "1.0.0",
    assets: [],
    generals: [],
    skills: [
      {
        id: "runtime.hook",
        name: packageId,
        event: "turnStart",
        effects,
      },
    ],
    cards: [],
    decks: [],
    modes: [],
    tests: [],
  });
  if (!result.ok)
    throw new Error(
      `兼容扩展 ${packageId} 返回非法效果：${result.errors.join("；")}`,
    );
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
