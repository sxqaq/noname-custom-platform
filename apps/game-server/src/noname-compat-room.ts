import { createHash } from "node:crypto";
import { validatePackage } from "@sgs/content-schema";
import {
  HeadlessGame,
  type Effect,
  type ExternalRuleEvent,
  type ExternalRuleEventResolution,
  type GameCommand,
  type GameLog,
} from "@sgs/headless-engine";
import { evaluateIsolatedMod } from "@sgs/noname-adapter";
import type {
  EffectDto,
  ExtensionPackageDto,
  SkillSelectionDto,
} from "@sgs/protocol";

export type NonameCompatHook =
  "roomStart" | "afterCommand" | "choiceResponse" | "ruleEvent";

interface RuleEventPatch {
  cancelled?: boolean;
  data?: Record<string, unknown>;
}

export interface NonameCompatChoiceResponse {
  requestId: string;
  cardIds?: string[];
  targetIds?: string[];
  optionId?: string;
  numberValue?: number;
  suit?: "spade" | "heart" | "club" | "diamond";
}

export interface NonameCompatPendingChoice {
  packageId: string;
  packageName: string;
  playerId: string;
  requestId: string;
  selection: SkillSelectionDto;
}

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
    request?: NonameCompatPendingChoice;
    ruleEvent?: RuleEventPatch;
  };
  context: NonameCompatHookContext;
}

export interface NonameCompatRoomSnapshot {
  version: 1;
  nextHookIndex: number;
  states: Record<string, unknown>;
  records: NonameCompatHookRecord[];
  pending?: InternalPendingChoice;
}

export interface NonameCompatHookContext {
  command?: GameCommand;
  events?: GameLog[];
  actorPlayerId?: string;
  selectedPlayerId?: string;
  choice?: NonameCompatChoiceResponse;
  ruleEvent?: ExternalRuleEvent;
}

interface HookOutput {
  state?: unknown;
  effects?: EffectDto[];
  logs?: string[];
  request?: {
    playerId?: string;
    selection: SkillSelectionDto;
  };
  ruleEvent?: RuleEventPatch;
}

interface InternalPendingChoice extends NonameCompatPendingChoice {
  continuation: {
    nextPackageIndex: number;
    hook: Exclude<NonameCompatHook, "choiceResponse" | "ruleEvent">;
    commandIndex?: number;
    context: NonameCompatHookContext;
  };
}

