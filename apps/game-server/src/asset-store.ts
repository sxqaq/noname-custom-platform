import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import sharp, { type Metadata } from "sharp";
import type { AssetKind, AssetRecordDto } from "@sgs/protocol";

const hashPattern = /^[a-f0-9]{64}$/;
const acceptedFormats = new Set(["jpeg", "png", "webp", "avif"]);

export class AssetStore {
  constructor(
    private readonly root: string,
    private readonly maxUploadBytes = 10 * 1024 * 1024,
  ) {}

  async storeImage(
    input: Uint8Array,
    metadata: {
      originalName?: string;
      kind?: AssetKind;
      author?: string;
      license?: string;
    } = {},
  ): Promise<AssetRecordDto> {
    if (!input.byteLength || input.byteLength > this.maxUploadBytes)
      throw new AssetError("图片大小必须在 1 字节到 10 MiB 之间");
    let sourceMetadata: Metadata;
    try {
      sourceMetadata = await sharp(input, {
        failOn: "warning",
        limitInputPixels: 40_000_000,
      }).metadata();
    } catch (error) {
      throw new AssetError("图片无法安全解码", { cause: error });
    }
    if (
      !sourceMetadata.format ||
      !acceptedFormats.has(sourceMetadata.format) ||
      !sourceMetadata.width ||
      !sourceMetadata.height ||
      sourceMetadata.width > 8_192 ||
      sourceMetadata.height > 8_192 ||
      (sourceMetadata.pages ?? 1) !== 1
    )
      throw new AssetError("仅支持单帧 JPEG、PNG、WebP、AVIF，最大 8192×8192");

    const normalized = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .webp({ quality: 90, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(normalized.data)
      .resize(320, 448, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    const hash = digest(normalized.data);
    const thumbnailHash = digest(thumbnail);
    await Promise.all([
      this.writeBlob(hash, normalized.data),
      this.writeBlob(thumbnailHash, thumbnail),
    ]);
    const record: AssetRecordDto = {
      hash,
      thumbnailHash,
      mediaType: "image/webp",
      bytes: normalized.data.byteLength,
      width: normalized.info.width,
      height: normalized.info.height,
      originalName: basename(metadata.originalName ?? "image").slice(0, 120),
      kind: metadata.kind ?? "portrait",
      author: metadata.author?.trim().slice(0, 120) || undefined,
      license: metadata.license?.trim().slice(0, 120) || undefined,
    };
    await this.writeRecord(record);
    return this.readRecord(hash);
  }

  async readBlob(hash: string) {
    this.validateHash(hash);
    return readFile(this.blobPath(hash));
  }

  async readRecord(hash: string): Promise<AssetRecordDto> {
    this.validateHash(hash);
    return JSON.parse(
      await readFile(this.recordPath(hash), "utf8"),
    ) as AssetRecordDto;
  }

  hasBlob(hash: string) {
    return hashPattern.test(hash) && existsSync(this.blobPath(hash));
  }

  async importBlob(hash: string, input: Uint8Array, record?: AssetRecordDto) {
    this.validateHash(hash);
    if (digest(input) !== hash) throw new AssetError("资源内容哈希不匹配");
    if (input.byteLength > this.maxUploadBytes)
      throw new AssetError("扩展资源超过 10 MiB");
    await this.writeBlob(hash, input);
    if (record) {
      if (record.hash !== hash) throw new AssetError("资源元数据哈希不匹配");
      await this.writeRecord(record);
    }
  }

  private async writeBlob(hash: string, data: Uint8Array) {
    const target = this.blobPath(hash);
    await mkdir(resolve(target, ".."), { recursive: true });
    try {
      await writeFile(target, data, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  private async writeRecord(record: AssetRecordDto) {
    const target = this.recordPath(record.hash);
    await mkdir(resolve(target, ".."), { recursive: true });
    try {
      await writeFile(target, JSON.stringify(record, null, 2), {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  private blobPath(hash: string) {
    return resolve(this.root, "blobs", hash.slice(0, 2), hash);
  }

  private recordPath(hash: string) {
    return resolve(this.root, "records", hash.slice(0, 2), `${hash}.json`);
  }

  private validateHash(hash: string) {
    if (!hashPattern.test(hash)) throw new AssetError("资源哈希不合法");
  }
}

function digest(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

export class AssetError extends Error {
  code = "BAD_ASSET";
}
