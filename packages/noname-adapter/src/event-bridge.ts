export interface NonameEventLossRecord {
  playerId: string;
  cards?: unknown[];
  cards2?: unknown[];
  hs?: unknown[];
  es?: unknown[];
  js?: unknown[];
  xs?: unknown[];
}

export interface NonameEventRecord {
  id: string;
  name: string;
  parentId?: string;
  triggerId?: string;
  playerId?: string;
  sourceId?: string;
  targetId?: string;
  data?: Record<string, unknown>;
  losses?: Record<string, NonameEventLossRecord>;
  gains?: Record<string, unknown[]>;
  discarded?: Record<string, unknown[]>;
}

export type NonameEventMutation =
  | { eventId: string; op: "set"; key: string; value: unknown }
  | { eventId: string; op: "cancel" }
  | { eventId: string; op: "finish" }
  | { eventId: string; op: "goto"; step: string | number };

export interface NonameEventBridgeSnapshot {
  version: 1;
  events: NonameEventRecord[];
  mutations: NonameEventMutation[];
}

export interface NonameEventBridgeOptions {
  events: NonameEventRecord[];
  checkpoint?: NonameEventBridgeSnapshot;
  resolvePlayer?: (playerId: string) => unknown;
}

export interface NonameRuleEventPatch {
  cancelled?: boolean;
  data?: Record<string, unknown>;
}

/**
 * A serializable parent-linked event graph for trusted upstream skill code.
 * Every write is journaled instead of mutating the authoritative engine
 * directly, so the host can validate, apply, snapshot and replay it.
 */
export class NonameEventBridge {
  private readonly events = new Map<string, NonameEventRecord>();
  private readonly proxies = new Map<string, Record<string, any>>();
  private readonly collectionProxies = new Map<string, unknown[]>();
  private readonly journal: NonameEventMutation[];
  private readonly resolvePlayer: (playerId: string) => unknown;

  constructor(options: NonameEventBridgeOptions) {
    const source = options.checkpoint?.events ?? options.events;
    if (options.checkpoint && options.checkpoint.version !== 1)
      throw new Error("Unsupported Noname event bridge checkpoint version");
    if (!source.length || source.length > 256)
      throw new Error("Noname event graph must contain 1 to 256 events");
    for (const record of source) {
      validateId(record.id, "event ID");
      if (this.events.has(record.id))
        throw new Error(`Duplicate Noname event ID: ${record.id}`);
      this.events.set(record.id, structuredClone(record));
    }
    this.validateLinks();
    this.journal = structuredClone(options.checkpoint?.mutations ?? []);
    this.resolvePlayer =
      options.resolvePlayer ??
      ((playerId) => ({ id: playerId, playerid: playerId }));
  }

  event(eventId: string): Record<string, any> {
    const cached = this.proxies.get(eventId);
    if (cached) return cached;
    const record = this.requireEvent(eventId);
    const bridge = this;
    const methods: Record<string, (...args: any[]) => unknown> = {
      getParent(query?: number | string) {
        return bridge.getParent(eventId, query);
      },
      getTrigger() {
        return record.triggerId ? bridge.event(record.triggerId) : undefined;
      },
      set(key: string, value: unknown) {
        bridge.set(eventId, key, value);
        return proxy;
      },
      cancel() {
        bridge.flag(eventId, "cancel");
        return proxy;
      },
      untrigger() {
        bridge.flag(eventId, "cancel");
        return proxy;
      },
      finish() {
        bridge.flag(eventId, "finish");
        return proxy;
      },
      goto(step: string | number) {
        if (typeof step !== "string" && typeof step !== "number")
          throw new Error("Noname event goto step must be a string or number");
        bridge.record({ eventId, op: "goto", step });
        return proxy;
      },
      getl(player: unknown) {
        const playerId = playerIdOf(player);
        return playerId
          ? structuredClone(record.losses?.[playerId])
          : undefined;
      },
      getg(player: unknown) {
        const playerId = playerIdOf(player);
        return playerId ? structuredClone(record.gains?.[playerId] ?? []) : [];
      },
      getd(player?: unknown) {
        const playerId = playerIdOf(player);
        if (playerId)
          return structuredClone(record.discarded?.[playerId] ?? []);
        return structuredClone(Object.values(record.discarded ?? {}).flat());
      },
      hasNature(nature?: string) {
        const current = record.data?.nature;
        if (nature === undefined) return Boolean(current);
        return Array.isArray(current)
          ? current.includes(nature)
          : current === nature;
      },
      notLink() {
        return record.data?.linked !== true;
      },
      changeToZero() {
        bridge.set(eventId, "num", 0);
        return proxy;
      },
    };
    const proxy = new Proxy(methods, {
      get(target, property, receiver) {
        if (typeof property !== "string")
          return Reflect.get(target, property, receiver);
        if (property in target) return Reflect.get(target, property, receiver);
        if (property === "id") return record.id;
        if (property === "name") return record.name;
        if (property === "player")
          return record.playerId
            ? bridge.resolvePlayer(record.playerId)
            : undefined;
        if (property === "source")
          return record.sourceId
            ? bridge.resolvePlayer(record.sourceId)
            : undefined;
        if (property === "target")
          return record.targetId
            ? bridge.resolvePlayer(record.targetId)
            : undefined;
        const value = record.data?.[property];
        return Array.isArray(value)
          ? bridge.collection(eventId, property, value)
          : value;
      },
      set(_target, property, value) {
        if (typeof property !== "string")
          throw new Error("Noname event symbol properties are not supported");
        bridge.set(eventId, property, value);
        return true;
      },
      ownKeys(target) {
        return [
          ...new Set([
            ...Reflect.ownKeys(target),
            ...Object.keys(record.data ?? {}),
          ]),
        ];
      },
      getOwnPropertyDescriptor() {
        return { configurable: true, enumerable: true, writable: true };
      },
    });
    this.proxies.set(eventId, proxy);
    return proxy;
  }

