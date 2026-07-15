import { useMemo, useRef, useState } from "react";
import { HeadlessGame } from "@sgs/headless-engine";
import type {
  EffectDto,
  ExtensionPackageDto,
  PublishedPackage,
} from "@sgs/protocol";

const emptyPackage = (): ExtensionPackageDto => ({
  schemaVersion: 2,
  id: "custom.my_pack",
  name: "我的创作包",
  version: "1.0.0",
  generals: [
    {
      id: "custom_general",
      name: "自定义武将",
      faction: "qun",
      gender: "male",
      hp: 4,
      skills: ["custom_skill"],
    },
  ],
  skills: [
    {
      id: "custom_skill",
      name: "整军",
      event: "turnStart",
      effects: [{ id: "n1", type: "draw", target: "self", count: 1 }],
    },
  ],
  cards: [
    {
      id: "custom_supply",
      name: "军资",
      type: "trick",
      target: "self",
      description: "摸两张牌",
      effects: [{ id: "c1", type: "draw", target: "self", count: 2 }],
    },
  ],
  decks: [
    {
      id: "custom_deck",
      name: "自定义牌堆",
      cards: [
        { cardId: "sha", count: 20 },
        { cardId: "shan", count: 14 },
        { cardId: "tao", count: 6 },
        { cardId: "custom_supply", count: 4 },
      ],
    },
  ],
  modes: [
    {
      id: "custom_mode",
      name: "朋友乱斗",
      minPlayers: 2,
      maxPlayers: 8,
      initialHand: 4,
      drawPerTurn: 2,
      winCondition: "lastAlive",
      deckId: "custom_deck",
    },
  ],
  tests: [
    {
      id: "smoke",
      name: "扩展冒烟测试",
      seed: 42,
      players: 2,
      expect: {
        noError: true,
        firstGeneral: "custom_general",
        firstHandAtLeast: 6,
      },
    },
  ],
});
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
}: {
  packages: PublishedPackage[];
  publish: (value: ExtensionPackageDto) => void;
  runTests: (value: ExtensionPackageDto) => void;
  testResult?: TestResult;
}) {
  const [value, setValue] = useState(emptyPackage);
  const [section, setSection] = useState<
    "general" | "nodes" | "cards" | "mode" | "json"
  >("general");
  const [preview, setPreview] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const general = value.generals[0];
  const skill = value.skills[0];
  const card = value.cards[0];
  const deck = value.decks[0];
  const mode = value.modes[0];
  const json = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const update = <K extends keyof ExtensionPackageDto>(
    key: K,
    items: ExtensionPackageDto[K],
  ) => setValue((current) => ({ ...current, [key]: items }));
  const patchGeneral = (next: Partial<typeof general>) =>
    update("generals", [{ ...general, ...next }]);
  const patchSkill = (next: Partial<typeof skill>) =>
    update("skills", [{ ...skill, ...next }]);
  const patchCard = (next: Partial<typeof card>) =>
    update("cards", [{ ...card, ...next }]);
  const patchMode = (next: Partial<typeof mode>) =>
    update("modes", [{ ...mode, ...next }]);
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
    if (file) setValue(JSON.parse(await file.text()) as ExtensionPackageDto);
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
  const addNode = () =>
    patchSkill({
      effects: [
        ...skill.effects,
        {
          id: `n${skill.effects.length + 1}`,
          type: "draw",
          target: "self",
          count: 1,
        },
      ],
    });
  const patchNode = (index: number, next: Partial<EffectDto>) =>
    patchSkill({
      effects: skill.effects.map((item, i) =>
        i === index ? { ...item, ...next } : item,
      ),
    });
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
            accept="application/json"
            onChange={(event) => importFile(event.target.files?.[0])}
          />
        </div>
      </div>
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
        <div className="formGrid">
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
              onChange={(e) => setValue({ ...value, version: e.target.value })}
            />
          </label>
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
              onChange={(e) => patchGeneral({ hp: Number(e.target.value) })}
            />
          </label>
          <label>
            性别
            <select
              value={general.gender ?? "male"}
              onChange={(e) =>
                patchGeneral({ gender: e.target.value as "male" | "female" })
              }
            >
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
          </label>
          <label>
            技能名称
            <input
              value={skill.name}
              onChange={(e) => patchSkill({ name: e.target.value })}
            />
          </label>
        </div>
      )}
      {section === "nodes" && (
        <div>
          <div className="formGrid">
            <label>
              触发时机
              <select
                value={skill.event}
                onChange={(e) =>
                  patchSkill({ event: e.target.value as typeof skill.event })
                }
              >
                <option value="turnStart">回合开始</option>
                <option value="afterDamage">受到伤害后</option>
                <option value="afterUseSha">使用杀后</option>
              </select>
            </label>
          </div>
          <div className="nodeGraph">
            <div className="node trigger">
              <b>触发</b>
              <span>{skill.event}</span>
            </div>
            {skill.effects.map((node, index) => (
              <div className="nodeWrap" key={node.id ?? index}>
                <span className="arrow">→</span>
                <div className="node">
                  <b>节点 {index + 1}</b>
                  <select
                    value={node.type}
                    onChange={(e) =>
                      patchNode(index, {
                        type: e.target.value as EffectDto["type"],
                      })
                    }
                  >
                    <option value="draw">摸牌</option>
                    <option value="recover">回复</option>
                    <option value="damage">伤害</option>
                    <option value="discard">弃牌</option>
                    <option value="addMark">标记</option>
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
                  <button
                    className="secondary"
                    disabled={skill.effects.length === 1}
                    onClick={() =>
                      patchSkill({
                        effects: skill.effects.filter((_, i) => i !== index),
                      })
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
      )}
      {section === "cards" && (
        <div className="split">
          <div>
            <h3>自定义卡牌</h3>
            <label>
              卡牌 ID
              <input
                value={card.id}
                onChange={(e) => {
                  patchCard({ id: e.target.value });
                  update("decks", [
                    {
                      ...deck,
                      cards: deck.cards.map((entry) =>
                        entry.cardId === card.id
                          ? { ...entry, cardId: e.target.value }
                          : entry,
                      ),
                    },
                  ]);
                }}
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
          </div>
          <div>
            <h3>牌堆：{deck.name}</h3>
            {deck.cards.map((entry, index) => (
              <div className="deckRow" key={`${entry.cardId}-${index}`}>
                <code>{entry.cardId}</code>
                <input
                  type="number"
                  min="1"
                  value={entry.count}
                  onChange={(e) =>
                    update("decks", [
                      {
                        ...deck,
                        cards: deck.cards.map((item, i) =>
                          i === index
                            ? { ...item, count: Number(e.target.value) }
                            : item,
                        ),
                      },
                    ])
                  }
                />
              </div>
            ))}
            <p>
              总计 {deck.cards.reduce((sum, item) => sum + item.count, 0)} 张
            </p>
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
          </article>
        ))}
      </div>
    </section>
  );
}
