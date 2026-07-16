import Bonjour from "bonjour-service";

const serviceType = "noname-sgs";

export interface LanNode {
  nodeId: string;
  fingerprint: string;
  name: string;
  host: string;
  port: number;
  addresses: string[];
  urls: string[];
  protocolVersion: number;
}

interface DiscoveredService {
  name: string;
  host: string;
  port: number;
  addresses?: string[];
  txt?: Record<string, unknown>;
}

export interface LanAdvertisement {
  close(): Promise<void>;
}

export function advertiseLanNode(input: {
  nodeId: string;
  fingerprint: string;
  name: string;
  port: number;
  onError?: (error: unknown) => void;
}): LanAdvertisement {
  const bonjour = new Bonjour({}, input.onError ?? (() => undefined));
  const service = bonjour.publish({
    name: input.name,
    type: serviceType,
    port: input.port,
    txt: {
      nodeId: input.nodeId,
      fingerprint: input.fingerprint,
      protocolVersion: "1",
      path: "/",
    },
  });
  return {
    close: () =>
      new Promise<void>((resolve) => {
        service.stop(() => bonjour.destroy(() => resolve()));
      }),
  };
}

export async function discoverLanNodes(timeoutMs = 900): Promise<LanNode[]> {
  const boundedTimeout = Math.max(100, Math.min(3_000, timeoutMs));
  const found = new Map<string, LanNode>();
  const bonjour = new Bonjour({}, () => undefined);
  const browser = bonjour.find({ type: serviceType }, (service) => {
    const node = serviceToLanNode(service);
    if (node) found.set(node.nodeId, node);
  });
  await new Promise((resolve) => setTimeout(resolve, boundedTimeout));
  browser.stop();
  await new Promise<void>((resolve) => bonjour.destroy(() => resolve()));
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function serviceToLanNode(
  service: DiscoveredService,
): LanNode | undefined {
  const nodeId = textValue(service.txt?.nodeId);
  const fingerprint = textValue(service.txt?.fingerprint);
  const protocolVersion = Number(textValue(service.txt?.protocolVersion));
  if (
    !/^[a-f0-9]{64}$/.test(nodeId) ||
    !fingerprint ||
    protocolVersion !== 1 ||
    !Number.isInteger(service.port) ||
    service.port < 1 ||
    service.port > 65_535
  )
    return undefined;
  const addresses = [...new Set(service.addresses ?? [])];
  const urlHosts = addresses.length ? addresses : [service.host];
  return {
    nodeId,
    fingerprint,
    name: service.name,
    host: service.host,
    port: service.port,
    addresses,
    urls: urlHosts.map(
      (address) =>
        `http://${address.includes(":") ? `[${address}]` : address}:${service.port}`,
    ),
    protocolVersion,
  };
}

function textValue(value: unknown) {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return typeof value === "string" ? value : "";
}
