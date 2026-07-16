import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface StoredNodeIdentity {
  version: 1;
  publicKey: string;
  privateKey: string;
}

export interface NodeIdentity {
  nodeId: string;
  fingerprint: string;
  publicKey: string;
}

export function loadOrCreateNodeIdentity(dataDir: string): NodeIdentity {
  const file = resolve(dataDir, "node-identity.json");
  let stored: StoredNodeIdentity;
  try {
    stored = JSON.parse(readFileSync(file, "utf8")) as StoredNodeIdentity;
    validateStoredIdentity(stored);
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("节点身份文件损坏，拒绝自动覆盖", { cause: error });
    stored = createStoredIdentity();
    mkdirSync(dirname(file), { recursive: true });
    try {
      writeFileSync(file, JSON.stringify(stored, null, 2), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    } catch {
      stored = JSON.parse(readFileSync(file, "utf8")) as StoredNodeIdentity;
      validateStoredIdentity(stored);
    }
  }
  return publicIdentity(stored);
}

function createStoredIdentity(): StoredNodeIdentity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { version: 1, publicKey, privateKey };
}

function validateStoredIdentity(value: StoredNodeIdentity) {
  if (
    value?.version !== 1 ||
    typeof value.publicKey !== "string" ||
    typeof value.privateKey !== "string"
  )
    throw new SyntaxError("节点身份格式无效");
  const derived = createPublicKey(createPrivateKey(value.privateKey))
    .export({ type: "spki", format: "pem" })
    .toString();
  if (normalizePem(derived) !== normalizePem(value.publicKey))
    throw new SyntaxError("节点公钥与私钥不匹配");
}

function publicIdentity(value: StoredNodeIdentity): NodeIdentity {
  const der = createPublicKey(value.publicKey).export({
    type: "spki",
    format: "der",
  });
  const nodeId = createHash("sha256").update(der).digest("hex");
  return {
    nodeId,
    fingerprint: nodeId
      .match(/.{1,4}/g)!
      .slice(0, 8)
      .join("-"),
    publicKey: value.publicKey,
  };
}

function normalizePem(value: string) {
  return value.replace(/\r/g, "").trim();
}
