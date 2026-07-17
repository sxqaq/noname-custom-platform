import type {
  AssetRecordDto,
  ExtensionPackageDto,
  PublishedPackage,
} from "@sgs/protocol";
import { createHash } from "node:crypto";
import { packageHash, validatePackage } from "@sgs/content-schema";
import { AssetError, AssetStore } from "./asset-store.js";

export interface SgsPackArchive {
  format: "sgspack";
  formatVersion: 1;
  manifest: {
    id: string;
    version: string;
    contentHash: string;
    dependencies: Array<{ id: string; version: string }>;
    runtime?: {
      kind: "noname-compat";
      apiVersion: "noname-compat/v1";
      upstreamCommit: string;
      sourceHash: string;
      permissions: string[];
    };
  };
  content: ExtensionPackageDto;
  blobs: Array<{
    hash: string;
    mediaType: string;
    data: string;
    record?: AssetRecordDto;
  }>;
}

export async function createSgsPack(
  published: PublishedPackage,
  assets: AssetStore,
) {
  const records = new Map(
    (published.content.assets ?? []).map((asset) => [asset.hash, asset]),
  );
  const hashes = new Set<string>();
  for (const asset of published.content.assets ?? []) {
    hashes.add(asset.hash);
    if (asset.thumbnailHash) hashes.add(asset.thumbnailHash);
  }
  const blobs: SgsPackArchive["blobs"] = [];
  for (const hash of [...hashes].sort()) {
    const data = await assets.readBlob(hash);
    const extension = records.get(hash);
    blobs.push({
      hash,
      mediaType: "image/webp",
      data: data.toString("base64"),
      record: extension
        ? {
            hash: extension.hash,
            thumbnailHash: extension.thumbnailHash,
            mediaType: extension.mediaType,
            bytes: extension.bytes,
            width: extension.width,
            height: extension.height,
            originalName: extension.originalName,
            kind: extension.kind,
            author: extension.author,
            license: extension.license,
          }
        : undefined,
    });
  }
  const archive: SgsPackArchive = {
    format: "sgspack",
    formatVersion: 1,
    manifest: {
      id: published.content.id,
      version: published.content.version,
      contentHash: published.hash,
      dependencies: published.content.dependencies ?? [],
      runtime: published.content.runtime
        ? {
            kind: published.content.runtime.kind,
            apiVersion: published.content.runtime.apiVersion,
            upstreamCommit: published.content.runtime.upstreamCommit,
            sourceHash: createHash("sha256")
              .update(published.content.runtime.source)
              .digest("hex"),
            permissions: [...published.content.runtime.permissions].sort(),
          }
        : undefined,
    },
    content: published.content,
    blobs,
  };
  return Buffer.from(JSON.stringify(archive), "utf8");
}

export async function importSgsPack(input: Uint8Array, assets: AssetStore) {
  if (input.byteLength > 100 * 1024 * 1024)
    throw new SgsPackError("扩展包不能超过 100 MiB");
  let archive: SgsPackArchive;
  try {
    archive = JSON.parse(Buffer.from(input).toString("utf8")) as SgsPackArchive;
  } catch {
    throw new SgsPackError("扩展包不是有效 JSON");
  }
  if (archive.format !== "sgspack" || archive.formatVersion !== 1)
    throw new SgsPackError("不支持的扩展包格式");
  const validated = validatePackage(archive.content);
  if (!validated.ok) throw new SgsPackError(validated.errors.join("；"));
  const hash = packageHash(validated.value);
  if (
    archive.manifest.id !== validated.value.id ||
    archive.manifest.version !== validated.value.version ||
    archive.manifest.contentHash !== hash
  )
    throw new SgsPackError("扩展包清单与内容不匹配");
  const expectedRuntime = validated.value.runtime
    ? {
        kind: validated.value.runtime.kind,
        apiVersion: validated.value.runtime.apiVersion,
        upstreamCommit: validated.value.runtime.upstreamCommit,
        sourceHash: createHash("sha256")
          .update(validated.value.runtime.source)
          .digest("hex"),
        permissions: [...validated.value.runtime.permissions].sort(),
      }
    : undefined;
  if (JSON.stringify(archive.manifest.runtime) !== JSON.stringify(expectedRuntime))
    throw new SgsPackError("扩展包高级运行时清单与源码不匹配");
  const expected = new Set<string>();
  for (const asset of validated.value.assets ?? []) {
    expected.add(asset.hash);
    if (asset.thumbnailHash) expected.add(asset.thumbnailHash);
  }
  const supplied = new Map(archive.blobs.map((blob) => [blob.hash, blob]));
  for (const expectedHash of expected) {
    const blob = supplied.get(expectedHash);
    if (!blob) throw new SgsPackError(`扩展包缺少资源 ${expectedHash}`);
    try {
      await assets.importBlob(
        blob.hash,
        Buffer.from(blob.data, "base64"),
        blob.record,
      );
    } catch (error) {
      if (error instanceof AssetError) throw new SgsPackError(error.message);
      throw error;
    }
  }
  return validated.value;
}

export class SgsPackError extends Error {
  code = "BAD_SGSPACK";
}
