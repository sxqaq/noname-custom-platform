export type NonameInteractionKind =
  | "chooseBool"
  | "chooseCard"
  | "chooseControl"
  | "chooseTarget"
  | "chooseToDiscard"
  | "gainPlayerCard";

export interface NonameInteractionRequest {
  id: string;
  playerId: string;
  kind: NonameInteractionKind;
  payload: unknown;
}

export interface NonameInteractionCommand {
  requestId: string;
  playerId: string;
  result: Record<string, unknown>;
}

export interface NonameInteractionRecord {
  request: NonameInteractionRequest;
  result: Record<string, unknown>;
}

export interface NonameExecutionCheckpoint {
  version: 1;
  journal: NonameInteractionRecord[];
  pending: NonameInteractionRequest;
}

interface PendingInteraction {
  request: NonameInteractionRequest;
  resolve(result: Record<string, unknown>): void;
  reject(error: Error): void;
}

class InteractionHandle {
  constructor(private readonly result: Promise<Record<string, unknown>>) {}

  set(_key: string, _value: unknown) {
    return this;
  }

  forResult() {
    return this.result;
  }
}

/**
 * Converts upstream choose* chains into serializable requests. Recorded
 * responses can be replayed to rebuild an async skill continuation after a
 * snapshot instead of attempting to serialize a JavaScript call stack.
 */
export class NonameInteractionHost {
  private nextSequence = 1;
  private pending?: PendingInteraction;
  private readonly waiters: Array<(request: NonameInteractionRequest) => void> = [];
  private readonly records: NonameInteractionRecord[] = [];
  private replayCursor = 0;

  constructor(private readonly replayRecords: NonameInteractionRecord[] = []) {}

  player<T extends Record<string, unknown>>(playerId: string, base?: T): T & Record<string, any> {
    const request = (kind: NonameInteractionKind, payload: unknown) =>
      new InteractionHandle(this.request(playerId, kind, payload));
    return Object.assign(base ?? ({} as T), {
      id: playerId,
      chooseBool: (payload: unknown) => request("chooseBool", payload),
      chooseCard: (payload: unknown) => request("chooseCard", payload),
      chooseControl: (payload: unknown) => request("chooseControl", payload),
      chooseTarget: (payload: unknown) => request("chooseTarget", payload),
      chooseToDiscard: (payload: unknown) => request("chooseToDiscard", payload),
      gainPlayerCard: (payload: unknown) => request("gainPlayerCard", payload),
    });
  }

  async waitForRequest() {
    if (this.pending) return structuredClone(this.pending.request);
    return new Promise<NonameInteractionRequest>((resolve) => this.waiters.push(resolve));
  }

  currentRequest() {
    return this.pending ? structuredClone(this.pending.request) : undefined;
  }

  submit(command: NonameInteractionCommand) {
    const pending = this.pending;
    if (!pending) throw new Error("当前没有等待中的无名杀交互");
    if (command.requestId !== pending.request.id) throw new Error("无名杀交互请求 ID 不匹配");
    if (command.playerId !== pending.request.playerId) throw new Error("无权回答其他玩家的无名杀交互");

    this.pending = undefined;
    const result = structuredClone(command.result);
    this.records.push({ request: pending.request, result });
    pending.resolve(result);
  }

  journal() {
    return structuredClone(this.records);
  }

  dispose(reason = "无名杀交互宿主已释放") {
    this.pending?.reject(new Error(reason));
    this.pending = undefined;
    this.waiters.splice(0);
  }

  private request(playerId: string, kind: NonameInteractionKind, payload: unknown) {
    if (this.pending) throw new Error("同一规则实例不能同时等待多个无名杀交互");
    const request: NonameInteractionRequest = {
      id: `noname-${this.nextSequence++}`,
      playerId,
      kind,
      payload: toSerializable(payload),
    };

    const replay = this.replayRecords[this.replayCursor];
    if (replay) {
      assertReplayRequest(request, replay.request);
      this.replayCursor++;
      const result = structuredClone(replay.result);
      this.records.push({ request, result });
      return Promise.resolve(result);
    }

    const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending = { request, resolve, reject };
    });
    for (const waiter of this.waiters.splice(0)) waiter(structuredClone(request));
    return promise;
  }
}

export class ReplayableNonameExecution<T> {
  private constructor(
    private readonly host: NonameInteractionHost,
    private readonly completion: Promise<T>,
  ) {}

  static start<T>(
    factory: (host: NonameInteractionHost) => Promise<T> | T,
    checkpoint?: NonameExecutionCheckpoint,
  ) {
    if (checkpoint && checkpoint.version !== 1) {
      throw new Error("不支持的无名杀执行检查点版本");
    }
    const host = new NonameInteractionHost(checkpoint?.journal);
    const completion = Promise.resolve().then(() => factory(host));
    const execution = new ReplayableNonameExecution(host, completion);
    if (!checkpoint) return Promise.resolve(execution);
    return execution.waitForRequest().then((request) => {
      assertReplayRequest(request, checkpoint.pending);
      return execution;
    });
  }

  waitForRequest() {
    return Promise.race([
      this.host.waitForRequest(),
      this.completion.then(() => {
        throw new Error("无名杀技能已完成，没有等待中的交互");
      }),
    ]);
  }

  submit(command: NonameInteractionCommand) {
    this.host.submit(command);
  }

  async checkpoint(): Promise<NonameExecutionCheckpoint> {
    const pending = this.host.currentRequest() ?? (await this.waitForRequest());
    return {
      version: 1,
      journal: this.host.journal(),
      pending,
    };
  }

  result() {
    return this.completion;
  }

  dispose(reason?: string) {
    this.host.dispose(reason);
  }
}

function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "function" || value === undefined || typeof value === "symbol") return undefined;
  if (Array.isArray(value)) return value.map((item) => toSerializable(item, seen));
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const serializable = toSerializable(item, seen);
    if (serializable !== undefined) result[key] = serializable;
  }
  seen.delete(value);
  return result;
}

function assertReplayRequest(actual: NonameInteractionRequest, expected: NonameInteractionRequest) {
  if (
    actual.id !== expected.id ||
    actual.playerId !== expected.playerId ||
    actual.kind !== expected.kind ||
    JSON.stringify(actual.payload) !== JSON.stringify(expected.payload)
  ) {
    throw new Error("无名杀交互回放与当前技能执行分叉");
  }
}
