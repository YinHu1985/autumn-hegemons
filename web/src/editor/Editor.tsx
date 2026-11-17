import { useState } from "react";
import { validateContent } from "../definitions/validate";
import {
  CONTENT_FILES,
  type Content,
  type ContentTexts,
} from "../definitions/types";
import { EditorActions } from "./EditorActions";
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
            <small>{name}.json</small>
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
