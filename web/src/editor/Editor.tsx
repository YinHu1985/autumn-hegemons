import { useState } from "react";
import { validateContent } from "../definitions/validate";
import {
  CONTENT_FILES,
  type Content,
  type ContentTexts,
} from "../definitions/types";
import { EditorActions } from "./EditorActions";
import { ResearchAttributeFields } from "./ResearchAttributeFields";
import {
  EVENT_FIELD_HELP,
  EventAuthoringGuide,
  newEventDefinition,
} from "./EventAuthoringGuide";
import { LABELS, FIELDS } from "./labels";
import "./editor.css";
interface Props {
  texts: ContentTexts;
  onTexts: (t: ContentTexts) => void;
  onPreview: (c: Content) => void;
}
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
        `校验通过：${c.goods.length}资源 · ${c.buildings.length}建筑 · ${c.technologies.length}科技 · ${c.ideas.length}理念 · ${c.units.length}兵种 · ${c.events.length}事件 · ${c.modifierDefinitions.length}额外效果。`,
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
      <nav className="studio-tabs" aria-label="内容分类">
        {CONTENT_FILES.map((name) => (
          <button
            key={name}
            className={file === name ? "active" : ""}
            aria-pressed={file === name}
            onClick={() => {
              setFile(name);
              setSelected(0);
              setFilter("");
            }}
          >
            {LABELS[name]}
            <small>
              {name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}
              .json
            </small>
          </button>
        ))}
      </nav>
      <div className="studio-layout">
        <aside className="studio-index">
          <div className="studio-index-heading">
            <span>条目名录</span>
            <small>{rows.length || 1} 项</small>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="筛选名称或 ID"
            aria-label="筛选内容条目"
          />
          <div className="studio-entry-list">
            {rows.length ? (
              rows.map((row, i) =>
                String(row.name ?? row.title ?? row.id).includes(filter) ||
                String(row.id).includes(filter) ? (
                  <button
                    key={i}
                    className={selected === i ? "active" : ""}
                    aria-pressed={selected === i}
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
          </div>
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
            <div className="studio-mode-switch" aria-label="编辑方式">
              <button
                aria-pressed={mode === "form"}
                onClick={() => setMode("form")}
              >
                条目表单
              </button>
              <button
                aria-pressed={mode === "json"}
                onClick={() => setMode("json")}
              >
                JSON 原文
              </button>
            </div>
            {file === "events" && (
              <button
                onClick={() => {
                  const next = [
                    ...rows,
                    newEventDefinition(rows.map((row) => String(row.id))),
                  ];
                  setText(JSON.stringify(next, null, 2));
                  setSelected(next.length - 1);
                }}
              >
                新建事件
              </button>
            )}
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
          {(file === "events" || file === "eventPools") && (
            <EventAuthoringGuide pool={file === "eventPools"} />
          )}
          {mode === "form" && entry ? (
            <div className="definition-form">
              {Object.entries(entry).map(([key, value]) =>
                key === "attributeWeights" ? (
                  <ResearchAttributeFields
                    key={`${file}-${selected}-${key}`}
                    value={value}
                    onChange={(weights) => change(key, weights)}
                  />
                ) : (
                  <label
                    key={`${file}-${selected}-${key}`}
                    className={typeof value === "object" ? "wide" : ""}
                  >
                    <span>
                      {file === "events" && key === "presentation"
                        ? "奏报展示"
                        : (FIELDS[key] ?? key)}
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
                    ) : typeof value === "boolean" ? (
                      <select
                        value={String(value)}
                        onChange={(e) => change(key, e.target.value === "true")}
                      >
                        <option value="true">是</option>
                        <option value="false">否</option>
                      </select>
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
                    {[
                      "completionEffects",
                      "enactEffects",
                      "repealEffects",
                    ].includes(key) && (
                      <small className="definition-help">
                        在对应时机执行一次。unlock_idea 解锁理念；add_modifier
                        追加额外效果并独立计时；grain、manpower 等立即改变资源。
                        常规持续加成写在 effects 中。
                      </small>
                    )}
                    {key === "effects" && (
                      <small className="definition-help">
                        数字为简写；动态值可引用基础指标或使用算式。 显式
                        operation 支持 add（加值）、add_percent（加比例）与
                        multiply（乘倍数）。
                      </small>
                    )}
                    {key === "stacking" && (
                      <small className="definition-help">
                        refresh 刷新目标上相同效果 ID 的期限；stack
                        逐次叠加；replace 替换目标上相同效果 ID
                        的所有实例。来源只用于说明。
                      </small>
                    )}
                    {file === "events" && EVENT_FIELD_HELP[key] && (
                      <small className="definition-help">
                        {EVENT_FIELD_HELP[key]}
                      </small>
                    )}
                    {file === "eventPools" && key === "chance" && (
                      <small className="definition-help">
                        每国每月一次抽取：0 为不触发，0.22 为 22%，1
                        为必然尝试。 池内没有符合条件的事件时不触发。
                      </small>
                    )}
                    {key === "showInAdministration" && (
                      <small className="definition-help">
                        只控制内政列表，不影响计算与来源明细；省略时按来源类型决定。
                      </small>
                    )}
                  </label>
                ),
              )}
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
      <EditorActions
        texts={texts}
        onTexts={onTexts}
        parseContent={parse}
        onVerify={verify}
        message={message}
        onMessage={setMessage}
      />
    </section>
  );
}
