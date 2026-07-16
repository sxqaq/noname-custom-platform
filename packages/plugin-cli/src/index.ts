#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);

if (command === "build") {
  const entry = resolve(args[0] ?? "plugin.ts");
  const outputIndex = args.indexOf("--out");
  const output = resolve(
    outputIndex >= 0
      ? (args[outputIndex + 1] ?? "plugin.sgs.json")
      : "plugin.sgs.json",
  );
  const runner = fileURLToPath(new URL("./runner.js", import.meta.url));
  const tsxImport = import.meta.resolve("tsx");
  const child = spawnSync(
    process.execPath,
    ["--import", tsxImport, runner, entry, output],
    { stdio: "inherit", timeout: 15_000 },
  );
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} else if (command === "init") {
  const target = resolve(args[0] ?? "my-sgs-plugin");
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, "plugin.ts"), pluginTemplate(), {
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
        },
        dependencies: { "@sgs/script-sdk": "^0.2.0" },
        devDependencies: { "@sgs/plugin-cli": "^0.2.0" },
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  console.log(`Created plugin project in ${target}`);
} else {
  console.log(
    "sgs-plugin init [directory]\nsgs-plugin build [entry] --out [file]",
  );
  if (command && command !== "help" && command !== "--help")
    process.exitCode = 1;
}

function pluginTemplate() {
  return `import { defineGeneral, definePackage, definePlugin, defineSkill, effect } from "@sgs/script-sdk";

const skill = defineSkill({
  id: "example.preparation",
  name: "整备",
  event: "turnStart",
  effects: [effect.draw(1)],
});

export default definePlugin({
  engineApi: "rules-ir/v1",
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
