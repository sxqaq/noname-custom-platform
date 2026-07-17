import assert from "node:assert/strict";
import test from "node:test";
import { evaluateIsolatedMod } from "../src/index.js";

test("隔离 Mod Worker 只接收结构化输入并使用确定性随机源", async () => {
  const source = `(input) => ({
    value: input.value * 2,
    random: [Math.random(), Math.random()],
    processType: typeof process,
    requireType: typeof require,
    fetchType: typeof fetch,
  })`;
  const first = await evaluateIsolatedMod<Record<string, unknown>>({
    source,
    input: { value: 21 },
    seed: "worker-seed",
  });
  const second = await evaluateIsolatedMod<Record<string, unknown>>({
    source,
    input: { value: 21 },
    seed: "worker-seed",
  });

  assert.deepEqual(first, second);
  assert.equal(first.value, 42);
  assert.equal(first.processType, "undefined");
  assert.equal(first.requireType, "undefined");
  assert.equal(first.fetchType, "undefined");
});

test("隔离 Mod Worker 禁止动态代码生成和系统时间", async () => {
  await assert.rejects(
    evaluateIsolatedMod({
      source: `() => Function("return 1")()`,
      seed: "fixed",
    }),
    /Code generation from strings disallowed/,
  );
  await assert.rejects(
    evaluateIsolatedMod({ source: `() => Date.now()`, seed: "fixed" }),
    /禁止访问系统时间/,
  );
});

test("隔离 Mod Worker 的死循环会被宿主强制终止", async () => {
  await assert.rejects(
    evaluateIsolatedMod({
      source: `() => { while (true) {} }`,
      seed: "fixed",
      timeoutMs: 50,
    }),
    /强制终止/,
  );
});
