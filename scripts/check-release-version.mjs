import { readFile } from "node:fs/promises";

const expected = (process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "").replace(
  /^v/,
  "",
);
if (!/^\d+\.\d+\.\d+$/.test(expected))
  throw new Error("Expected a release version or v-prefixed tag");

const manifests = [
  "package.json",
  "apps/desktop/package.json",
  "packages/script-sdk/package.json",
  "packages/plugin-cli/package.json",
];
for (const path of manifests) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (manifest.version !== expected)
    throw new Error(`${path} is ${manifest.version}, expected ${expected}`);
}
console.log(`Release manifests consistently use ${expected}`);
