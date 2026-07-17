import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionPackageDto } from "@sgs/protocol";
import { AssetStore } from "../src/asset-store.js";
import { PackageRegistry } from "../src/package-registry.js";
import {
  createSgsPack,
  importSgsPack,
  type SgsPackArchive,
} from "../src/sgspack.js";

const content = (hash: string): ExtensionPackageDto => ({
  schemaVersion: 4,
  id: "test.portable_pack",
  name: "可移植扩展",
  version: "1.0.0",
  assets: [
    {
      id: "test.portrait",
      hash,
      mediaType: "image/webp",
      bytes: 4,
      originalName: "portrait.webp",
      kind: "portrait",
    },
  ],
  generals: [],
  skills: [],
  cards: [],
  decks: [],
  modes: [],
  tests: [],
});

test(".sgspack moves validated content and assets between LAN hosts", async () => {
  const root = await mkdtemp(join(tmpdir(), "sgspack-"));
  try {
    const bytes = Buffer.from("test");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const firstAssets = new AssetStore(join(root, "first"));
    await firstAssets.importBlob(hash, bytes, {
      hash,
      mediaType: "image/webp",
      bytes: bytes.length,
      originalName: "portrait.webp",
      kind: "portrait",
    });
    const firstRegistry = new PackageRegistry(undefined, (candidate) =>
      firstAssets.hasBlob(candidate),
    );
    const published = firstRegistry.publish(content(hash));
    const archive = await createSgsPack(published, firstAssets);

    const secondAssets = new AssetStore(join(root, "second"));
    const imported = await importSgsPack(archive, secondAssets);
    const secondRegistry = new PackageRegistry(undefined, (candidate) =>
      secondAssets.hasBlob(candidate),
    );
    assert.equal(secondRegistry.publish(imported).hash, published.hash);
    assert.deepEqual(await secondAssets.readBlob(hash), bytes);

    const tampered = JSON.parse(archive.toString("utf8")) as SgsPackArchive;
    tampered.blobs[0].data = Buffer.from("evil").toString("base64");
    await assert.rejects(
      importSgsPack(Buffer.from(JSON.stringify(tampered)), secondAssets),
      /哈希不匹配/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("package registry enforces exact dependency installation order", () => {
  const registry = new PackageRegistry();
  const dependent = content("a".repeat(64));
  dependent.assets = [];
  dependent.dependencies = [{ id: "test.base_pack", version: "1.0.0" }];
  assert.throws(() => registry.publish(dependent), /缺少依赖/);

  const base = content("b".repeat(64));
  base.id = "test.base_pack";
  base.name = "基础包";
  base.assets = [];
  registry.publish(base);
  registry.publish(dependent);
  assert.throws(() => registry.remove("test.base_pack", "1.0.0"), /仍被/);
  registry.remove(dependent.id, dependent.version);
  registry.remove(base.id, base.version);
  assert.equal(registry.list().length, 0);
});

test(".sgspack locks advanced runtime source and permissions", async () => {
  const assets = new AssetStore(join(tmpdir(), `sgspack-runtime-${Date.now()}`));
  const registry = new PackageRegistry();
  const value = content("c".repeat(64));
  value.assets = [];
  value.runtime = {
    kind: "noname-compat",
    apiVersion: "noname-compat/v1",
    upstreamCommit: "632d2d3c8da2893466a8c440a18861c9ed49813d",
    source: `() => ({ name: "advanced" })`,
    permissions: ["game-state", "player-choice"],
    limits: { timeoutMs: 500, memoryMb: 32 },
  };
  const archive = await createSgsPack(registry.publish(value), assets);
  const parsed = JSON.parse(archive.toString("utf8")) as SgsPackArchive;
  assert.match(parsed.manifest.runtime!.sourceHash, /^[a-f0-9]{64}$/);
  parsed.manifest.runtime!.permissions.push("mode-control");
  await assert.rejects(
    importSgsPack(Buffer.from(JSON.stringify(parsed)), assets),
    /运行时清单与源码不匹配/,
  );
});
