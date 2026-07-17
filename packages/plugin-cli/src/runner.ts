import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import * as sdk from "@sgs/script-sdk";
import { compilePlugin, type PluginDefinition } from "@sgs/script-sdk";
import { validatePackage, type ExtensionPackageDto } from "@sgs/content-schema";
import { HeadlessGame } from "@sgs/headless-engine";
import { evaluateIsolatedMod } from "@sgs/noname-adapter";

const [entry, output] = process.argv.slice(2);
if (!entry || !output)
  throw new Error("Plugin entry and output path are required");
const definition = await loadSandboxedPlugin(entry);
if (!definition)
  throw new Error("Plugin entry must export a default plugin definition");
const compiled = compilePlugin(definition);
const validation = validatePackage(compiled.content);
if (!validation.ok) throw new Error(validation.errors.join("\n"));
compiled.content = validation.value;
if (compiled.content.runtime) await testAdvancedRuntime(compiled.content);
for (const item of compiled.content.tests.length
  ? compiled.content.tests
  : [
      {
        id: "determinism-smoke",
        name: "确定性冒烟测试",
        seed: 1,
        players: 2,
        expect: { noError: true },
      },
    ]) {
  const config = {
    seed: item.seed,
    players: Array.from({ length: item.players }, (_, index) => ({
      id: `p${index}`,
      name: `玩家${index + 1}`,
    })),
    packages: [compiled.content],
  };
  const first = HeadlessGame.create(config);
  const second = HeadlessGame.create(config);
  item.commands?.forEach((command) => {
    const firstPlayerId = first.state.players[command.playerIndex]?.id;
    const secondPlayerId = second.state.players[command.playerIndex]?.id;
    if (!firstPlayerId || !secondPlayerId)
      throw new Error(`Plugin test ${item.id} player index is invalid`);
    first.dispatch({ type: "endTurn", playerId: firstPlayerId });
    second.dispatch({ type: "endTurn", playerId: secondPlayerId });
  });
  if (first.snapshot() !== second.snapshot())
    throw new Error(`Plugin test ${item.id} is not deterministic`);
  if (
    item.expect.firstGeneral &&
    first.state.players[0].general.id !== item.expect.firstGeneral
  )
    throw new Error(`Plugin test ${item.id} first general mismatch`);
  if (
    item.expect.firstHandAtLeast !== undefined &&
    first.state.players[0].hand.length < item.expect.firstHandAtLeast
  )
    throw new Error(`Plugin test ${item.id} first hand is too small`);
}
if (output !== "-") {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(compiled, null, 2)}\n`, "utf8");
  console.log(
    `Compiled ${compiled.content.id}@${compiled.content.version} to ${output}`,
  );
} else
  console.log(
    `Validated ${compiled.content.id}@${compiled.content.version} with deterministic smoke tests`,
  );

async function loadSandboxedPlugin(path: string) {
  const source = await readFile(path, "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.getText(sourceFile).slice(1, -1) !==
        "@sgs/script-sdk"
    )
      throw new Error("Sandbox only allows imports from @sgs/script-sdk");
  }
  const transpiled = ts.transpileModule(source, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
  });
  const diagnostics = transpiled.diagnostics?.filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
  if (diagnostics?.length)
    throw new Error(
      diagnostics
        .map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n"))
        .join("\n"),
    );
  const context = vm.createContext({
    console: Object.freeze({ log() {}, warn() {}, error() {} }),
  });
  vm.runInContext(
    `Math.random = () => { throw new Error("Math.random is unavailable in deterministic plugins") };
     globalThis.fetch = undefined;
     globalThis.process = undefined;
     globalThis.require = undefined;
     globalThis.Date = class DeterministicDate { constructor() { throw new Error("Date is unavailable in deterministic plugins") } static now() { throw new Error("Date.now is unavailable in deterministic plugins") } };`,
    context,
    { timeout: 100 },
  );
  const sdkExports = Object.entries(sdk);
  const sdkModule = new vm.SyntheticModule(
    sdkExports.map(([name]) => name),
    function () {
      for (const [name, value] of sdkExports) this.setExport(name, value);
    },
    { context, identifier: "@sgs/script-sdk" },
  );
  const authorModule = new vm.SourceTextModule(transpiled.outputText, {
    context,
    identifier: path,
    importModuleDynamically() {
      throw new Error("Dynamic imports are unavailable in plugin sandbox");
    },
  });
  await authorModule.link(async (specifier) => {
    if (specifier !== "@sgs/script-sdk")
      throw new Error(`Sandbox import denied: ${specifier}`);
    return sdkModule;
  });
  await authorModule.evaluate({ timeout: 2_000 });
  return (authorModule.namespace as Record<string, unknown>).default as
    PluginDefinition | undefined;
}

async function testAdvancedRuntime(content: ExtensionPackageDto) {
  const runtime = content.runtime!;
  const input = {
    apiVersion: runtime.apiVersion,
    hook: "roomStart",
    hookIndex: 0,
    packageId: content.id,
    state: undefined,
    context: { events: [] },
    game: { status: "playing", sequence: 0, turn: 1, phase: "selectGeneral" },
  };
  const options = {
    source: runtime.source,
    input,
    seed: "plugin-build-determinism",
    timeoutMs: runtime.limits.timeoutMs,
    memoryMb: runtime.limits.memoryMb,
  };
  const first = await evaluateIsolatedMod(options);
  const second = await evaluateIsolatedMod(options);
  if (JSON.stringify(first) !== JSON.stringify(second))
    throw new Error(
      "Advanced runtime is not deterministic for identical input and seed",
    );
}
