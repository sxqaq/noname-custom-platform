import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadOrCreateNodeIdentity } from "../src/node-identity.js";

test("node identity is stable per data directory and unique across nodes", async () => {
  const root = await mkdtemp(join(tmpdir(), "noname-node-id-"));
  try {
    const first = loadOrCreateNodeIdentity(join(root, "first"));
    const restored = loadOrCreateNodeIdentity(join(root, "first"));
    const second = loadOrCreateNodeIdentity(join(root, "second"));
    assert.deepEqual(restored, first);
    assert.notEqual(second.nodeId, first.nodeId);
    assert.match(first.nodeId, /^[a-f0-9]{64}$/);
    assert.match(first.fingerprint, /^[a-f0-9]{4}(?:-[a-f0-9]{4}){7}$/);
    const disk = await readFile(
      join(root, "first", "node-identity.json"),
      "utf8",
    );
    assert.ok(disk.includes("PRIVATE KEY"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("corrupted node identity is never silently replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "noname-node-corrupt-"));
  try {
    await writeFile(join(root, "node-identity.json"), "not-json", "utf8");
    assert.throws(() => loadOrCreateNodeIdentity(root), /损坏/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
