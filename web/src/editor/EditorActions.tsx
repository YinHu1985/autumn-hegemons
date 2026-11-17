import { useRef } from "react";
import {
  CONTENT_FILES,
  type Content,
  type ContentTexts,
} from "../definitions/types";
import { validateContent } from "../definitions/validate";
import { downloadJSON } from "../platform/saves";
interface Props {
  texts: ContentTexts;
  onTexts: (texts: ContentTexts) => void;
  parseContent: () => Content;
  onVerify: (preview?: boolean) => void;
  message: string;
  onMessage: (message: string) => void;
}
/** Draft storage, package exchange, and playtesting are separate action groups. */
export function EditorActions({
  texts,
  onTexts,
  parseContent,
  onVerify,
  message,
  onMessage,
}: Props) {
  const importInput = useRef<HTMLInputElement>(null);
  return (
    <footer className="studio-footer">
      <div className="studio-action-group" role="group" aria-label="本机草稿">
        <span>本机草稿</span>
        <button
          onClick={() => {
            try {
              localStorage.setItem(
                "autumn-content-draft",
                JSON.stringify(texts),
              );
              onMessage("草稿已保存到当前浏览器。");
            } catch (error) {
              onMessage(`草稿保存失败：${String(error)}`);
            }
          }}
        >
          保存草稿
        </button>
        <button
          onClick={() => {
            try {
              const saved = JSON.parse(
                localStorage.getItem("autumn-content-draft") ?? "null",
              );
              if (
                !saved ||
                CONTENT_FILES.some((key) => typeof saved[key] !== "string")
              )
                throw new Error("没有完整草稿");
              onTexts(saved);
              onMessage("已恢复草稿。");
            } catch (error) {
              onMessage(String(error));
            }
          }}
        >
          恢复草稿
        </button>
      </div>
      <div className="studio-action-group" role="group" aria-label="内容包文件">
        <span>内容包</span>
        <button onClick={() => importInput.current?.click()}>导入内容包</button>
        <button
          onClick={() => {
            try {
              downloadJSON(parseContent(), "autumn-hegemons-content.json");
              onMessage("已导出完整内容包。");
            } catch (error) {
              onMessage(String(error));
            }
          }}
        >
          导出内容包
        </button>
        <input
          ref={importInput}
          className="studio-import-input"
          type="file"
          accept=".json"
          aria-label="导入内容包文件"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              const content = validateContent(JSON.parse(await file.text()));
              onTexts(
                Object.fromEntries(
                  CONTENT_FILES.map((key) => [
                    key,
                    JSON.stringify(content[key], null, 2),
                  ]),
                ) as unknown as ContentTexts,
              );
              onMessage("内容包已导入并通过校验。");
            } catch (error) {
              onMessage(String(error));
            }
          }}
        />
      </div>
      <div
        className="studio-action-group studio-primary-actions"
        role="group"
        aria-label="校验与试玩"
      >
        <button onClick={() => onVerify()}>校验内容</button>
        <button className="primary" onClick={() => onVerify(true)}>
          以草稿建立新局
        </button>
      </div>
      <p className="studio-feedback" role="status">
        {message}
      </p>
    </footer>
  );
}
