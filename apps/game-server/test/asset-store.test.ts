import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { AssetStore } from "../src/asset-store.js";

test("image assets are normalized, thumbnailed and content-addressed", async () => {
  const root = await mkdtemp(join(tmpdir(), "noname-assets-"));
  try {
    const store = new AssetStore(root);
    const image = await sharp({
      create: {
        width: 640,
        height: 900,
        channels: 4,
        background: "#8f2d2d",
      },
    })
      .png()
      .toBuffer();
    const first = await store.storeImage(image, {
      originalName: "../hero.png",
      kind: "portrait",
      author: "测试作者",
      license: "CC-BY-4.0",
    });
    const duplicate = await store.storeImage(image, {
      originalName: "hero.png",
    });
    assert.equal(duplicate.hash, first.hash);
    assert.equal(first.originalName, "hero.png");
    assert.equal(first.mediaType, "image/webp");
    assert.ok(first.thumbnailHash);
    assert.equal((await store.readBlob(first.hash)).byteLength, first.bytes);
    assert.deepEqual(await store.readRecord(first.hash), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-images and oversized uploads are rejected before persistence", async () => {
  const root = await mkdtemp(join(tmpdir(), "noname-assets-bad-"));
  try {
    const store = new AssetStore(root, 16);
    await assert.rejects(() => store.storeImage(Buffer.from("not an image")));
    await assert.rejects(() => store.storeImage(Buffer.alloc(17)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
