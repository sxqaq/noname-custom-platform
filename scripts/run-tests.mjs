import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const roots = process.argv.slice(2);

if (roots.length === 0) {
  roots.push("test");
}

async function collectTests(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTests(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

const tests = (
  await Promise.all(roots.map((root) => collectTests(resolve(root))))
)
  .flat()
  .sort();

if (tests.length === 0) {
  console.error(`No .test.ts files found below: ${roots.join(", ")}`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...tests],
  {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Test process terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
