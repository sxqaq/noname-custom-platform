import assert from "node:assert/strict";
import test from "node:test";
import { isAbsolute } from "node:path";
import { parseHostArgs, resolveHostConfig } from "../src/host-config.js";

test("host config defaults to a private local listener", () => {
  const config = resolveHostConfig({}, {});
  assert.equal(config.bindAddress, "127.0.0.1");
  assert.equal(config.port, 3001);
  assert.equal(config.nodeName, "本地主机");
  assert.equal(config.lanDiscovery, false);
  assert.equal(isAbsolute(config.dataDir), true);
  assert.equal(isAbsolute(config.webDist), true);
});

test("host config accepts installer and LAN overrides", () => {
  const config = resolveHostConfig(
    { port: 0, dataDir: ".test-node", nodeName: "甲的节点" },
    { HOST_BIND: "0.0.0.0" },
  );
  assert.equal(config.bindAddress, "0.0.0.0");
  assert.equal(config.port, 0);
  assert.equal(config.nodeName, "甲的节点");
});

test("host config rejects unsafe port values", () => {
  assert.throws(() => resolveHostConfig({}, { PORT: "70000" }));
  assert.throws(() => resolveHostConfig({}, { PORT: "not-a-port" }));
});

test("host CLI supports LAN and installer paths without platform-specific env syntax", () => {
  assert.deepEqual(
    parseHostArgs([
      "--lan",
      "--port=4567",
      "--data-dir",
      "user-data",
      "--name",
      "朋友房",
    ]),
    {
      bindAddress: "0.0.0.0",
      lanDiscovery: true,
      port: 4567,
      dataDir: "user-data",
      nodeName: "朋友房",
    },
  );
  assert.throws(() => parseHostArgs(["--unknown"]));
});