  mutations() {
    return structuredClone(this.journal);
  }

  authoritativePatch(eventId: string): NonameRuleEventPatch {
    const record = this.requireEvent(eventId);
    const data = record.data ?? {};
    const patch: Record<string, unknown> = {};
    for (const key of [
      "num",
      "numFixed",
      "cardName",
      "targetId",
      "targetIndex",
    ])
      if (data[key] !== undefined) patch[key] = structuredClone(data[key]);
    for (const [nonameKey, hostKey] of [
      ["targets", "targetIds"],
      ["directHit", "directHitTargetIds"],
      ["excluded", "excludedTargetIds"],
    ] as const) {
      const values = data[nonameKey];
      if (Array.isArray(values))
        patch[hostKey] = values.map((value) => playerIdOf(value) ?? value);
    }
    const card = data.card;
    if (
      card &&
      typeof card === "object" &&
      "name" in card &&
      typeof card.name === "string"
    )
      patch.cardName = card.name;
    return {
      ...(data.cancelled === true ? { cancelled: true } : {}),
      ...(Object.keys(patch).length ? { data: patch } : {}),
    };
  }

  snapshot(): NonameEventBridgeSnapshot {
    return {
      version: 1,
      events: structuredClone([...this.events.values()]),
      mutations: this.mutations(),
    };
  }

  private getParent(eventId: string, query?: number | string) {
    if (typeof query === "string") {
      let current = this.parentOf(eventId);
      while (current) {
        if (current.name === query) return this.event(current.id);
        current = current.parentId
          ? this.events.get(current.parentId)
          : undefined;
      }
      return undefined;
    }
    let levels = query ?? 1;
    if (!Number.isInteger(levels) || levels < 0 || levels > 256)
      throw new Error("Noname event parent depth must be from 0 to 256");
    if (levels === 0) return this.event(eventId);
    let current: NonameEventRecord | undefined = this.requireEvent(eventId);
    while (levels-- > 0) {
      if (!current) return undefined;
      current = current.parentId
        ? this.events.get(current.parentId)
        : undefined;
    }
    return current ? this.event(current.id) : undefined;
  }

  private set(eventId: string, key: string, value: unknown) {
    if (!/^[A-Za-z_$][\w$]*$/.test(key))
      throw new Error(`Invalid Noname event property: ${key}`);
    const serializable = cloneSerializable(value);
    const record = this.requireEvent(eventId);
    record.data ??= {};
    record.data[key] = serializable;
    this.collectionProxies.delete(`${eventId}:${key}`);
    this.record({ eventId, op: "set", key, value: serializable });
  }

