import assert from "node:assert/strict";
import test from "node:test";
import { serviceToLanNode } from "../src/lan-discovery.js";

test("mDNS records become fingerprinted join candidates", () => {
  const nodeId = "a".repeat(64);
  const node = serviceToLanNode({
    name: "甲的朋友房",
    host: "jia.local",
    port: 3001,
    addresses: ["192.168.1.20", "fe80::20"],
    txt: {
      nodeId: Buffer.from(nodeId),
      fingerprint: "aaaa-aaaa-aaaa-aaaa-aaaa-aaaa-aaaa-aaaa",
      protocolVersion: "1",
    },
  });
  assert.equal(node?.nodeId, nodeId);
  assert.deepEqual(node?.urls, [
    "http://192.168.1.20:3001",
    "http://[fe80::20]:3001",
  ]);
});

test("invalid or incompatible mDNS records are ignored", () => {
  assert.equal(
    serviceToLanNode({
      name: "bad",
      host: "bad.local",
      port: 3001,
      txt: { nodeId: "bad", protocolVersion: "2" },
    }),
    undefined,
  );
});
