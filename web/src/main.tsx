import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadBaseContent } from "./definitions/load";
import {
  CONTENT_FILES,
  type Content,
  type ContentTexts,
  type Scenario,
} from "./definitions/types";
import { setupScenarios } from "./definitions/scenarios";
import { createWorld, type WorldState } from "./simulation/state";
import { Game } from "./game/Game";
import { SystemMenu } from "./game/SystemMenu";
import { Editor } from "./editor/Editor";
import { MusicProvider } from "./game/music/MusicProvider";
import {
  createSave,
  downloadJSON,
  loadGame,
  parseSave,
  saveGame,
} from "./platform/saves";
import "./style.css";
import "./game/menu.css";
const textsOf = (content: Content) =>
  Object.fromEntries(
    CONTENT_FILES.map((k) => [k, JSON.stringify(content[k], null, 2)]),
  ) as unknown as ContentTexts;
function App() {
  const [session, setSession] = useState(0);
  const [content, setContent] = useState<Content | null>(null);
  const [baseContent, setBaseContent] = useState<Content | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [texts, setTexts] = useState<ContentTexts | null>(null);
  const [world, setWorld] = useState<WorldState | null>(null);
  const [view, setView] = useState<"game" | "editor">("game");
  const [menu, setMenu] = useState(true);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasSave, setHasSave] = useState(false);
  const lastAutomaticSave = useRef<string | null>(null);
  useEffect(() => {
    loadBaseContent()
      .then((r) => {
        setContent(r.content);
        setBaseContent(r.content);
        setScenarios(r.scenarios);
        setTexts(r.texts);
        setWorld(createWorld(r.content));
        try {
          setHasSave(!!loadGame());
        } catch {
          setNotice("旧存档无法读取，可建立新局。");
        }
      })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (!content || !world || menu || world.date.day !== 1) return;
    const key = `${session}:${world.date.year}:${world.date.month}`;
    if (lastAutomaticSave.current === key) return;
    lastAutomaticSave.current = key;
    try {
      saveGame(content, world);
      setHasSave(true);
    } catch {
      setNotice("浏览器存储不可用，请导出存档。");
    }
  }, [content, world, menu, session]);
  const save = () => {
    if (content && world) {
      try {
        saveGame(content, world);
        setHasSave(true);
        setNotice("进度已保存。");
      } catch (e) {
        setNotice(String(e));
      }
    }
  };
  const restore = (s: ReturnType<typeof parseSave>) => {
    setSession((v) => v + 1);
    setStarted(true);
    setContent(s.content);
    setTexts(textsOf(s.content));
    setWorld(s.world);
    setMenu(false);
    setView("game");
    setNotice("存档已载入。");
  };
  const choices = useMemo(
    () =>
      baseContent && content
        ? setupScenarios(baseContent, scenarios, content)
        : [],
    [baseContent, scenarios, content],
  );
  const newGame = (scenario: Scenario, nationId: string) => {
    if (!content || !baseContent) return;
    const source = scenarios.includes(scenario) ? baseContent : content;
    const next = {
      ...source,
      scenario: scenarios.includes(scenario) ? scenario : content.scenario,
    };
    if (!next.scenario.nations.some((nation) => nation.id === nationId)) return;
    setSession((v) => v + 1);
    const w = createWorld(next);
    w.playerNationId = nationId;
    setStarted(true);
    setWorld(w);
    setContent(next);
    setTexts(textsOf(next));
    setMenu(false);
    setView("game");
    setNotice("");
  };
  if (error)
    return (
      <main>
        <h1>内容加载失败</h1>
        <p role="alert">{error}</p>
      </main>
    );
  if (!content || !world || !texts)
    return (
      <div className="loading-screen">
        春秋风云 <small>正在展开天下舆图…</small>
      </div>
    );
  return (
    <MusicProvider
      scene={
        view === "editor"
          ? null
          : !started
            ? "title"
            : world.military.activeBattleId
              ? "battle"
              : "strategy"
      }
    >
      <div className={`shell ${view === "game" ? "shell-game" : ""}`}>
        {view === "editor" && (
          <header className="topbar">
            <div className="brand">
              <span className="seal">春</span>
              <div>
                <strong>内容工坊</strong>
                <small>春秋风云 · 定义与剧本</small>
              </div>
            </div>
            <nav>
              <button
                onClick={() => {
                  setView("game");
                  setMenu(!started);
                }}
              >
                返回天下
              </button>
            </nav>
          </header>
        )}
        <main className={view === "game" ? "game-main" : ""}>
          {view === "game" ? (
            <Game
              key={session}
              content={content}
              world={world}
              onWorld={setWorld}
              suspended={menu}
              onMenu={() => setMenu(true)}
            />
          ) : (
            <Editor
              texts={texts}
              onTexts={setTexts}
              onPreview={(draft) => {
                setSession((v) => v + 1);
                setStarted(true);
                setContent(draft);
                setWorld(createWorld(draft));
                setMenu(false);
                setView("game");
              }}
            />
          )}
        </main>
        {menu && view === "game" && (
          <SystemMenu
            content={content}
            scenarios={choices}
            world={world}
            initial={!started}
            hasSave={hasSave}
            notice={notice}
            onClose={() => setMenu(false)}
            onStart={newGame}
            onSave={save}
            onLoad={() => {
              try {
                const saved = loadGame();
                if (saved) restore(saved);
              } catch (cause) {
                setNotice(String(cause));
              }
            }}
            onImport={async (file) => {
              try {
                restore(parseSave(await file.text()));
              } catch (cause) {
                setNotice(String(cause));
              }
            }}
            onExport={() =>
              downloadJSON(
                createSave(content, world),
                "autumn-hegemons-save.json",
              )
            }
            onEditor={() => {
              setView("editor");
              setMenu(false);
            }}
          />
        )}
      </div>
    </MusicProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
