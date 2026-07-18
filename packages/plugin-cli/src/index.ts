#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  analyzeNonameApiUsage,
  auditPinnedNonameApiUsage,
  compatibilityForApi,
  loadPinnedNonameSkillModule,
  type NonameSkillDefinition,
} from "@sgs/noname-adapter";

const [command, ...args] = process.argv.slice(2);

if (command === "build" || command === "watch" || command === "test") {
  const entry = resolve(args[0] ?? "plugin.ts");
  const outputIndex = args.indexOf("--out");
  const output =
    command === "test"
      ? "-"
      : resolve(
          outputIndex >= 0
            ? (args[outputIndex + 1] ?? "plugin.sgs.json")
            : "plugin.sgs.json",
        );
  const build = () => compile(entry, output);
  const status = build();
  if (command === "build" || command === "test") process.exitCode = status;
  else {
    console.log(`Watching ${entry}`);
    let timer: NodeJS.Timeout | undefined;
    watch(entry, () => {
      clearTimeout(timer);
      timer = setTimeout(build, 120);
    });
  }
} else if (command === "audit-noname") {
  const upstreamRoot = resolve(option(args, "--upstream") ?? "vendor/noname");
  const report = await auditPinnedNonameApiUsage(upstreamRoot);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const output = option(args, "--out");
  if (output) {
    const path = resolve(output);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, serialized, "utf8");
    console.log(`Wrote Noname compatibility audit to ${path}`);
  } else process.stdout.write(serialized);
} else if (command === "migrate-noname") {
  const pack = args[0];
  const skillId = args[1];
  if (!pack || !skillId) throw new Error("Pack and skill ID are required");
  const upstreamRoot = resolve(option(args, "--upstream") ?? "vendor/noname");
  const output = resolve(option(args, "--out") ?? `${pack}-${skillId}.ts`);
  const module = await loadPinnedNonameSkillModule({
    upstreamRoot,
    pack,
    seed: `migration:${pack}:${skillId}`,
  });
  try {
    const skill = module.skills[skillId];
    if (!skill) throw new Error(`Skill ${skillId} does not exist in ${pack}`);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, migrationTemplate(pack, skillId, skill), "utf8");
    console.log(
      `Created migration scaffold for ${pack}.${skillId} at ${output}`,
    );
  } finally {
    module.dispose();
  }
} else if (command === "init") {
  const target = resolve(args[0] ?? "my-sgs-plugin");
  const advanced = args.includes("--advanced");
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, "plugin.ts"), pluginTemplate(advanced), {
    flag: "wx",
  });
  await writeFile(
    resolve(target, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        scripts: {
          build: "sgs-plugin build plugin.ts --out dist/plugin.sgs.json",
          watch: "sgs-plugin watch plugin.ts --out dist/plugin.sgs.json",
          test: "sgs-plugin test plugin.ts",
        },
        dependencies: { "@sgs/script-sdk": "^0.3.0" },
        devDependencies: { "@sgs/plugin-cli": "^0.3.0" },
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  console.log(`Created plugin project in ${target}`);
} else {
  console.log(
    "sgs-plugin init [directory] [--advanced]\nsgs-plugin build [entry] --out [file]\nsgs-plugin watch [entry] --out [file]\nsgs-plugin test [entry]\nsgs-plugin audit-noname [--upstream path] [--out report.json]\nsgs-plugin migrate-noname <pack> <skill> [--upstream path] [--out plugin.ts]",
  );
  if (command && command !== "help" && command !== "--help")
    process.exitCode = 1;
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function migrationTemplate(
  pack: string,
  skillId: string,
  skill: NonameSkillDefinition,
) {
  const source = collectFunctionSource(skill);
  const usages = [...analyzeNonameApiUsage(source)]
    .map(([api, calls]) => ({ ...compatibilityForApi(api), calls }))
    .sort(
      (left, right) =>
        right.calls - left.calls || left.api.localeCompare(right.api),
    );
  const trigger = JSON.stringify(skill.trigger ?? {}, null, 2);
  const apiLines = usages.length
    ? usages
        .map(
          (usage) =>
            `// - ${usage.api} x${usage.calls}: ${usage.compatibility}${usage.replacement ? ` -> ${usage.replacement}` : ""}`,
        )
        .join("\n")
    : "// - No direct host API calls were detected in top-level skill functions.";
  const safePack = JSON.stringify(pack);
  const safeSkill = JSON.stringify(skillId);
  return `import { defineGeneral, definePackage, definePlugin, defineRuntime } from "@sgs/script-sdk";

// Generated from pinned Noname ${pack}.${skillId}.
// Original trigger metadata: ${trigger.replace(/\n/g, " ")}
// Compatibility inventory:
${apiLines}
// TODO: translate unsupported calls and verify every branch against the upstream skill.
const runtime = defineRuntime<{ migratedCalls: number }>((input) => {
  if (input.hook !== "afterCommand") return { state: input.state };
  return {
    state: { migratedCalls: (input.state?.migratedCalls ?? 0) + 1 },
    effects: [],
    logs: ["TODO migration: " + ${safePack} + "." + ${safeSkill}],
  };
}, { permissions: ["game-state", "player-choice"] });

export default definePlugin({
  engineApi: "rules-ir/v2",
  capabilities: ["rules", "advanced-runtime"],
  content: definePackage({
    id: "migration.${pack}_${skillId}",
    name: "${skillId} migration",
    version: "0.1.0",
    generals: [defineGeneral({
      id: "migration.${pack}_${skillId}_hero",
      name: "TODO migrated hero",
      faction: "qun",
      hp: 4,
      skills: [],
    })],
    skills: [], cards: [], decks: [], modes: [], tests: [], runtime,
  }),
});
`;
}

function collectFunctionSource(
  value: unknown,
  seen = new WeakSet<object>(),
): string {
  if (typeof value === "function")
    return Function.prototype.toString.call(value);
  if (!value || typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  const source = Object.values(value as Record<string, unknown>)
    .map((item) => collectFunctionSource(item, seen))
    .join("\n");
  seen.delete(value);
  return source;
}

function compile(entry: string, output: string) {
  const runner = fileURLToPath(new URL("./runner.js", import.meta.url));
  const tsxImport = import.meta.resolve("tsx");
  const child = spawnSync(
    process.execPath,
    ["--experimental-vm-modules", "--import", tsxImport, runner, entry, output],
    { stdio: "inherit", timeout: 15_000 },
  );
  if (child.error) {
    console.error(child.error);
    return 1;
  }
  return child.status ?? 1;
}

function pluginTemplate(advanced = false) {
  if (advanced) return advancedPluginTemplate();
  return `import { defineGeneral, definePackage, definePlugin, defineSkill, effect } from "@sgs/script-sdk";

const skill = defineSkill({
  id: "example.preparation",
  name: "整备",
  event: "turnStart",
  effects: [effect.draw(1)],
});

export default definePlugin({
  engineApi: "rules-ir/v2",
  capabilities: ["rules"],
  content: definePackage({
    id: "example.my_plugin",
    name: "我的代码插件",
    version: "1.0.0",
    generals: [defineGeneral({ id: "example.hero", name: "自定义武将", faction: "qun", hp: 4, skills: [skill.id] })],
    skills: [skill], cards: [], decks: [], modes: [], tests: [],
  }),
});
`;
}

function advancedPluginTemplate() {
  return `import { defineGeneral, definePackage, definePlugin, defineRuntime } from "@sgs/script-sdk";

const runtime = defineRuntime<{ calls: number }>((input) => ({
  state: { calls: (input.state?.calls ?? 0) + 1 },
  effects: input.hook === "roomStart"
    ? [{ type: "addMark", target: "self", mark: "example_started", count: 1 }]
    : [],
  logs: [\`handled \${input.hook}\`],
}), {
  permissions: ["game-state"],
  timeoutMs: 500,
  memoryMb: 32,
});

export default definePlugin({
  engineApi: "rules-ir/v2",
  capabilities: ["rules", "advanced-runtime"],
  content: definePackage({
    id: "example.advanced_plugin",
    name: "我的高级代码插件",
    version: "1.0.0",
    generals: [defineGeneral({ id: "example.hero", name: "自定义武将", faction: "qun", hp: 4, skills: [] })],
    skills: [], cards: [], decks: [], modes: [], tests: [], runtime,
  }),
});
`;
}
