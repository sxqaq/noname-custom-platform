import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { HeadlessGame, chooseAiCommand } from "../packages/headless-engine/dist/index.js";

const games = Number(process.env.SIM_GAMES ?? 10_000);
const maxCommands = Number(process.env.SIM_MAX_COMMANDS ?? 2_000);
const winners = new Map();
let finished = 0;
let stalled = 0;
const digest = createHash("sha256");

for (let seed = 1; seed <= games; seed++) {
  const count = 2 + (seed % 7);
  const config = {
    seed,
    generalSelection: true,
    players: Array.from({ length: count }, (_, index) => ({
      id: `p${index}`,
      name: `P${index}`,
    })),
  };
  const game = HeadlessGame.create(config);
  const commands = [];
  while (game.state.status === "playing" && commands.length < maxCommands) {
    const command = chooseAiCommand(game);
    try {
      game.dispatch(command, { atomic: false });
    } catch (error) {
      throw new Error(
        `seed ${seed}, command ${commands.length}, pending ${JSON.stringify(game.state.pending)}, action ${JSON.stringify(command)}`,
        { cause: error },
      );
    }
    commands.push(command);
  }
  if (game.state.status === "finished") {
    finished++;
    winners.set(game.state.winner, (winners.get(game.state.winner) ?? 0) + 1);
  } else stalled++;
  if (seed <= 100) {
    const replayed = HeadlessGame.create(config);
    for (const command of commands) replayed.dispatch(command, { atomic: false });
    assert.equal(replayed.snapshot(), game.snapshot(), `seed ${seed} replay diverged`);
  }
  digest.update(game.snapshot());
}

assert.equal(stalled, 0, `${stalled} games exceeded ${maxCommands} commands`);
console.log(JSON.stringify({ games, finished, stalled, winners: Object.fromEntries(winners), digest: digest.digest("hex") }, null, 2));
