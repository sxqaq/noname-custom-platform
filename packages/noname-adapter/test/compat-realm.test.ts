import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadPinnedNonameSkillModule } from "../src/index.js";

const upstreamRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../vendor/noname",
);

test("真实无名杀标准技能包可以在无 DOM Node 环境加载", async () => {
  const module = await loadPinnedNonameSkillModule({
    upstreamRoot,
    pack: "standard",
    seed: "compatibility-seed",
  });

  assert.ok(Object.keys(module.skills).length > 20);
  assert.equal(module.skills.ganglie.trigger?.player, "damageEnd");

  let draws = 0;
  await module.skills.stdqingjiao.content?.(
    {},
    {},
    { draw: async () => void draws++ },
  );
  assert.equal(draws, 1);
  module.dispose();
});

test("真实技能中的 Math.random 由可快照种子随机源驱动", async () => {
  const first = await loadPinnedNonameSkillModule({
    upstreamRoot,
    pack: "standard",
    seed: "same-seed",
  });
  const second = await loadPinnedNonameSkillModule({
    upstreamRoot,
    pack: "standard",
    seed: "same-seed",
  });
  const check = (
    module: Awaited<ReturnType<typeof loadPinnedNonameSkillModule>>,
  ) => module.skills.ganglie.check?.({ source: undefined }, {}) as boolean;

  assert.deepEqual(
    [check(first), check(first), check(first)],
    [check(second), check(second), check(second)],
  );

  const snapshot = first.snapshotRandom();
  const expected = check(first);
  first.restoreRandom(snapshot);
  assert.equal(check(first), expected);
  first.dispose();
  second.dispose();
});

test("固定提交中的全部上游武将技能包均可直接加载", async () => {
  const characterRoot = resolve(upstreamRoot, "apps/core/character");
  const entries = await readdir(characterRoot, { withFileTypes: true });
  const packs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.ok(packs.length >= 20);
  for (const pack of packs) {
    const module = await loadPinnedNonameSkillModule({
      upstreamRoot,
      pack,
      seed: `audit:${pack}`,
    });
    assert.ok(Object.keys(module.skills).length > 0, `${pack} 应导出技能`);
    module.dispose();
  }
});

test("Node 20 兼容垫片只安装在无名杀隔离 realm", async () => {
  const hostObject = Object as typeof Object & { groupBy?: unknown };
  const originalHostGroupBy = hostObject.groupBy;
  const module = await loadPinnedNonameSkillModule({
    upstreamRoot,
    pack: "collab",
    seed: "node-20-polyfill",
  });

  try {
    assert.ok(Object.keys(module.skills).length > 0);
    assert.equal(hostObject.groupBy, originalHostGroupBy);
  } finally {
    module.dispose();
  }
});

test("兼容加载器拒绝越过固定武将包目录", async () => {
  await assert.rejects(
    loadPinnedNonameSkillModule({
      upstreamRoot,
      pack: "../standard",
      seed: "fixed",
    }),
    /ID 不合法/,
  );
});
