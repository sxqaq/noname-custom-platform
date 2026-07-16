import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { startHostRuntime } from "../src/index.js";

test("two isolated host runtimes expose independent node identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "noname-host-test-"));
  const first = startHostRuntime({
    port: 0,
    bindAddress: "127.0.0.1",
    dataDir: join(root, "first"),
    webDist: join(root, "missing-web"),
    nodeName: "甲节点",
  });
  const second = startHostRuntime({
    port: 0,
    bindAddress: "127.0.0.1",
    dataDir: join(root, "second"),
    webDist: join(root, "missing-web"),
    nodeName: "乙节点",
  });
  try {
    const [firstReady, secondReady] = await Promise.all([
      first.ready,
      second.ready,
    ]);
    assert.notEqual(firstReady.port, secondReady.port);
    const [firstInfo, secondInfo] = await Promise.all([
      fetch(`${firstReady.url}/api/host`).then((response) => response.json()),
      fetch(`${secondReady.url}/api/host`).then((response) => response.json()),
    ]);
    assert.equal(firstInfo.nodeName, "甲节点");
    assert.equal(secondInfo.nodeName, "乙节点");
    assert.equal(firstInfo.authority, "room-host");
    assert.ok(firstInfo.capabilities.includes("same-origin-web"));
    const tokenResponse = await fetch(`${firstReady.url}/api/admin/token`);
    assert.equal(tokenResponse.status, 200);
    const { adminToken } = (await tokenResponse.json()) as {
      adminToken: string;
    };
    const image = await sharp({
      create: {
        width: 32,
        height: 48,
        channels: 3,
        background: "#8f2d2d",
      },
    })
      .png()
      .toBuffer();
    const denied = await fetch(`${firstReady.url}/api/assets/images`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: image,
    });
    assert.equal(denied.status, 403);
    const uploadedResponse = await fetch(
      `${firstReady.url}/api/assets/images`,
      {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          "X-Admin-Token": adminToken,
          "X-File-Name": encodeURIComponent("测试立绘.png"),
        },
        body: image,
      },
    );
    assert.equal(uploadedResponse.status, 201);
    const uploaded = (await uploadedResponse.json()) as {
      hash: string;
      thumbnailHash: string;
    };
    const downloaded = await fetch(
      `${firstReady.url}/api/assets/${uploaded.hash}`,
    );
    assert.equal(downloaded.status, 200);
    assert.match(downloaded.headers.get("cache-control") ?? "", /immutable/);
    assert.equal(downloaded.headers.get("content-type"), "image/webp");
    const thumbnail = await fetch(
      `${firstReady.url}/api/assets/${uploaded.thumbnailHash}`,
    );
    assert.equal(thumbnail.status, 200);
    assert.equal(thumbnail.headers.get("content-type"), "image/webp");
  } finally {
    await Promise.all([first.close(), second.close()]);
    await rm(root, { recursive: true, force: true });
  }
});