export class NonameCompatRoomRuntime {
  private nextHookIndex = 0;
  private readonly states = new Map<string, unknown>();
  private readonly records: NonameCompatHookRecord[] = [];
  private pending?: InternalPendingChoice;

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
    runtime.pending = structuredClone(snapshot.pending);
    return runtime;
  }

  pendingChoice(): NonameCompatPendingChoice | undefined {
    if (!this.pending) return undefined;
    const { continuation: _, ...choice } = this.pending;
    return structuredClone(choice);
  }

  async run(
    hook: Exclude<NonameCompatHook, "ruleEvent">,
    game: HeadlessGame,
    commandIndex?: number,
    context: NonameCompatHookContext = {},
  ) {
    if (hook === "choiceResponse")
      throw new Error("choiceResponse 必须通过 respond() 执行");
    if (this.pending) throw new Error("高级 Mod 正在等待玩家选择");
    await this.runPackages(0, hook, game, commandIndex, context);
  }

  async runRuleEvent(
    game: HeadlessGame,
    event: ExternalRuleEvent,
    commandIndex?: number,
  ): Promise<ExternalRuleEventResolution> {
    if (this.pending) throw new Error("高级 Mod 正在等待玩家选择");
    let current = structuredClone(event);
    for (
      let packageIndex = 0;
      packageIndex < this.packages.length;
      packageIndex++
    ) {
      if (!this.packages[packageIndex].runtime) continue;
      const result = await this.executePackage(
        packageIndex,
        "ruleEvent",
        game,
        commandIndex,
        { actorPlayerId: current.playerId, ruleEvent: current },
        {
          nextPackageIndex: packageIndex + 1,
          hook: "afterCommand",
          commandIndex,
          context: {},
        },
      );
      if (result.requested) throw new Error("规则事件钩子尚不能请求玩家输入");
      if (result.output?.ruleEvent)
        current = mergeRuleEvent(current, result.output.ruleEvent);
    }
    return {
      eventId: current.id,
      cancelled: current.data.cancelled === true,
      data: structuredClone(current.data),
    };
  }

  async respond(
    game: HeadlessGame,
    playerId: string,
    response: NonameCompatChoiceResponse,
    commandIndex: number,
  ) {
    const pending = this.pending;
    if (!pending) throw new Error("当前没有高级 Mod 选择请求");
    if (pending.playerId !== playerId) throw new Error("该选择不属于当前玩家");
    if (pending.requestId !== response.requestId)
      throw new Error("高级 Mod 选择请求已经过期");
    validateChoiceResponse(game, pending, response);
    const packageIndex = this.packages.findIndex(
      (pack) => pack.id === pending.packageId,
    );
    if (packageIndex < 0) throw new Error("发起选择的高级 Mod 已不存在");
    const continuation = structuredClone(pending.continuation);
    this.pending = undefined;
    const context: NonameCompatHookContext = {
      ...structuredClone(continuation.context),
      actorPlayerId: playerId,
      choice: structuredClone(response),
    };
    const requestedAgain = await this.executePackage(
      packageIndex,
      "choiceResponse",
      game,
      commandIndex,
      context,
      continuation,
    );
    if (!requestedAgain.requested)
      await this.runPackages(
        continuation.nextPackageIndex,
        continuation.hook,
        game,
        commandIndex,
        continuation.context,
      );
  }

  replay(record: NonameCompatHookRecord, game: HeadlessGame) {
    if (record.index !== this.nextHookIndex)
      throw new Error("兼容 Mod 回放钩子顺序不一致");
    const pack = this.packages.find((item) => item.id === record.packageId);
    if (!pack?.runtime) throw new Error(`回放缺少兼容扩展 ${record.packageId}`);
    const context = record.context ?? {};
    if (record.hook === "choiceResponse") this.pending = undefined;
    const input = this.createInput(
      pack,
      record.hook,
      game,
      record.index,
      record.commandIndex,
      context,
    );
    if (hash(input) !== record.inputHash)
      throw new Error(`兼容扩展 ${pack.id} 回放输入状态分叉`);
    if (record.output.effects.length)
      game.applyExternalEffects(
        record.output.effects as Effect[],
        context.actorPlayerId ?? game.state.currentPlayerId,
        context.selectedPlayerId,
        `${pack.id}:${record.hook}`,
      );
    this.states.set(pack.id, structuredClone(record.output.state));
    if (record.output.request)
      this.pending = {
        ...structuredClone(record.output.request),
        continuation: {
          nextPackageIndex: this.packages.length,
          hook: "afterCommand",
          commandIndex: record.commandIndex,
          context: structuredClone(context),
        },
      };
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
      pending: structuredClone(this.pending),
    };
  }

  private async runPackages(
    startIndex: number,
    hook: Exclude<NonameCompatHook, "choiceResponse" | "ruleEvent">,
    game: HeadlessGame,
    commandIndex: number | undefined,
    context: NonameCompatHookContext,
  ) {
    for (
      let packageIndex = startIndex;
      packageIndex < this.packages.length;
      packageIndex++
    ) {
      if (!this.packages[packageIndex].runtime) continue;
      const requested = await this.executePackage(
        packageIndex,
        hook,
        game,
        commandIndex,
        context,
        {
          nextPackageIndex: packageIndex + 1,
          hook,
          commandIndex,
          context: structuredClone(context),
        },
      );
      if (requested.requested) return;
    }
  }

  private async executePackage(
    packageIndex: number,
    hook: NonameCompatHook,
    game: HeadlessGame,
    commandIndex: number | undefined,
    context: NonameCompatHookContext,
    continuation: InternalPendingChoice["continuation"],
  ) {
    const pack = this.packages[packageIndex];
    if (!pack.runtime) return { requested: false as const };
    const index = this.nextHookIndex++;
    const input = this.createInput(
      pack,
      hook,
      game,
      index,
      commandIndex,
      context,
    );
    const output = await evaluateIsolatedMod<HookOutput>({
      source: pack.runtime.source,
      input,
      seed: `${this.roomSeed}:${pack.id}:${index}`,
      timeoutMs: pack.runtime.limits.timeoutMs,
      memoryMb: pack.runtime.limits.memoryMb,
    });
    const normalized = normalizeOutput(pack, output);
    if (hook === "ruleEvent" && normalized.effects.length)
      assertRuleEventEffectsSafe(pack.id, normalized.effects);
    if (normalized.effects.length)
      game.applyExternalEffects(
        normalized.effects as Effect[],
        context.actorPlayerId ?? game.state.currentPlayerId,
        context.selectedPlayerId,
        `${pack.id}:${hook}`,
      );
    this.states.set(pack.id, structuredClone(normalized.state));
    let request: NonameCompatPendingChoice | undefined;
    if (normalized.request) {
      if (!pack.runtime.permissions.includes("player-choice"))
        throw new Error(
          `兼容扩展 ${pack.id} 未申请 player-choice 权限，不能请求玩家输入`,
        );
      const playerId =
        normalized.request.playerId ??
        context.actorPlayerId ??
        game.state.currentPlayerId;
      if (
        !game.state.players.some(
          (player) => player.id === playerId && player.alive,
        )
      )
        throw new Error(`兼容扩展 ${pack.id} 请求了无效玩家`);
      validateSelection(pack.id, normalized.request.selection);
      request = {
        packageId: pack.id,
        packageName: pack.name,
        playerId,
        requestId: `${pack.id}:${index}:${normalized.request.selection.id}`,
        selection: structuredClone(normalized.request.selection),
      };
      this.pending = {
        ...structuredClone(request),
        continuation: structuredClone(continuation),
      };
    }
    this.records.push({
      index,
      packageId: pack.id,
      hook,
      commandIndex,
      inputHash: hash(input),
      context: structuredClone(context),
      output: {
        state: structuredClone(normalized.state),
        effects: structuredClone(normalized.effects),
        logs: [...normalized.logs],
        request: structuredClone(request),
        ruleEvent: structuredClone(normalized.ruleEvent),
      },
    });
    return { requested: Boolean(request), output: normalized };
  }

  private createInput(
    pack: ExtensionPackageDto,
    hook: NonameCompatHook,
    game: HeadlessGame,
    index: number,
    commandIndex?: number,
    context: NonameCompatHookContext = {},
  ) {
    const fullState = pack.runtime!.permissions.includes("game-state");
    return {
      apiVersion: pack.runtime!.apiVersion,
      hook,
      hookIndex: index,
      commandIndex,
      packageId: pack.id,
      state: structuredClone(this.states.get(pack.id)),
      context: {
        command: structuredClone(context.command),
        events: structuredClone(context.events ?? []),
        actorPlayerId: context.actorPlayerId,
        selectedPlayerId: context.selectedPlayerId,
        choice: structuredClone(context.choice),
        ruleEvent: structuredClone(context.ruleEvent),
      },
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
  const request = output.request;
  if (
    request !== undefined &&
    (!request ||
      typeof request !== "object" ||
      !request.selection ||
      typeof request.selection !== "object")
  )
    throw new Error(`兼容扩展 ${pack.id} 的玩家选择请求不合法`);
  if (output.ruleEvent && !pack.runtime!.permissions.includes("game-state"))
    throw new Error(
      `兼容扩展 ${pack.id} 未申请 game-state 权限，不能修改规则事件`,
    );
  return {
    state,
    effects: structuredClone(effects),
    logs: [...logs],
    request: structuredClone(request),
    ruleEvent: normalizeRuleEventPatch(pack.id, output.ruleEvent),
  };
}

function normalizeRuleEventPatch(
  packageId: string,
  value: RuleEventPatch | undefined,
): RuleEventPatch | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`兼容扩展 ${packageId} 的 ruleEvent 不合法`);
  if (value.cancelled !== undefined && typeof value.cancelled !== "boolean")
    throw new Error(`兼容扩展 ${packageId} 的 ruleEvent.cancelled 不合法`);
  if (
    value.data !== undefined &&
    (!value.data || typeof value.data !== "object" || Array.isArray(value.data))
  )
    throw new Error(`兼容扩展 ${packageId} 的 ruleEvent.data 不合法`);
  const normalized = structuredClone(value);
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 64 * 1024)
    throw new Error(`兼容扩展 ${packageId} 的 ruleEvent 超过 64 KiB`);
  return normalized;
}

