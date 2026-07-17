import { useEffect, useMemo, useRef, useState } from "react";
import { HeadlessGame } from "@sgs/headless-engine";
import type {
  AssetRecordDto,
  EffectDto,
  ExtensionPackageDto,
  PublishedPackage,
} from "@sgs/protocol";
import {
  cloneGeneral,
  cloneSkill,
  createCard,
  createGeneral,
  createProject,
  createSkill,
  defaultCardStyle,
  migrateProject,
} from "./workshop-model";

const draftKey = "sgs.workshop.draft.v4";
const loadDraft = () => {
  try {
    const draft = localStorage.getItem(draftKey);
    return draft
      ? migrateProject(JSON.parse(draft) as ExtensionPackageDto)
      : createProject();
  } catch {
    return createProject();
  }
};
const createEffect = (type: EffectDto["type"]): EffectDto => {
  if (type === "if")
    return {
      type,
      target: "self",
      condition: { op: "predicate", predicate: "wounded", subject: "self" },
      then: [{ type: "draw", target: "self", count: 1 }],
      else: [],
    };
  if (type === "repeat")
    return {
      type,
      target: "self",
      times: 2,
      body: [{ type: "draw", target: "self", count: 1 }],
    };
  if (type === "setState" || type === "changeState")
    return { type, target: "self", stateKey: "state", value: 1 };
  if (type === "changeMaxHp") return { type, target: "self", value: -1 };
  if (type === "grantSkill")
    return {
      type,
      target: "self",
      skillId: "custom_skill",
      duration: "turn",
    };
  if (type === "removeSkill")
    return { type, target: "self", skillId: "custom_skill" };
  if (type === "skipPhase") return { type, target: "self", phase: "play" };
  if (type === "moveCards")
    return {
      type,
      target: "selected",
      count: 1,
      fromZone: "own",
      to: "self",
      toZone: "hand",
    };
  if (type === "judge")
    return {
      type,
      target: "self",
      successSuits: ["heart", "diamond"],
      success: [{ type: "draw", target: "self", count: 1 }],
      failure: [],
    };
  if (type === "addMark")
    return { type, target: "self", mark: "mark", count: 1 };
  if (type === "damage" || type === "recover" || type === "loseHp")
    return { type, target: "self", amount: 1 };
  return { type, target: "self", count: 1 };
};
type TestResult = {
  passed: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; message: string }>;
};
export function ExtensionEditor({
  packages,
  publish,
  runTests,
  testResult,
  uploadImage,
  installPack,
  uninstallPackage,
}: {
  packages: PublishedPackage[];
  publish: (value: ExtensionPackageDto) => void;
  runTests: (value: ExtensionPackageDto) => void;
  testResult?: TestResult;
  uploadImage: (
    file: File,
    kind: "portrait" | "card-face",
  ) => Promise<AssetRecordDto>;
  installPack: (file: File) => Promise<void>;
  uninstallPackage: (packageId: string, version: string) => Promise<void>;
}) {
  const [value, setValueState] = useState(loadDraft);
  const [undoStack, setUndoStack] = useState<ExtensionPackageDto[]>([]);
  const [redoStack, setRedoStack] = useState<ExtensionPackageDto[]>([]);
  const [section, setSection] = useState<
    "general" | "nodes" | "cards" | "mode" | "json"
  >("general");
  const [preview, setPreview] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [generalId, setGeneralId] = useState(value.generals[0]?.id ?? "");
  const [skillId, setSkillId] = useState(value.skills[0]?.id ?? "");
  const [cardId, setCardId] = useState(value.cards[0]?.id ?? "");
  const general =
    value.generals.find((item) => item.id === generalId) ?? value.generals[0];
  const skill =
    value.skills.find((item) => item.id === skillId) ?? value.skills[0];
  const nodes = skill.graph?.nodes ?? skill.effects;
  const graphIssues = skill.graph
    ? (() => {
        const ids = new Set(nodes.map((node) => node.id).filter(Boolean));
        const issues: string[] = [];
        if (!ids.has(skill.graph!.entry)) issues.push("入口节点不存在");
        if (ids.size !== nodes.length) issues.push("节点 ID 缺失或重复");
        if (nodes.some((node) => node.next && !ids.has(node.next)))
          issues.push("存在断开的连线");
        const visited = new Set<string>();
        let id: string | undefined = skill.graph.entry;
        while (id) {
          if (visited.has(id)) {
            issues.push("存在循环连线");
            break;
          }
          visited.add(id);
          id = nodes.find((node) => node.id === id)?.next;
        }
        if (visited.size !== nodes.length) issues.push("存在不可达节点");
        return issues;
      })()
    : [];
  const card = value.cards.find((item) => item.id === cardId) ?? value.cards[0];
  const deck = value.decks[0];
  const mode = value.modes[0];
  const json = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const setValue = (
    next:
      | ExtensionPackageDto
      | ((current: ExtensionPackageDto) => ExtensionPackageDto),
  ) =>
    setValueState((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      setUndoStack((items) => [...items.slice(-99), current]);
      setRedoStack([]);
      return resolved;
    });
  useEffect(() => {
    const timer = window.setTimeout(
      () => localStorage.setItem(draftKey, JSON.stringify(value)),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [value]);
  const undo = () =>
    setUndoStack((items) => {
      const previous = items.at(-1);
      if (!previous) return items;
      setValueState((current) => {
        setRedoStack((redo) => [current, ...redo].slice(0, 100));
        return previous;
      });
      return items.slice(0, -1);
    });
  const redo = () =>
    setRedoStack((items) => {
      const next = items[0];
      if (!next) return items;
      setValueState((current) => {
        setUndoStack((undoItems) => [...undoItems.slice(-99), current]);
        return next;
      });
      return items.slice(1);
    });
  const update = <K extends keyof ExtensionPackageDto>(
    key: K,
    items: ExtensionPackageDto[K],
  ) => setValue((current) => ({ ...current, [key]: items }));
  const patchGeneral = (next: Partial<typeof general>) => {
    if (next.id) setGeneralId(next.id);
    setValue((current) => ({
      ...current,
      generals: current.generals.map((item) =>
        item.id === general.id ? { ...item, ...next } : item,
      ),
    }));
  };
  const patchSkill = (next: Partial<typeof skill>) => {
    if (next.id) setSkillId(next.id);
    setValue((current) => ({
      ...current,
      skills: current.skills.map((item) =>
        item.id === skill.id ? { ...item, ...next } : item,
      ),
      generals: next.id
        ? current.generals.map((item) => ({
            ...item,
            skills: item.skills.map((id) => (id === skill.id ? next.id! : id)),
          }))
        : current.generals,
    }));
  };
  const patchCard = (next: Partial<typeof card>) => {
    if (next.id) setCardId(next.id);
    setValue((current) => ({
      ...current,
      cards: current.cards.map((item) =>
        item.id === card.id ? { ...item, ...next } : item,
      ),
      decks: next.id
        ? current.decks.map((item) => ({
            ...item,
            cards: item.cards.map((entry) =>
              entry.cardId === card.id ? { ...entry, cardId: next.id! } : entry,
            ),
          }))
        : current.decks,
    }));
  };
  const patchMode = (next: Partial<typeof mode>) =>
    update(
      "modes",
      value.modes.map((item) =>
        item.id === mode.id ? { ...item, ...next } : item,
      ),
    );
  const exportFile = () => {
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${value.id}-${value.version}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".sgspack")) {
      await installPack(file);
      setPreview("扩展包已安装到本地主机");
      return;
    }
    const document = JSON.parse(await file.text()) as
      | ExtensionPackageDto
      | { format: "sgs-compiled-plugin"; content: ExtensionPackageDto };
    const imported = "content" in document ? document.content : document;
    const migrated = migrateProject(imported);
    setValue(migrated);
    setGeneralId(migrated.generals[0]?.id ?? "");
    setSkillId(migrated.skills[0]?.id ?? "");
    setCardId(migrated.cards[0]?.id ?? "");
  };
  const uploadCardFace = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const record = await uploadImage(file, "card-face");
      const assetId = `${card.id}.face`;
      update("assets", [
        ...(value.assets ?? []).filter((item) => item.id !== assetId),
        { id: assetId, ...record },
      ]);
      patchCard({ faceAssetId: assetId });
      setPreview("卡面图片已安全处理并加入当前扩展。");
    } catch (error) {
      setPreview(error instanceof Error ? error.message : "卡面上传失败");
    } finally {
      setUploading(false);
    }
  };
  const uploadPortrait = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const record = await uploadImage(file, "portrait");
      const assetId = `${general.id}.portrait`;
      update("assets", [
        ...(value.assets ?? []).filter((item) => item.id !== assetId),
        { id: assetId, ...record },
      ]);
      patchGeneral({ portraitAssetId: assetId });
      setPreview(
        "武将立绘已安全处理并保存到当前主机。发布扩展后，房间玩家会按哈希获取它。",
      );
    } catch (error) {
      setPreview(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };
  const portrait = value.assets?.find(
    (item) => item.id === general.portraitAssetId,
  );
  const cardFace = value.assets?.find((item) => item.id === card.faceAssetId);
  const exportGeneralCard = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 1050;
    const context = canvas.getContext("2d");
    if (!context) return;
    const style = general.cardStyle ?? defaultCardStyle();
    context.fillStyle = style.template === "ink" ? "#d8d2c4" : "#1f2937";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (portrait) {
      const image = new Image();
      image.src = `/api/assets/${portrait.hash}`;
      await image.decode();
      const cover = Math.max(
        canvas.width / image.width,
        canvas.height / image.height,
      );
      const scale = cover * style.portraitScale;
      const width = image.width * scale;
      const height = image.height * scale;
      const x = (canvas.width - width) * (style.portraitX / 100);
      const y = (canvas.height - height) * (style.portraitY / 100);
      context.drawImage(image, x, y, width, height);
    }
    context.strokeStyle = style.accentColor;
    context.lineWidth = style.template === "minimal" ? 12 : 28;
    context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
    context.fillStyle = style.accentColor;
    context.fillRect(36, 38, 280, 190);
    context.fillStyle = style.textColor;
    context.font = "36px system-ui";
    context.fillText(general.title ?? "", 58, 90, 230);
    context.font = "bold 70px system-ui";
    context.fillText(general.name, 58, 166, 230);
    context.font = "34px system-ui";
    context.fillText(
      `势力 ${general.faction}  ${general.hp} 体力`,
      58,
      210,
      240,
    );
    if (style.showSkillText) {
      const skillNames = general.skills
        .map((id) => value.skills.find((item) => item.id === id)?.name)
        .filter(Boolean)
        .join(" · ");
      context.fillStyle = "#111c";
      context.fillRect(36, 900, canvas.width - 72, 110);
      context.fillStyle = style.textColor;
      context.font = "32px system-ui";
      context.fillText(skillNames, 58, 965, canvas.width - 116);
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${general.id}-card.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const localTest = () => {
    try {
      const game = HeadlessGame.create({
        seed: 42,
        players: [
          { id: "me", name: "测试者" },
          { id: "bot", name: "陪练" },
        ],
        packages: [value],
        modeId: value.modes[0]?.id,
      });
      setPreview(
        `通过：${game.state.players[0].general.name}，${game.state.deck.length} 张牌仍在牌堆`,
      );
    } catch (error) {
      setPreview(
        `失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  };
  const setNodes = (nextNodes: EffectDto[]) =>
    patchSkill({
      effects: nextNodes,
      graph: skill.graph ? { ...skill.graph, nodes: nextNodes } : undefined,
    });
  const addNode = () =>
    setNodes([
      ...nodes,
      {
        id: `n${nodes.length + 1}`,
        type: "draw",
        target: "self",
        count: 1,
      },
    ]);
  const patchNode = (index: number, next: Partial<EffectDto>) =>
    setNodes(
      nodes.map((item, i) => (i === index ? { ...item, ...next } : item)),
    );
  const replaceNode = (index: number, next: EffectDto) =>
    setNodes(
      nodes.map((item, i) =>
        i === index ? { ...next, id: item.id, next: item.next } : item,
      ),
    );
  const addGeneral = () => {
    const created = createGeneral(
      value.generals.map((item) => item.id),
      value.skills[0]?.id,
    );
    update("generals", [...value.generals, created]);
    setGeneralId(created.id);
  };
  const duplicateGeneral = () => {
    const created = cloneGeneral(
      general,
      value.generals.map((item) => item.id),
    );
    update("generals", [...value.generals, created]);
    setGeneralId(created.id);
  };
  const removeGeneral = () => {
    if (value.generals.length === 1) return;
    const remaining = value.generals.filter((item) => item.id !== general.id);
    update("generals", remaining);
    setGeneralId(remaining[0].id);
  };
  const addSkill = () => {
    const created = createSkill(value.skills.map((item) => item.id));
    setValue((current) => ({
      ...current,
      skills: [...current.skills, created],
      generals: current.generals.map((item) =>
        item.id === general.id
          ? { ...item, skills: [...item.skills, created.id] }
          : item,
      ),
    }));
    setSkillId(created.id);
  };
  const duplicateSkill = () => {
    const created = cloneSkill(
      skill,
      value.skills.map((item) => item.id),
    );
    setValue((current) => ({
      ...current,
      skills: [...current.skills, created],
      generals: current.generals.map((item) =>
        item.id === general.id
          ? { ...item, skills: [...new Set([...item.skills, created.id])] }
          : item,
      ),
    }));
    setSkillId(created.id);
  };
  const removeSkill = () => {
    if (value.skills.length === 1) return;
    const remaining = value.skills.filter((item) => item.id !== skill.id);
    setValue((current) => ({
      ...current,
      skills: remaining,
      generals: current.generals.map((item) => ({
        ...item,
        skills: item.skills.filter((id) => id !== skill.id),
      })),
    }));
    setSkillId(remaining[0].id);
  };
  const addCard = () => {
    const created = createCard(value.cards.map((item) => item.id));
    update("cards", [...value.cards, created]);
    setCardId(created.id);
  };
  const removeCard = () => {
    if (value.cards.length === 1) return;
    const remaining = value.cards.filter((item) => item.id !== card.id);
    setValue((current) => ({
      ...current,
      cards: remaining,
      decks: current.decks.map((item) => ({
        ...item,
        cards: item.cards.filter((entry) => entry.cardId !== card.id),
      })),
    }));
    setCardId(remaining[0].id);
  };
  return (
    <section className="panel workshop">
      <div className="workshopHeader">
        <div>
          <h2>创作工坊</h2>
          <p className="muted">
            节点图最终保存为可验证 DSL，服务端不运行作者代码。
          </p>
        </div>
        <div className="actions">
          <button
            className="secondary"
            disabled={!undoStack.length}
            onClick={undo}
          >
            撤销
          </button>
          <button
            className="secondary"
            disabled={!redoStack.length}
            onClick={redo}
          >
            重做
          </button>
          <button onClick={localTest}>本地预览</button>
          <button onClick={() => runTests(value)}>自动测试</button>
          <button onClick={() => publish(value)}>发布版本</button>
          <button className="secondary" onClick={exportFile}>
            导出
          </button>
          <button className="secondary" onClick={() => input.current?.click()}>
            导入
          </button>
          <input
            ref={input}
            hidden
            type="file"
            accept="application/json,.json,.sgspack,application/x-sgspack"
            onChange={(event) => importFile(event.target.files?.[0])}
          />
        </div>
      </div>
      <small className="autosave">草稿已自动保存在本机浏览器</small>
      <nav className="subnav">
        {(["general", "nodes", "cards", "mode", "json"] as const).map(
          (item) => (
            <button
              key={item}
              className={section === item ? "active" : "secondary"}
              onClick={() => setSection(item)}
            >
              {
                {
                  general: "武将",
                  nodes: "节点技能",
                  cards: "卡牌与牌堆",
                  mode: "模式",
                  json: "JSON",
                }[item]
              }
            </button>
          ),
        )}
      </nav>
      {preview && <div className="notice">{preview}</div>}
      {testResult && (
        <div className={testResult.failed ? "error" : "notice"}>
          自动测试：{testResult.passed} 通过，{testResult.failed} 失败。
          {testResult.results.map((item) => item.message).join("；")}
        </div>
      )}
      {section === "general" && (
        <div>
          <div className="projectMeta formGrid">
            <label>
              扩展 ID
              <input
                value={value.id}
                onChange={(e) => setValue({ ...value, id: e.target.value })}
              />
            </label>
            <label>
              扩展名称
              <input
                value={value.name}
                onChange={(e) => setValue({ ...value, name: e.target.value })}
              />
            </label>
            <label>
              版本
              <input
                value={value.version}
                onChange={(e) =>
                  setValue({ ...value, version: e.target.value })
                }
              />
            </label>
            <label>
              作者
              <input
                value={value.author ?? ""}
                onChange={(e) => setValue({ ...value, author: e.target.value })}
              />
            </label>
            <label>
              素材许可证
              <input
                value={value.license ?? ""}
                onChange={(e) =>
                  setValue({ ...value, license: e.target.value })
                }
              />
            </label>
            <label className="wideField">
              扩展说明
              <textarea
                value={value.description ?? ""}
                onChange={(e) =>
                  setValue({ ...value, description: e.target.value })
                }
              />
            </label>
          </div>
          <div className="entityEditor">
            <aside className="entityList">
              <div className="entityListHeader">
                <b>武将（{value.generals.length}）</b>
                <button onClick={addGeneral}>新增</button>
              </div>
              {value.generals.map((item) => (
                <button
                  key={item.id}
                  className={item.id === general.id ? "active" : "secondary"}
                  onClick={() => setGeneralId(item.id)}
                >
                  {item.name}
                  <small>{item.id}</small>
                </button>
              ))}
              <button className="secondary" onClick={duplicateGeneral}>
                复制当前武将
              </button>
              <button
                className="danger"
                disabled={value.generals.length === 1}
                onClick={removeGeneral}
              >
                删除当前武将
              </button>
            </aside>
            <div className="entityContent">
              <div className="formGrid">
                <label>
                  武将 ID
                  <input
                    value={general.id}
                    onChange={(e) => patchGeneral({ id: e.target.value })}
                  />
                </label>
                <label>
                  武将名称
                  <input
                    value={general.name}
                    onChange={(e) => patchGeneral({ name: e.target.value })}
                  />
                </label>
                <label>
                  称号
                  <input
                    value={general.title ?? ""}
                    onChange={(e) => patchGeneral({ title: e.target.value })}
                  />
                </label>
                <label>
                  势力
                  <select
                    value={general.faction}
                    onChange={(e) => patchGeneral({ faction: e.target.value })}
                  >
                    <option value="wei">魏</option>
                    <option value="shu">蜀</option>
                    <option value="wu">吴</option>
                    <option value="qun">群</option>
                  </select>
                </label>
                <label>
                  体力
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={general.hp}
                    onChange={(e) =>
                      patchGeneral({ hp: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  性别
                  <select
                    value={general.gender ?? "male"}
                    onChange={(e) =>
                      patchGeneral({
                        gender: e.target.value as "male" | "female",
                      })
                    }
                  >
                    <option value="male">男性</option>
                    <option value="female">女性</option>
                  </select>
                </label>
                <label>
                  武将立绘
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    disabled={uploading}
                    onChange={(event) =>
                      void uploadPortrait(event.target.files?.[0])
                    }
                  />
                  <small>
                    {uploading
                      ? "正在处理图片…"
                      : "最大 10 MiB；上传后统一转为安全 WebP"}
                  </small>
                </label>
              </div>
              <fieldset className="skillAssignments">
                <legend>武将拥有的技能</legend>
                {value.skills.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={general.skills.includes(item.id)}
                      onChange={(event) =>
                        patchGeneral({
                          skills: event.target.checked
                            ? [...general.skills, item.id]
                            : general.skills.filter((id) => id !== item.id),
                        })
                      }
                    />
                    {item.name}
                  </label>
                ))}
              </fieldset>
              <h3>卡面设计</h3>
              <div className="cardDesigner">
                <div
                  className={`generalCard ${general.cardStyle?.template ?? "classic"}`}
                  style={{
                    borderColor: general.cardStyle?.accentColor,
                    color: general.cardStyle?.textColor,
                  }}
                >
                  {portrait ? (
                    <div className="cardPortrait">
                      <img
                        src={`/api/assets/${portrait.hash}`}
                        alt={`${general.name}卡面预览`}
                        style={{
                          objectPosition: `${general.cardStyle?.portraitX ?? 50}% ${general.cardStyle?.portraitY ?? 45}%`,
                          transform: `scale(${general.cardStyle?.portraitScale ?? 1})`,
                        }}
                      />
                    </div>
                  ) : (
                    <div className="cardPortrait emptyPortrait">上传立绘</div>
                  )}
                  <div
                    className="cardIdentity"
                    style={{ background: general.cardStyle?.accentColor }}
                  >
                    <small>{general.title}</small>
                    <strong>{general.name}</strong>
                    <span>{"♥".repeat(Math.min(general.hp, 10))}</span>
                  </div>
                  {general.cardStyle?.showSkillText && (
                    <div className="cardSkills">
                      {general.skills.map((id) => {
                        const item = value.skills.find(
                          (candidate) => candidate.id === id,
                        );
                        return item ? <span key={id}>{item.name}</span> : null;
                      })}
                    </div>
                  )}
                </div>
                <div className="cardControls">
                  <label>
                    模板
                    <select
                      value={general.cardStyle?.template ?? "classic"}
                      onChange={(e) =>
                        patchGeneral({
                          cardStyle: {
                            ...(general.cardStyle ?? defaultCardStyle()),
                            template: e.target.value as
                              "classic" | "minimal" | "ink",
                          },
                        })
                      }
                    >
                      <option value="classic">经典</option>
                      <option value="minimal">简约</option>
                      <option value="ink">水墨</option>
                    </select>
                  </label>
                  {(
                    [
                      ["portraitX", "水平焦点", 0, 100, 1],
                      ["portraitY", "垂直焦点", 0, 100, 1],
                      ["portraitScale", "缩放", 0.5, 3, 0.05],
                    ] as const
                  ).map(([key, label, min, max, step]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={
                          general.cardStyle?.[key] ?? defaultCardStyle()[key]
                        }
                        onChange={(e) =>
                          patchGeneral({
                            cardStyle: {
                              ...(general.cardStyle ?? defaultCardStyle()),
                              [key]: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    主题颜色
                    <input
                      type="color"
                      value={general.cardStyle?.accentColor ?? "#991b1b"}
                      onChange={(e) =>
                        patchGeneral({
                          cardStyle: {
                            ...(general.cardStyle ?? defaultCardStyle()),
                            accentColor: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    文字颜色
                    <input
                      type="color"
                      value={general.cardStyle?.textColor ?? "#fffaf0"}
                      onChange={(e) =>
                        patchGeneral({
                          cardStyle: {
                            ...(general.cardStyle ?? defaultCardStyle()),
                            textColor: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={general.cardStyle?.showSkillText ?? true}
                      onChange={(e) =>
                        patchGeneral({
                          cardStyle: {
                            ...(general.cardStyle ?? defaultCardStyle()),
                            showSkillText: e.target.checked,
                          },
                        })
                      }
                    />
                    卡面显示技能名称
                  </label>
                  {portrait && (
                    <small>sha256: {portrait.hash.slice(0, 12)}…</small>
                  )}
                  <button
                    className="secondary"
                    disabled={!portrait}
                    onClick={() => void exportGeneralCard()}
                  >
                    导出当前卡面 PNG
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {section === "nodes" && (
        <div className="entityEditor">
          <aside className="entityList">
            <div className="entityListHeader">
              <b>技能（{value.skills.length}）</b>
              <button onClick={addSkill}>新增</button>
            </div>
            {value.skills.map((item) => (
              <button
                key={item.id}
                className={item.id === skill.id ? "active" : "secondary"}
                onClick={() => setSkillId(item.id)}
              >
                {item.name}
                <small>{item.id}</small>
              </button>
            ))}
            <button className="secondary" onClick={duplicateSkill}>
              复制当前技能
            </button>
            <button
              className="danger"
              disabled={value.skills.length === 1}
              onClick={removeSkill}
            >
              删除当前技能
            </button>
          </aside>
          <div className="entityContent">
            <div className="formGrid">
              <label>
                技能 ID
                <input
                  value={skill.id}
                  onChange={(e) => patchSkill({ id: e.target.value })}
                />
              </label>
              <label>
                技能名称
                <input
                  value={skill.name}
                  onChange={(e) => patchSkill({ name: e.target.value })}
                />
              </label>
              <label>
                技能类型
                <select
                  value={skill.kind ?? "trigger"}
                  onChange={(e) =>
                    e.target.value === "active"
                      ? patchSkill({
                          kind: "active",
                          event: undefined,
                          usage: "oncePerTurn",
                        })
                      : patchSkill({
                          kind: "trigger",
                          event: "turnStart",
                          selections: undefined,
                          usage: undefined,
                        })
                  }
                >
                  <option value="trigger">触发技</option>
                  <option value="active">主动技</option>
                </select>
              </label>
              {(skill.kind ?? "trigger") === "trigger" ? (
                <label>
                  触发时机
                  <select
                    value={skill.event ?? "turnStart"}
                    onChange={(e) =>
                      patchSkill({
                        event: e.target.value as typeof skill.event,
                      })
                    }
                  >
                    <option value="turnStart">回合开始</option>
                    <option value="turnEnd">回合结束</option>
                    <option value="playPhaseStart">出牌阶段开始</option>
                    <option value="discardPhaseStart">弃牌阶段开始</option>
                    <option value="afterDamage">受到伤害后</option>
                    <option value="afterUseSha">使用杀后</option>
                  </select>
                </label>
              ) : (
                <label>
                  使用次数
                  <select
                    value={skill.usage ?? "oncePerTurn"}
                    onChange={(e) =>
                      patchSkill({
                        usage: e.target.value as typeof skill.usage,
                      })
                    }
                  >
                    <option value="oncePerTurn">每回合一次</option>
                    <option value="unlimited">不限次数</option>
                  </select>
                </label>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={Boolean(skill.when)}
                  onChange={(e) =>
                    patchSkill({
                      when: e.target.checked
                        ? {
                            op: "predicate",
                            predicate: "wounded",
                            subject: "self",
                          }
                        : undefined,
                    })
                  }
                />
                仅在自己受伤时可触发/发动
              </label>
            </div>
            <fieldset className="modifierEditor">
              <legend>持续修正器</legend>
              {(skill.modifiers ?? []).map((modifier, index) => (
                <div className="modifierRow" key={`${modifier.type}-${index}`}>
                  <select
                    value={modifier.type}
                    onChange={(e) =>
                      patchSkill({
                        modifiers: (skill.modifiers ?? []).map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                type: e.target.value as typeof item.type,
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="handLimit">手牌上限</option>
                    <option value="drawCount">摸牌数</option>
                    <option value="attackRange">攻击范围</option>
                    <option value="distanceFrom">计算与他人距离</option>
                    <option value="distanceTo">他人计算与自己的距离</option>
                  </select>
                  <input
                    type="number"
                    min="-20"
                    max="20"
                    value={modifier.amount}
                    onChange={(e) =>
                      patchSkill({
                        modifiers: (skill.modifiers ?? []).map((item, i) =>
                          i === index
                            ? { ...item, amount: Number(e.target.value) }
                            : item,
                        ),
                      })
                    }
                  />
                  <button
                    className="secondary"
                    onClick={() =>
                      patchSkill({
                        modifiers: (skill.modifiers ?? []).filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    删除
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  patchSkill({
                    modifiers: [
                      ...(skill.modifiers ?? []),
                      { type: "handLimit", amount: 1 },
                    ],
                  })
                }
              >
                添加修正器
              </button>
            </fieldset>
            <fieldset>
              <legend>节点图执行</legend>
              <button
                className="secondary"
                onClick={() => {
                  if (skill.graph) {
                    patchSkill({ graph: undefined, effects: nodes });
                    return;
                  }
                  const graphNodes = nodes.map((node, index) => ({
                    ...node,
                    id: `n${index + 1}`,
                    next:
                      index + 1 < nodes.length ? `n${index + 2}` : undefined,
                  }));
                  patchSkill({
                    effects: graphNodes,
                    graph: { entry: graphNodes[0].id!, nodes: graphNodes },
                  });
                }}
              >
                {skill.graph ? "切换为顺序效果" : "启用节点图"}
              </button>
              {skill.graph && (
                <>
                  <label>
                    入口节点
                    <select
                      value={skill.graph.entry}
                      onChange={(e) =>
                        patchSkill({
                          graph: { ...skill.graph!, entry: e.target.value },
                        })
                      }
                    >
                      {nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className={graphIssues.length ? "error" : "success"}>
                    {graphIssues.length
                      ? graphIssues.join("；")
                      : "节点图连线有效"}
                  </span>
                </>
              )}
            </fieldset>
            <div className="nodeGraph">
              <div className="node trigger">
                <b>
                  {(skill.kind ?? "trigger") === "active" ? "主动发动" : "触发"}
                </b>
                <span>{skill.event ?? skill.usage}</span>
              </div>
              {nodes.map((node, index) => (
                <div className="nodeWrap" key={node.id ?? index}>
                  <span className="arrow">→</span>
                  <div className="node">
                    <b>节点 {index + 1}</b>
                    {skill.graph && (
                      <>
                        <input
                          aria-label="节点 ID"
                          value={node.id ?? ""}
                          onChange={(e) =>
                            patchNode(index, { id: e.target.value })
                          }
                        />
                        <select
                          aria-label="下一节点"
                          value={node.next ?? ""}
                          onChange={(e) =>
                            patchNode(index, {
                              next: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">结束</option>
                          {nodes
                            .filter((_, candidate) => candidate !== index)
                            .map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                → {candidate.id}
                              </option>
                            ))}
                        </select>
                      </>
                    )}
                    <select
                      value={node.type}
                      onChange={(e) =>
                        replaceNode(
                          index,
                          createEffect(e.target.value as EffectDto["type"]),
                        )
                      }
                    >
                      <option value="draw">摸牌</option>
                      <option value="recover">回复</option>
                      <option value="damage">伤害</option>
                      <option value="discard">弃牌</option>
                      <option value="addMark">标记</option>
                      <option value="loseHp">失去体力</option>
                      <option value="changeMaxHp">修改体力上限</option>
                      <option value="grantSkill">临时授予技能</option>
                      <option value="removeSkill">移除授予技能</option>
                      <option value="skipPhase">跳过阶段</option>
                      <option value="moveCards">移动牌</option>
                      <option value="setState">设置技能状态</option>
                      <option value="changeState">增减技能状态</option>
                      <option value="if">条件分支</option>
                      <option value="repeat">有界重复</option>
                      <option value="judge">判定分支</option>
                    </select>
                    <select
                      value={node.target}
                      onChange={(e) =>
                        patchNode(index, {
                          target: e.target.value as EffectDto["target"],
                        })
                      }
                    >
                      <option value="self">自己</option>
                      <option value="source">来源</option>
                      <option value="selected">所选目标</option>
                      <option value="allOthers">所有其他人</option>
                    </select>
                    {(node.type === "setState" ||
                      node.type === "changeState") && (
                      <>
                        <input
                          aria-label="状态键"
                          value={node.stateKey ?? "state"}
                          onChange={(e) =>
                            patchNode(index, { stateKey: e.target.value })
                          }
                        />
                        <input
                          aria-label="状态值"
                          type="number"
                          min="-1000"
                          max="1000"
                          value={node.value ?? 0}
                          onChange={(e) =>
                            patchNode(index, { value: Number(e.target.value) })
                          }
                        />
                      </>
                    )}
                    {node.type === "changeMaxHp" && (
                      <input
                        aria-label="体力上限变化"
                        type="number"
                        min="-20"
                        max="20"
                        value={node.value ?? -1}
                        onChange={(e) =>
                          patchNode(index, { value: Number(e.target.value) })
                        }
                      />
                    )}
                    {(node.type === "grantSkill" ||
                      node.type === "removeSkill") && (
                      <>
                        <select
                          aria-label="技能"
                          value={node.skillId ?? value.skills[0]?.id ?? ""}
                          onChange={(e) =>
                            patchNode(index, { skillId: e.target.value })
                          }
                        >
                          {value.skills.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}（{item.id}）
                            </option>
                          ))}
                        </select>
                        {node.type === "grantSkill" && (
                          <select
                            aria-label="持续时间"
                            value={node.duration ?? "turn"}
                            onChange={(e) =>
                              patchNode(index, {
                                duration: e.target.value as "turn" | "game",
                              })
                            }
                          >
                            <option value="turn">直到下个回合开始</option>
                            <option value="game">本局永久</option>
                          </select>
                        )}
                      </>
                    )}
                    {node.type === "skipPhase" && (
                      <select
                        aria-label="阶段"
                        value={node.phase ?? "play"}
                        onChange={(e) =>
                          patchNode(index, {
                            phase: e.target.value as NonNullable<
                              EffectDto["phase"]
                            >,
                          })
                        }
                      >
                        <option value="judge">判定阶段</option>
                        <option value="draw">摸牌阶段</option>
                        <option value="play">出牌阶段</option>
                        <option value="discard">弃牌阶段</option>
                        <option value="end">结束阶段</option>
                      </select>
                    )}
                    {node.type === "moveCards" && (
                      <>
                        <select
                          aria-label="来源区域"
                          value={node.fromZone ?? "own"}
                          onChange={(e) =>
                            patchNode(index, {
                              fromZone: e.target.value as "hand" | "own",
                            })
                          }
                        >
                          <option value="hand">手牌区</option>
                          <option value="own">手牌或装备区</option>
                        </select>
                        <select
                          aria-label="目标角色"
                          value={node.to ?? "self"}
                          onChange={(e) =>
                            patchNode(index, {
                              to: e.target.value as NonNullable<
                                EffectDto["to"]
                              >,
                            })
                          }
                        >
                          <option value="self">自己</option>
                          <option value="source">技能来源</option>
                          <option value="selected">所选角色</option>
                          <option value="current">当前回合角色</option>
                        </select>
                        <select
                          aria-label="目标区域"
                          value={node.toZone ?? "hand"}
                          onChange={(e) =>
                            patchNode(index, {
                              toZone: e.target.value as "hand" | "discard",
                            })
                          }
                        >
                          <option value="hand">手牌区</option>
                          <option value="discard">弃牌堆</option>
                        </select>
                      </>
                    )}
                    {node.type === "if" && (
                      <>
                        <select
                          aria-label="条件"
                          value={
                            node.condition?.op === "predicate"
                              ? node.condition.predicate
                              : node.condition?.op === "compare" &&
                                  node.condition.left.kind === "property" &&
                                  node.condition.left.property === "state"
                                ? "state"
                                : "hp"
                          }
                          onChange={(e) =>
                            patchNode(index, {
                              condition:
                                e.target.value === "wounded"
                                  ? {
                                      op: "predicate",
                                      predicate: "wounded",
                                      subject: "self",
                                    }
                                  : {
                                      op: "compare",
                                      comparator: "gte",
                                      left: {
                                        kind: "property",
                                        subject: "self",
                                        property:
                                          e.target.value === "state"
                                            ? "state"
                                            : "hp",
                                        key:
                                          e.target.value === "state"
                                            ? "state"
                                            : undefined,
                                      },
                                      right: { kind: "number", value: 1 },
                                    },
                            })
                          }
                        >
                          <option value="wounded">自己已受伤</option>
                          <option value="hp">体力至少为 1</option>
                          <option value="state">技能状态至少为 1</option>
                        </select>
                        <select
                          aria-label="成立分支效果"
                          value={node.then?.[0]?.type ?? "draw"}
                          onChange={(e) =>
                            patchNode(index, {
                              then: [
                                createEffect(
                                  e.target.value as EffectDto["type"],
                                ),
                              ],
                            })
                          }
                        >
                          <option value="draw">成立：摸牌</option>
                          <option value="recover">成立：回复</option>
                          <option value="damage">成立：伤害</option>
                          <option value="changeState">成立：增加状态</option>
                        </select>
                      </>
                    )}
                    {node.type === "repeat" && (
                      <>
                        <input
                          aria-label="重复次数"
                          type="number"
                          min="0"
                          max="20"
                          value={node.times ?? 2}
                          onChange={(e) =>
                            patchNode(index, { times: Number(e.target.value) })
                          }
                        />
                        <select
                          aria-label="重复效果"
                          value={node.body?.[0]?.type ?? "draw"}
                          onChange={(e) =>
                            patchNode(index, {
                              body: [
                                createEffect(
                                  e.target.value as EffectDto["type"],
                                ),
                              ],
                            })
                          }
                        >
                          <option value="draw">重复摸牌</option>
                          <option value="recover">重复回复</option>
                          <option value="damage">重复伤害</option>
                          <option value="discard">重复弃牌</option>
                        </select>
                      </>
                    )}
                    {![
                      "setState",
                      "changeState",
                      "changeMaxHp",
                      "grantSkill",
                      "removeSkill",
                      "skipPhase",
                      "if",
                      "repeat",
                      "judge",
                    ].includes(node.type) && (
                      <input
                        type="number"
                        min="1"
                        value={node.count ?? node.amount ?? 1}
                        onChange={(e) =>
                          patchNode(index, {
                            count: Number(e.target.value),
                            amount: Number(e.target.value),
                          })
                        }
                      />
                    )}
                    <button
                      className="secondary"
                      disabled={nodes.length === 1}
                      onClick={() =>
                        setNodes(nodes.filter((_, i) => i !== index))
                      }
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addNode}>添加效果节点</button>
          </div>
        </div>
      )}
      {section === "cards" && (
        <div className="entityEditor">
          <aside className="entityList">
            <div className="entityListHeader">
              <b>卡牌（{value.cards.length}）</b>
              <button onClick={addCard}>新增</button>
            </div>
            {value.cards.map((item) => (
              <button
                key={item.id}
                className={item.id === card.id ? "active" : "secondary"}
                onClick={() => setCardId(item.id)}
              >
                {item.name}
                <small>{item.id}</small>
              </button>
            ))}
            <button
              className="danger"
              disabled={value.cards.length === 1}
              onClick={removeCard}
            >
              删除当前卡牌
            </button>
          </aside>
          <div className="entityContent split">
            <div>
              <h3>自定义卡牌</h3>
              <label>
                卡牌 ID
                <input
                  value={card.id}
                  onChange={(e) => patchCard({ id: e.target.value })}
                />
              </label>
              <label>
                名称
                <input
                  value={card.name}
                  onChange={(e) => patchCard({ name: e.target.value })}
                />
              </label>
              <label>
                描述
                <textarea
                  value={card.description ?? ""}
                  onChange={(e) => patchCard({ description: e.target.value })}
                />
              </label>
              <label>
                类型
                <select
                  value={card.type}
                  onChange={(e) =>
                    patchCard({ type: e.target.value as typeof card.type })
                  }
                >
                  <option value="basic">基本牌</option>
                  <option value="trick">锦囊</option>
                  <option value="equipment">装备</option>
                </select>
              </label>
              <label>
                目标
                <select
                  value={card.target}
                  onChange={(e) =>
                    patchCard({ target: e.target.value as typeof card.target })
                  }
                >
                  <option value="self">自己</option>
                  <option value="other">其他角色</option>
                  <option value="any">任意角色</option>
                </select>
              </label>
              <label>
                卡面图片
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={uploading}
                  onChange={(event) =>
                    void uploadCardFace(event.target.files?.[0])
                  }
                />
              </label>
              {cardFace && (
                <figure className="cardFacePreview">
                  <img
                    src={`/api/assets/${cardFace.thumbnailHash ?? cardFace.hash}`}
                    alt={`${card.name}卡面`}
                  />
                  <figcaption>sha256: {cardFace.hash.slice(0, 12)}…</figcaption>
                </figure>
              )}
            </div>
            <div>
              <h3>牌堆：{deck.name}</h3>
              {!deck.cards.some((entry) => entry.cardId === card.id) && (
                <button
                  onClick={() =>
                    update(
                      "decks",
                      value.decks.map((item) =>
                        item.id === deck.id
                          ? {
                              ...item,
                              cards: [
                                ...item.cards,
                                { cardId: card.id, count: 1 },
                              ],
                            }
                          : item,
                      ),
                    )
                  }
                >
                  将当前卡牌加入牌堆
                </button>
              )}
              {deck.cards.map((entry, index) => (
                <div className="deckRow" key={`${entry.cardId}-${index}`}>
                  <code>{entry.cardId}</code>
                  <input
                    type="number"
                    min="1"
                    value={entry.count}
                    onChange={(e) =>
                      update(
                        "decks",
                        value.decks.map((item) =>
                          item.id === deck.id
                            ? {
                                ...item,
                                cards: item.cards.map((entryItem, i) =>
                                  i === index
                                    ? {
                                        ...entryItem,
                                        count: Number(e.target.value),
                                      }
                                    : entryItem,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <p>
                总计 {deck.cards.reduce((sum, item) => sum + item.count, 0)} 张
              </p>
            </div>
          </div>
        </div>
      )}
      {section === "mode" && (
        <div className="formGrid">
          <label>
            模式 ID
            <input
              value={mode.id}
              onChange={(e) => patchMode({ id: e.target.value })}
            />
          </label>
          <label>
            模式名称
            <input
              value={mode.name}
              onChange={(e) => patchMode({ name: e.target.value })}
            />
          </label>
          <label>
            最少人数
            <input
              type="number"
              min="2"
              max="8"
              value={mode.minPlayers}
              onChange={(e) =>
                patchMode({ minPlayers: Number(e.target.value) })
              }
            />
          </label>
          <label>
            最多人数
            <input
              type="number"
              min="2"
              max="8"
              value={mode.maxPlayers}
              onChange={(e) =>
                patchMode({ maxPlayers: Number(e.target.value) })
              }
            />
          </label>
          <label>
            初始手牌
            <input
              type="number"
              min="0"
              value={mode.initialHand}
              onChange={(e) =>
                patchMode({ initialHand: Number(e.target.value) })
              }
            />
          </label>
          <label>
            每回合摸牌
            <input
              type="number"
              min="0"
              value={mode.drawPerTurn}
              onChange={(e) =>
                patchMode({ drawPerTurn: Number(e.target.value) })
              }
            />
          </label>
          <label>
            胜利条件
            <select
              value={mode.winCondition}
              onChange={(e) =>
                patchMode({
                  winCondition: e.target.value as typeof mode.winCondition,
                })
              }
            >
              <option value="identity">身份局</option>
              <option value="lastAlive">最后存活者</option>
              <option value="lordSurvives">主公存活</option>
            </select>
          </label>
        </div>
      )}
      {section === "json" && (
        <textarea
          value={json}
          onChange={(e) => {
            try {
              setValue(JSON.parse(e.target.value));
            } catch {}
          }}
        />
      )}
      <h3>在线内容库</h3>
      <div className="library">
        {packages.map((item) => (
          <article className="room" key={item.hash}>
            <div>
              <strong>{item.content.name}</strong>
              <small>
                {item.content.id}@{item.content.version} · #
                {item.hash.slice(0, 8)}
              </small>
            </div>
            <button
              className="secondary"
              onClick={() =>
                navigator.clipboard?.writeText(
                  `${location.origin}/?extension=${item.shareId}`,
                )
              }
            >
              复制分享链接
            </button>
            <a
              className="button secondary"
              href={`/api/share/${item.shareId}/download`}
              download={`${item.content.id}-${item.content.version}.sgspack`}
            >
              下载 .sgspack
            </a>
            <button
              className="secondary"
              onClick={() =>
                void uninstallPackage(item.content.id, item.content.version)
                  .then(() =>
                    setPreview("扩展版本已卸载，可继续使用保留的旧版本"),
                  )
                  .catch((error) =>
                    setPreview(
                      error instanceof Error ? error.message : "扩展卸载失败",
                    ),
                  )
              }
            >
              卸载此版本
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
