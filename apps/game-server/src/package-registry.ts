import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ContentLock,
  ExtensionPackageDto,
  PublishedPackage,
} from "@sgs/protocol";
import { packageHash, validatePackage } from "@sgs/content-schema";
import { HeadlessGame, type ContentPackage } from "@sgs/headless-engine";

export class PackageRegistry {
  private versions = new Map<string, PublishedPackage>();
  constructor(
    private readonly storageFile?: string,
    private readonly assetExists?: (hash: string) => boolean,
  ) {
    if (storageFile) this.load();
  }
  publish(input: unknown) {
    const validated = validatePackage(input);
    if (validated.ok) {
      for (const asset of validated.value.assets ?? []) {
        if (this.assetExists && !this.assetExists(asset.hash))
          throw new PackageError(`扩展引用的资源不存在：${asset.id}`);
        if (
          this.assetExists &&
          asset.thumbnailHash &&
          !this.assetExists(asset.thumbnailHash)
        )
          throw new PackageError(`扩展引用的缩略图不存在：${asset.id}`);
      }
    }
    if (!validated.ok) throw new PackageError(validated.errors.join("；"));
    const testResult = this.test(validated.value);
    if (testResult.failed)
      throw new PackageError(
        `扩展自动测试失败：${testResult.results
          .filter((item) => !item.ok)
          .map((item) => item.message)
          .join("；")}`,
      );
    const hash = packageHash(validated.value);
    const key = this.key(validated.value.id, validated.value.version);
    const existing = this.versions.get(key);
    if (existing && existing.hash !== hash)
      throw new PackageError("已发布版本不可覆盖，请提升版本号");
    const published = existing ?? {
      content: validated.value,
      hash,
      shareId: hash.slice(0, 12),
      publishedAt: new Date().toISOString(),
    };
    this.versions.set(key, published);
    this.save();
    return structuredClone(published);
  }
  test(input: unknown) {
    const validated = validatePackage(input);
    if (!validated.ok)
      return {
        passed: 0,
        failed: validated.errors.length,
        results: validated.errors.map((message, index) => ({
          id: `schema-${index}`,
          ok: false,
          message,
        })),
      };
    const pack = validated.value;
    const cases = pack.tests.length
      ? pack.tests
      : [
          {
            id: "smoke",
            name: "默认冒烟测试",
            seed: 1,
            players: 2,
            expect: { noError: true },
          },
        ];
    const results = cases.map((item) => {
      try {
        const players = Array.from({ length: item.players }, (_, index) => ({
          id: `p${index}`,
          name: `玩家${index + 1}`,
        }));
        const game = HeadlessGame.create({
          seed: item.seed,
          players,
          packages: [pack as ContentPackage],
        });
        item.commands?.forEach((command) =>
          game.dispatch({
            type: "endTurn",
            playerId: game.state.players[command.playerIndex].id,
          }),
        );
        if (
          item.expect.firstGeneral &&
          game.state.players[0].general.id !== item.expect.firstGeneral
        )
          throw new Error(`首名武将不是 ${item.expect.firstGeneral}`);
        if (
          item.expect.firstHandAtLeast &&
          game.state.players[0].hand.length < item.expect.firstHandAtLeast
        )
          throw new Error(`首名玩家手牌少于 ${item.expect.firstHandAtLeast}`);
        return { id: item.id, ok: true, message: `${item.name}通过` };
      } catch (error) {
        return {
          id: item.id,
          ok: false,
          message: `${item.name}：${error instanceof Error ? error.message : "未知错误"}`,
        };
      }
    });
    return {
      passed: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    };
  }
  list() {
    return [...this.versions.values()].map((item) => structuredClone(item));
  }
  byShareId(shareId: string) {
    const found = [...this.versions.values()].find(
      (item) => item.shareId === shareId,
    );
    if (!found) throw new PackageError("分享扩展不存在");
    return structuredClone(found);
  }
  resolve(requested: Array<{ id: string; version: string }> = []) {
    const found = requested.map(({ id, version }) => {
      const item = this.versions.get(this.key(id, version));
      if (!item) throw new PackageError(`扩展 ${id}@${version} 不存在`);
      return item;
    });
    return {
      locks: found.map((item): ContentLock => ({
        packageId: item.content.id,
        name: item.content.name,
        version: item.content.version,
        hash: item.hash,
      })),
      packages: found.map((item) => structuredClone(item.content)),
    };
  }
  packagesFor(locks: ContentLock[]) {
    return locks.map((lock) => {
      const item = this.versions.get(this.key(lock.packageId, lock.version));
      if (!item || item.hash !== lock.hash)
        throw new PackageError(`扩展锁 ${lock.packageId}@${lock.version} 无效`);
      return structuredClone(item.content);
    });
  }
  private key(id: string, version: string) {
    return `${id}@${version}`;
  }
  private load() {
    try {
      const values = JSON.parse(
        readFileSync(this.storageFile!, "utf8"),
      ) as PublishedPackage[];
      values.forEach((item) =>
        this.versions.set(
          this.key(item.content.id, item.content.version),
          item,
        ),
      );
    } catch {}
  }
  private save() {
    if (!this.storageFile) return;
    mkdirSync(dirname(this.storageFile), { recursive: true });
    writeFileSync(
      this.storageFile,
      JSON.stringify(this.list(), null, 2),
      "utf8",
    );
  }
}
export class PackageError extends Error {
  code = "BAD_PACKAGE";
}