function assertRuleEventEffectsSafe(packageId: string, effects: EffectDto[]) {
  const safe = new Set<EffectDto["type"]>([
    "draw",
    "recover",
    "addMark",
    "removeMark",
    "if",
    "repeat",
    "setState",
    "changeState",
    "changeMaxHp",
    "grantSkill",
    "removeSkill",
    "skipPhase",
  ]);
  const visit = (nodes: EffectDto[]) => {
    for (const effect of nodes) {
      if (!safe.has(effect.type))
        throw new Error(
          `兼容扩展 ${packageId} 不能在规则事件中直接执行 ${effect.type}，该效果可能产生嵌套中断`,
        );
      visit(effect.then ?? []);
      visit(effect.else ?? []);
      visit(effect.body ?? []);
    }
  };
  visit(effects);
}

function mergeRuleEvent(event: ExternalRuleEvent, patch: RuleEventPatch) {
  return {
    ...structuredClone(event),
    data: {
      ...structuredClone(event.data),
      ...structuredClone(patch.data ?? {}),
      ...(patch.cancelled === undefined ? {} : { cancelled: patch.cancelled }),
    },
  };
}

function validateSelection(packageId: string, selection: SkillSelectionDto) {
  const result = validatePackage({
    schemaVersion: 4,
    id: "runtime.selection_validation",
    name: "运行时选择校验",
    version: "1.0.0",
    assets: [],
    generals: [],
    skills: [
      {
        id: "runtime.selection",
        name: packageId,
        kind: "active",
        selections: [selection],
        effects: [{ type: "draw", target: "self", count: 1 }],
      },
    ],
    cards: [],
    decks: [],
    modes: [],
    tests: [],
  });
  if (!result.ok)
    throw new Error(
      `兼容扩展 ${packageId} 返回非法选择请求：${result.errors.join("；")}`,
    );
}

