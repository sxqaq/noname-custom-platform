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
      [
        "--experimental-vm-modules",
        "--import",
        import.meta.resolve("tsx"),
        runner,
        entry,
        output,
      ],
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

test("v1 and v2 reference plugins compile", async () => {
  const repository = resolve("../..");
  const runner = resolve("src/runner.ts");
  const root = await mkdtemp(resolve(repository, ".tmp-plugin-examples-"));
  try {
    for (const name of [
      "trigger-skill",
      "multi-step-active",
      "judgment-response",
      "conditional-state",
      "advanced-runtime",
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          "--experimental-vm-modules",
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

test("advanced TypeScript hook is isolated, tested and emitted as runtime source", async () => {
  const repository = resolve("../..");
  const runner = resolve("src/runner.ts");
  const root = await mkdtemp(resolve(repository, ".tmp-plugin-advanced-"));
  try {
    const entry = join(root, "advanced.ts");
    const output = join(root, "advanced.sgs.json");
    await writeFile(
      entry,
      `import { definePackage, definePlugin, defineRuntime } from "@sgs/script-sdk";
const runtime = defineRuntime<{ calls: number }>((input) => ({ state: { calls: (input.state?.calls ?? 0) + 1 }, effects: [{ type: "addMark", target: "self", mark: "advanced_calls", count: 1 }] }), { permissions: ["game-state"] });
export default definePlugin({ engineApi: "rules-ir/v2", capabilities: ["rules", "advanced-runtime"], content: definePackage({ id: "test.advanced_plugin", name: "高级插件", version: "1.0.0", generals: [], skills: [], cards: [], decks: [], modes: [], tests: [], runtime }) });`,
    );
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-vm-modules",
        "--import",
        import.meta.resolve("tsx"),
        runner,
        entry,
        output,
      ],
      { cwd: repository, encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(result.status, 0, result.stderr);
    const compiled = JSON.parse(await readFile(output, "utf8"));
    assert.equal(compiled.content.runtime.apiVersion, "noname-compat/v1");
    assert.match(compiled.content.runtime.source, /advanced_calls/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin sandbox denies system imports and nondeterministic globals", async () => {
  const repository = resolve("../..");
  const runner = resolve("src/runner.ts");
  const root = await mkdtemp(resolve(repository, ".tmp-plugin-sandbox-"));
  try {
    const output = join(root, "blocked.sgs.json");
    const systemImport = join(root, "system-import.ts");
    await writeFile(
      systemImport,
      `import fs from "node:fs"; export default fs;`,
    );
    const denied = spawnSync(
      process.execPath,
      [
        "--experimental-vm-modules",
        "--import",
        import.meta.resolve("tsx"),
        runner,
        systemImport,
        output,
      ],
      { cwd: repository, encoding: "utf8" },
    );
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /only allows imports/);

    const random = join(root, "random.ts");
    await writeFile(
      random,
      `import { definePlugin } from "@sgs/script-sdk"; Math.random(); export default definePlugin({ engineApi: "rules-ir/v2", capabilities: ["rules"], content: {} as never });`,
    );
    const nondeterministic = spawnSync(
      process.execPath,
      [
        "--experimental-vm-modules",
        "--import",
        import.meta.resolve("tsx"),
        runner,
        random,
        output,
      ],
      { cwd: repository, encoding: "utf8" },
    );
    assert.notEqual(nondeterministic.status, 0);
    assert.match(nondeterministic.stderr, /Math\.random is unavailable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Noname compatibility audit and skill migration scaffold are buildable", async () => {
  const repository = resolve("../..");
  const cli = resolve("dist/index.js");
  const root = await mkdtemp(resolve(repository, ".tmp-noname-migration-"));
  try {
    const reportPath = join(root, "compatibility.json");
    const audit = spawnSync(
      process.execPath,
      [
        cli,
        "audit-noname",
        "--upstream",
        resolve(repository, "vendor/noname"),
        "--out",
        reportPath,
      ],
      { cwd: repository, encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(audit.status, 0, audit.stderr);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.ok(report.packCount >= 20);
    assert.ok(report.summary.unsupported > 0);

    const migrated = join(root, "fanjian.ts");
    const migrate = spawnSync(
      process.execPath,
      [
        cli,
        "migrate-noname",
        "standard",
        "fanjian",
        "--upstream",
        resolve(repository, "vendor/noname"),
        "--out",
        migrated,
      ],
      { cwd: repository, encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(migrate.status, 0, migrate.stderr);
    assert.match(await readFile(migrated, "utf8"), /player\.gainPlayerCard/);
    const output = join(root, "fanjian.sgs.json");
    const build = spawnSync(
      process.execPath,
      [cli, "build", migrated, "--out", output],
      { cwd: repository, encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(build.status, 0, build.stderr);
    const compiled = JSON.parse(await readFile(output, "utf8"));
    assert.equal(compiled.content.runtime.apiVersion, "noname-compat/v1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