  private collection(eventId: string, key: string, source: unknown[]) {
    const cacheKey = `${eventId}:${key}`;
    const cached = this.collectionProxies.get(cacheKey);
    if (cached) return cached;
    const playerCollection = ["targets", "directHit", "excluded"].includes(key);
    const decode = (value: unknown) =>
      playerCollection && typeof value === "string"
        ? this.resolvePlayer(value)
        : structuredClone(value);
    const encode = (value: unknown) =>
      playerCollection ? (playerIdOf(value) ?? value) : value;
    const values = source.map(decode);
    const same = (left: unknown, right: unknown) =>
      playerCollection
        ? playerIdOf(left) !== undefined &&
          playerIdOf(left) === playerIdOf(right)
        : Object.is(left, right);
    const commit = () => {
      const serialized = values.map(encode);
      const record = this.requireEvent(eventId);
      record.data ??= {};
      record.data[key] = cloneSerializable(serialized);
      this.record({
        eventId,
        op: "set",
        key,
        value: structuredClone(serialized),
      });
    };
    const mutators = new Set([
      "copyWithin",
      "fill",
      "pop",
      "push",
      "reverse",
      "shift",
      "sort",
      "splice",
      "unshift",
    ]);
    const proxy = new Proxy(values, {
      get(target, property, receiver) {
        if (property === "add")
          return (value: unknown) => {
            if (!target.some((item) => same(item, value))) {
              target.push(value);
              commit();
            }
            return proxy;
          };
        if (property === "addArray")
          return (items: unknown[]) => {
            if (!Array.isArray(items))
              throw new Error(`${key}.addArray expects an array`);
            let changed = false;
            for (const item of items)
              if (!target.some((current) => same(current, item))) {
                target.push(item);
                changed = true;
              }
            if (changed) commit();
            return proxy;
          };
        if (property === "remove")
          return (value: unknown) => {
            const index = target.findIndex((item) => same(item, value));
            if (index >= 0) {
              target.splice(index, 1);
              commit();
            }
            return value;
          };
        if (property === "removeArray")
          return (items: unknown[]) => {
            if (!Array.isArray(items))
              throw new Error(`${key}.removeArray expects an array`);
            let changed = false;
            for (const item of items) {
              let index = target.findIndex((current) => same(current, item));
              while (index >= 0) {
                target.splice(index, 1);
                changed = true;
                index = target.findIndex((current) => same(current, item));
              }
            }
            if (changed) commit();
            return proxy;
          };
        if (typeof property === "string" && mutators.has(property))
          return (...args: unknown[]) => {
            const result = (Array.prototype as any)[property].apply(
              target,
              args,
            );
            commit();
            return result;
          };
        return Reflect.get(target, property, receiver);
      },
      set(target, property, value, receiver) {
        const result = Reflect.set(target, property, value, receiver);
        commit();
        return result;
      },
    });
    this.collectionProxies.set(cacheKey, proxy);
    return proxy;
  }

  private flag(eventId: string, op: "cancel" | "finish") {
    const record = this.requireEvent(eventId);
    record.data ??= {};
    record.data[op === "cancel" ? "cancelled" : "finished"] = true;
    this.record({ eventId, op });
  }

  private record(mutation: NonameEventMutation) {
    if (this.journal.length >= 256)
      throw new Error("Noname event bridge emitted more than 256 mutations");
    this.journal.push(structuredClone(mutation));
  }

  private parentOf(eventId: string) {
    const parentId = this.requireEvent(eventId).parentId;
    return parentId ? this.events.get(parentId) : undefined;
  }

  private requireEvent(eventId: string) {
    const record = this.events.get(eventId);
    if (!record) throw new Error(`Unknown Noname event: ${eventId}`);
    return record;
  }

  private validateLinks() {
    for (const record of this.events.values()) {
      for (const [kind, linkedId] of [
        ["parent", record.parentId],
        ["trigger", record.triggerId],
      ] as const) {
        if (linkedId && !this.events.has(linkedId))
          throw new Error(
            `Noname event ${record.id} has unknown ${kind}: ${linkedId}`,
          );
      }
      const visited = new Set<string>();
      let current: NonameEventRecord | undefined = record;
      while (current?.parentId) {
        if (visited.has(current.id))
          throw new Error(`Noname event parent cycle at ${current.id}`);
        visited.add(current.id);
        current = this.events.get(current.parentId);
      }
    }
  }
}

function validateId(value: string, label: string) {
  if (!value || value.length > 128)
    throw new Error(`${label} must contain 1 to 128 characters`);
}

function playerIdOf(value: unknown) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const player = value as { id?: unknown; playerid?: unknown };
  const result = player.id ?? player.playerid;
  return typeof result === "string" ? result : undefined;
}

function cloneSerializable(value: unknown) {
  try {
    const cloned = structuredClone(value);
    const encoded = JSON.stringify(cloned);
    if (encoded !== undefined && encoded.length > 64 * 1024)
      throw new Error("value exceeds 64 KiB");
    return cloned;
  } catch (error) {
    throw new Error(
      `Noname event value must be serializable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