function validateChoiceResponse(
  game: HeadlessGame,
  pending: NonameCompatPendingChoice,
  response: NonameCompatChoiceResponse,
) {
  const selection = pending.selection;
  const unique = (values: string[] | undefined) => [...new Set(values ?? [])];
  if (selection.kind === "target") {
    const ids = unique(response.targetIds);
    if (ids.length !== (response.targetIds ?? []).length)
      throw new Error("选择目标不能重复");
    if (ids.length < selection.min || ids.length > selection.max)
      throw new Error("选择目标数量不符合请求");
    const self = game.state.players.find(
      (player) => player.id === pending.playerId,
    )!;
    for (const id of ids) {
      const target = game.state.players.find(
        (player) => player.id === id && player.alive,
      );
      if (!target) throw new Error("选择了无效目标");
      if (selection.targetFilter === "self" && target.id !== self.id)
        throw new Error("该选择只能指定自己");
      if (selection.targetFilter === "other" && target.id === self.id)
        throw new Error("该选择不能指定自己");
      if (selection.targetFilter === "wounded" && target.hp >= target.maxHp)
        throw new Error("该选择只能指定受伤角色");
    }
    return;
  }
  if (selection.kind === "card") {
    const ids = unique(response.cardIds);
    if (ids.length !== (response.cardIds ?? []).length)
      throw new Error("选择卡牌不能重复");
    if (ids.length < selection.min || ids.length > selection.max)
      throw new Error("选择卡牌数量不符合请求");
    const player = game.state.players.find(
      (item) => item.id === pending.playerId,
    )!;
    const available = new Set([
      ...(selection.cardZone === "hand" || selection.cardZone === "own"
        ? player.hand.map((card) => card.id)
        : []),
      ...(selection.cardZone === "own"
        ? Object.values(player.equipment).map((card) => card.id)
        : []),
    ]);
    if (ids.some((id) => !available.has(id)))
      throw new Error("选择了不属于该玩家或区域的卡牌");
    return;
  }
  if (selection.kind === "option") {
    if (!selection.options?.some((option) => option.id === response.optionId))
      throw new Error("选择了无效选项");
    return;
  }
  if (selection.kind === "number") {
    if (
      !Number.isInteger(response.numberValue) ||
      response.numberValue! < selection.min ||
      response.numberValue! > selection.max
    )
      throw new Error("选择数字超出范围");
    return;
  }
  if (!response.suit || !selection.suits?.includes(response.suit))
    throw new Error("选择了无效花色");
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
