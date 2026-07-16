import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { compilePlugin, type PluginDefinition } from "@sgs/script-sdk";
import { validatePackage } from "@sgs/content-schema";

const [entry, output] = process.argv.slice(2);
if (!entry || !output)
  throw new Error("Plugin entry and output path are required");
const module = (await import(
  `${pathToFileURL(entry).href}?build=${Date.now()}`
)) as {
  default?: PluginDefinition;
};
if (!module.default)
  throw new Error("Plugin entry must export a default plugin definition");
const compiled = compilePlugin(module.default);
const validation = validatePackage(compiled.content);
if (!validation.ok) throw new Error(validation.errors.join("\n"));
compiled.content = validation.value;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(compiled, null, 2)}\n`, "utf8");
console.log(
  `Compiled ${compiled.content.id}@${compiled.content.version} to ${output}`,
);
