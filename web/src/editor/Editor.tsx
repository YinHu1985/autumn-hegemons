import { useState } from "react";
import { validateContent } from "../definitions/validate";
import {
  CONTENT_FILES,
  type Content,
  type ContentTexts,
} from "../definitions/types";
import { downloadJSON } from "../platform/saves";
import "./editor.css";
interface Props {
  texts: ContentTexts;
  onTexts: (t: ContentTexts) => void;
  onPreview: (c: Content) => void;
}
const LABELS: Record<string, string> = {
  goods: "资源",
  specialties: "特产",
  terrains: "地形",
  buildings: "建筑",
  scenario: "剧本",
  technologies: "科技",
  ideas: "理念",
  units: "兵种",
  events: "事件",
  warfare: "战争规则",
  tactics: "战术与计策",
  diplomacy: "外交规则",
};
const FIELDS: Record<string, string> = {
  minRelation: "关系下限",
  maxRelation: "关系上限",
  center: "初始与年度回归中心",
  yearlyDrift: "每年向中心变化幅度",
  actions: "外交行动（时长、费用与关系变化）",
  id: "稳定 ID",
  name: "名称",
  description: "说明",
  kind: "资源 / 兵种大类",
  stage: "生产层级",
  specialty: "所需特产",
  specialties: "可用特产",
  route: "研究路线",
  category: "研究类别",
  tier: "成本档位",
  cost: "成本",
  prerequisite: "直系前置 ID",
  inspiration: "单项启发",
  inspirationCap: "启发上限比例",
  upkeep: "维护费用",
  effects: "命名效果",
  levels: "建筑等级与配方",
  school: "学派",
  image: "插画路径",
  requires: "解锁科技",
  cadre: "常备人数",
  levy: "征召人数",
  attack: "攻击",
  defense: "防御",
  range: "射程",
  actionPoints: "行动力（覆盖战术默认值）",
  initiative: "基础主动性（覆盖战术默认值）",
  vision: "视野半径（覆盖战术默认值）",
  movement: "旧移动力（已停用，请改用 actionPoints）",
  equipment: "占用军备",
  duration: "选择期限",
  weight: "触发权重",
  options: "选项与效果",
  preparationDays: "战役准备天数",
  queuedProgressCap: "排队进度上限比例",
  returnDays: "进攻部队返程天数",
  expeditionUpkeepMultiplier: "远征维护总倍率",
  recentCombatDays: "近期参战判定天数",
  offensiveFatiguePerAttack: "连续进攻疲劳增量",
  maximumOffensiveFatigue: "进攻疲劳上限",
  fatigueRecoveryDays: "休整消除一层疲劳天数",
  baseActionPoints: "普通部队每次行动力",
  baseInitiative: "统一基础主动性",
  actionThreshold: "行动条满值",
  trainingInitiativeBonus: "训练对主动性的最大修正",
  moraleInitiativeBonus: "士气对主动性的最大修正",
  presentation: "战术播放速度与动作时长（只影响展示）",
  visibility: "战争迷雾（共享视野、遮蔽与阻挡地形）",
  enabled: "启用",
  baseRange: "普通部队视野半径",
  cavalryRange: "骑兵视野半径",
  concealmentRange: "隐蔽地形发现距离",
  concealmentTerrains: "隐蔽地形",
  blockingTerrains: "遮挡视线的地形",
  cavalryActionPoints: "骑兵每次行动力",
  meleeCost: "近战消耗行动力",
  shootCost: "射击消耗行动力",
  plainMoveCost: "平地每格行动力",
  roughMoveCost: "林地丘陵每格行动力",
  meleeDamageRate: "近战伤害系数",
  rangedDamageRate: "射击伤害系数",
  counterDamageRate: "近战反击伤害系数",
  rangedMeleeMultiplier: "远程兵种近战攻击倍率",
  guardDefenseMultiplier: "坚守防御倍率",
  waitMoraleRecovery: "待机恢复士气",
  strategies: "计策列表（效果、行动力、概率与解锁）",
};
export function Editor({ texts, onTexts, onPreview }: Props) {
  const [file, setFile] = useState<(typeof CONTENT_FILES)[number]>("goods");
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [message, setMessage] = useState(
    "选择内容分类和条目。改动经过校验后，可以建立试玩局。",
  );
  const [filter, setFilter] = useState("");
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(texts[file]);
  } catch {
    /* JSON草稿允许暂时不完整 */
  }
  const rows = Array.isArray(parsed) ? parsed : [];
  const objectForm =
    (file === "warfare" || file === "tactics" || file === "diplomacy") &&
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed);
  const entry = (objectForm ? parsed : rows[selected]) as
    Record<string, unknown> | undefined;
  const setText = (value: string) => onTexts({ ...texts, [file]: value });
  const parse = () =>
    validateContent(
      Object.fromEntries(
        CONTENT_FILES.map((name) => [name, JSON.parse(texts[name])]),
      ),
    );
  const change = (key: string, value: unknown) => {
    if (objectForm) {
      setText(JSON.stringify({ ...entry, [key]: value }, null, 2));
      return;
    }
    const next = structuredClone(rows);
    next[selected] = { ...entry, [key]: value };
    setText(JSON.stringify(next, null, 2));
  };
  const verify = (preview = false) => {
    try {
      const c = parse();
      setMessage(
        `校验通过：${c.goods.length}资源 · ${c.buildings.length}建筑 · ${c.technologies.length}科技 · ${c.ideas.length}理念 · ${c.units.length}兵种 · ${c.events.length}事件。`,
      );
      if (preview) onPreview(c);
    } catch (e) {
      setMessage(`校验失败：${(e as Error).message}`);
    }
  };
  return (
    <section className="content-studio">
      <header className="studio-header">
        <div>
          <small>春秋风云 · 内容工坊</small>
          <h1>编修列国</h1>
        </div>
        <p>定义内容、校验引用、独立试玩。游戏逻辑读取同一套内容包。</p>
      </header>
      <nav className="studio-tabs">
        {CONTENT_FILES.map((name) => (
          <button
            key={name}
            className={file === name ? "active" : ""}
            onClick={() => {
              setFile(name);
              setSelected(0);
              setFilter("");
            }}
          >
            {LABELS[name]}
            <small>{name}.json</small>
          </button>
        ))}
      </nav>
      <div className="studio-layout">
        <aside className="studio-index">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="筛选名称或 ID"
            aria-label="筛选内容条目"
          />
          {rows.length ? (
            rows.map((row, i) =>
              String(row.name ?? row.title ?? row.id).includes(filter) ||
              String(row.id).includes(filter) ? (
                <button
                  key={i}
                  className={selected === i ? "active" : ""}
                  onClick={() => setSelected(i)}
                >
                  <b>{row.name ?? row.title ?? row.id}</b>
                  <small>{row.id}</small>
                </button>
              ) : null,
            )
          ) : (
            <p>
              {file === "warfare"
                ? "战争规则作用于所有国家。准备、排队、返程和疲劳可分别调整；现有战役保留发起时的准备期限。"
                : file === "tactics"
                  ? "战术参数由双方共用。计策列表可配置名称、效果、概率与 requires 解锁引用；兵种 actionPoints 可覆盖默认行动力。"
                  : file === "diplomacy"
                    ? "关系中心、年度回归幅度、行动时长与费用均可调整；新局各国从中心值开始，使者能力暂不改变任务。"
                    : "剧本或完整 JSON 文件"}
            </p>
          )}
        </aside>
        <div className="studio-editor">
          <div className="studio-tools">
            <strong>
              {entry
                ? String(
                    entry.name ??
                      entry.title ??
                      entry.id ??
                      `${LABELS[file]}定义`,
                  )
                : `${LABELS[file]}定义`}
            </strong>
            <button onClick={() => setMode(mode === "json" ? "form" : "json")}>
              {mode === "json" ? "条目表单" : "JSON 原文"}
            </button>
            {rows.length > 0 && (
              <button
                onClick={() => {
                  const item = structuredClone(entry ?? rows[0]);
                  item.id = String(item.id) + "_copy";
                  if (item.name) item.name = String(item.name) + " 副本";
                  const next = [...rows, item];
                  setText(JSON.stringify(next, null, 2));
                  setSelected(next.length - 1);
                }}
              >
                复制条目
              </button>
            )}
          </div>
          {mode === "form" && entry ? (
            <div className="definition-form">
              {Object.entries(entry).map(([key, value]) => (
                <label
                  key={`${file}-${selected}-${key}`}
                  className={typeof value === "object" ? "wide" : ""}
                >
                  <span>
                    {FIELDS[key] ?? key}
                    <small>{key}</small>
                  </span>
                  {typeof value === "object" ? (
                    <textarea
                      key={JSON.stringify(value)}
                      defaultValue={JSON.stringify(value, null, 2)}
                      spellCheck={false}
                      onBlur={(e) => {
                        try {
                          change(key, JSON.parse(e.target.value));
                        } catch {
                          setMessage(
                            `${key} 格式错误，未保存该字段；请修正 JSON。`,
                          );
                        }
                      }}
                    />
                  ) : (
                    <input
                      value={String(value ?? "")}
                      type={typeof value === "number" ? "number" : "text"}
                      step="any"
                      onChange={(e) =>
                        change(
                          key,
                          typeof value === "number"
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          ) : (
            <textarea
              className="json-editor"
              aria-label={`${file}.json 内容`}
              spellCheck={false}
              value={texts[file]}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </div>
      </div>
      <footer className="studio-footer">
        <button onClick={() => verify()}>校验内容</button>
        <button className="primary" onClick={() => verify(true)}>
          以草稿建立新局
        </button>
        <button
          onClick={() => {
            try {
              const c = parse();
              downloadJSON(c, "autumn-hegemons-content.json");
              setMessage("已导出完整内容包。");
            } catch (e) {
              setMessage(String(e));
            }
          }}
        >
          导出内容包
        </button>
        <label className="file-button">
          导入内容包
          <input
            type="file"
            accept=".json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f)
                try {
                  const c = validateContent(JSON.parse(await f.text()));
                  onTexts(
                    Object.fromEntries(
                      CONTENT_FILES.map((k) => [
                        k,
                        JSON.stringify(c[k], null, 2),
                      ]),
                    ) as unknown as ContentTexts,
                  );
                  setMessage("内容包已导入并通过校验。");
                } catch (err) {
                  setMessage(String(err));
                }
            }}
          />
        </label>
        <button
          onClick={() => {
            localStorage.setItem("autumn-content-draft", JSON.stringify(texts));
            setMessage("草稿已保存到当前浏览器。");
          }}
        >
          保存草稿
        </button>
        <button
          onClick={() => {
            try {
              const t = JSON.parse(
                localStorage.getItem("autumn-content-draft") ?? "null",
              );
              if (!t || CONTENT_FILES.some((k) => typeof t[k] !== "string"))
                throw new Error("没有完整草稿");
              onTexts(t);
              setMessage("已恢复草稿。");
            } catch (e) {
              setMessage(String(e));
            }
          }}
        >
          恢复草稿
        </button>
        <p role="status">{message}</p>
      </footer>
    </section>
  );
}
