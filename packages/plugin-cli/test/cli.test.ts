import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("TypeScript author plugin compiles to validated function-free IR", async () => {
  const root = await mkdtemp(resolve("../..", ".tmp-plugin-cli-"));
  try {
    const entry = join(root, "plugin.ts");
    const output = join(root, "plugin.sgs.json");
    await writeFile(
      entry,
      `import { definePackage, definePlugin } from "@sgs/script-sdk";
export default definePlugin({ engineApi: "rules-ir/v1", capabilities: ["rules"], content: definePackage({ id: "test.code_plugin", name: "代码插件", version: "1.0.0", generals: [], skills: [], cards: [], decks: [], modes: [], tests: [] }) });`,
    );
    const runner = resolve("src/runner.ts");
    const result = spawnSync(
      process.execPath,
      ["--import", import.meta.resolve("tsx"), runner, entry, output],
      { cwd: resolve("../.."), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const compiled = JSON.parse(await readFile(output, "utf8"));
    assert.equal(compiled.format, "sgs-compiled-plugin");
    assert.equal(compiled.engineApi, "rules-ir/v1");
    assert.equal(compiled.content.id, "test.code_plugin");
    assert.doesNotMatch(JSON.stringify(compiled), /function|=>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("trigger, multi-step active and judgment reference plugins compile", async () => {
  const repository = resolve("../..");
  const runner = resolve("src/runner.ts");
  const root = await mkdtemp(resolve(repository, ".tmp-plugin-examples-"));
  try {
    for (const name of [
      "trigger-skill",
      "multi-step-active",
      "judgment-response",
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          runner,
          resolve(repository, `examples/plugins/${name}.ts`),
          join(root, `${name}.sgs.json`),
        ],
        { cwd: repository, encoding: "utf8" },
      );
      assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
