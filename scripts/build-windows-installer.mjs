import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "apps", "desktop");
const output = join(tmpdir(), "noname-custom-platform-builder");
const release = join(root, "release");
await rm(output, { recursive: true, force: true });
const builderCli = join(
  root,
  "node_modules",
  "electron-builder",
  "out",
  "cli",
  "cli.js",
);
const build = spawnSync(
  process.execPath,
  [
    builderCli,
    "--win",
    "nsis",
    "--x64",
    `--config.directories.output=${output}`,
  ],
  {
    cwd: desktop,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    stdio: "inherit",
  },
);
if (build.status !== 0) {
  const cause = build.error ? `: ${build.error.message}` : "";
  throw new Error(
    `electron-builder failed with exit code ${build.status}${cause}`,
  );
}

await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });
const artifacts = (await readdir(output)).filter(
  (name) => name.endsWith("Setup.exe") || name.endsWith("Setup.exe.blockmap"),
);
if (!artifacts.some((name) => name.endsWith("Setup.exe")))
  throw new Error("Windows installer artifact was not produced");
for (const name of artifacts)
  await copyFile(join(output, name), join(release, name));
for (const name of artifacts.filter((item) => item.endsWith(".exe"))) {
  const hash = createHash("sha256")
    .update(await readFile(join(release, name)))
    .digest("hex");
  console.log(`${name}\nSHA256 ${hash}`);
}
