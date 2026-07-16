import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { compilePlugin, type PluginDefinition } from "@sgs/script-sdk";
import { validatePackage } from "@sgs/content-schema";
import { HeadlessGame } from "@sgs/headless-engine";

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
