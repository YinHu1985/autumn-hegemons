import { useEffect, useRef, useState } from "react";
import type { Content, Scenario } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { MusicSettings } from "./music/MusicSettings";
import { ScenarioSetup, scenarioYear } from "./setup/ScenarioSetup";

interface Props {
  content: Content;
  world: WorldState;
  scenarios: Scenario[];
  initial: boolean;
  hasSave: boolean;
  notice: string;
  onClose: () => void;
  onStart: (scenario: Scenario, nationId: string) => void;
  onSave: () => void;
  onLoad: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onEditor: () => void;
}

/** System actions live here; campaign controls belong to the game HUD. */
export function SystemMenu({
  content,
  world,
  scenarios,
  initial,
  hasSave,
  notice,
  onClose,
  onStart,
  onSave,
  onLoad,
  onImport,
  onExport,
  onEditor,
}: Props) {
  const [setup, setSetup] = useState(initial);
  const choices = scenarios.length ? scenarios : [content.scenario];
  const [scenarioIndex, setScenarioIndex] = useState(() => {
    const custom = choices.findIndex((entry) => entry.id === "custom-current");
    if (custom >= 0) return custom;
    return Math.max(
      0,
      choices.findIndex(
        (entry) =>
          entry === content.scenario ||
          (entry.id !== undefined && entry.id === content.scenario.id),
      ),
    );
  });
  const selectedScenario = choices[scenarioIndex] ?? choices[0];
  const dialog = useRef<HTMLElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const nation = content.scenario.nations.find(
    (entry) => entry.id === world.playerNationId,
  );
  const year = world.date.year < 0 ? `前${-world.date.year}` : world.date.year;
  const returnFromMenu = () => {
    if (setup && !initial) setSetup(false);
    else if (!initial) onClose();
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    dialog.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
  }, [setup]);

  return (
    <div
      className="game-menu-shade"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) returnFromMenu();
      }}
      onKeyDown={(event) => {
        // Keep the game's Escape shortcut from closing a window behind this menu.
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          returnFromMenu();
        } else if (event.key === "Tab") {
          const controls = [
            ...(dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not([type=hidden]):not(:disabled), select:not(:disabled), summary",
            ) ?? []),
          ].filter((element) => element.getClientRects().length);
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        ref={dialog}
        className={`game-menu ${setup ? "game-menu-setup" : "game-menu-pause"}`}
        role="dialog"
        aria-modal="true"
        aria-label="系统菜单"
      >
        {setup && (
          <div className="menu-art">
            <span>山河为疆　百家争鸣</span>
            <h1>春秋风云</h1>
            <p>
              {selectedScenario.name ?? "列国争衡"} ·{" "}
              {scenarioYear(selectedScenario)}
            </p>
            <small>
              {selectedScenario.nations.length}国 ·{" "}
              {selectedScenario.settlements.length}城
            </small>
          </div>
        )}
        <div className="menu-content">
          <header className="system-menu-heading">
            <div>
              <small>
                {setup
                  ? "列国争衡"
                  : `${nation?.name ?? "列国"}国 · ${year}年${world.date.month}月${world.date.day}日`}
              </small>
              <h2>{setup ? "择国而治" : "系统菜单"}</h2>
            </div>
            {!initial && (
              <button
                className="system-menu-close ui-close"
                onClick={returnFromMenu}
                aria-label={setup ? "返回系统菜单" : "关闭系统菜单"}
              >
                ×
              </button>
            )}
          </header>
          <div
            className={setup ? "system-menu-workspace" : "system-pause-body"}
          >
            {setup ? (
              <ScenarioSetup
                scenarios={choices}
                scenario={selectedScenario}
                onScenario={(next) => setScenarioIndex(choices.indexOf(next))}
                onStart={onStart}
              />
            ) : (
              <>
                <button
                  className="system-menu-primary primary"
                  onClick={onClose}
                >
                  返回天下
                </button>
                <div className="system-menu-section-label">战局存档</div>
                <div className="menu-actions">
                  <button onClick={onSave}>保存进度</button>
                  <button disabled={!hasSave} onClick={onLoad}>
                    读取存档
                  </button>
                  <button onClick={onExport}>导出存档</button>
                  <button onClick={() => importInput.current?.click()}>
                    导入存档
                  </button>
                </div>
                <div className="system-menu-section-label">新局与编修</div>
                <div className="menu-actions">
                  <button onClick={() => setSetup(true)}>新建战局</button>
                  <button onClick={onEditor}>内容工坊</button>
                </div>
              </>
            )}
          </div>
          <footer
            className={`system-menu-footer ${setup ? "setup-footer" : ""}`}
          >
            {setup && (
              <div className="setup-secondary-actions">
                {initial ? (
                  <div className="menu-actions system-load-actions">
                    <button disabled={!hasSave} onClick={onLoad}>
                      读取存档
                    </button>
                    <button onClick={() => importInput.current?.click()}>
                      导入存档
                    </button>
                    <button className="system-editor-entry" onClick={onEditor}>
                      内容工坊
                    </button>
                  </div>
                ) : (
                  <button
                    className="system-menu-back quiet"
                    onClick={() => setSetup(false)}
                  >
                    返回系统菜单
                  </button>
                )}
                <p className="menu-hint">
                  选择国家，开始你的春秋。
                  <span>空格 暂停／继续 · Esc 返回</span>
                </p>
              </div>
            )}
            <input
              ref={importInput}
              className="system-import-input"
              type="file"
              aria-label="导入存档文件"
              accept=".json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.target.value = "";
              }}
            />
            {notice && (
              <p className="system-menu-notice" role="status">
                {notice}
              </p>
            )}
            <MusicSettings />
            {!setup && (
              <p className="menu-hint">
                天下已暂停 · 每月自动保存<span>空格 暂停／继续 · Esc 返回</span>
              </p>
            )}
          </footer>
        </div>
      </section>
    </div>
  );
}
