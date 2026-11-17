import { useState } from "react";
import {
  ResearchDetail,
  effectLabel,
  type ResearchPanelProps,
} from "./ResearchShared";
import { enactIdea, ideaSlots } from "../simulation/research";
import "./research.css";
import "./ideas/ideas.css";

export function IdeasPanel(props: ResearchPanelProps) {
  const { content, world, nationId, onWorld } = props;
  const [selectedId, setSelectedId] = useState("");
  const [school, setSchool] = useState("all");
  const [message, setMessage] = useState("");
  const state = world.research.nations[nationId];
  const capacity = ideaSlots(content, world, nationId);
  const ideas = content.ideas.filter(
    (idea) => school === "all" || idea.school === school,
  );
  const selected = ideas.find((idea) => idea.id === selectedId) ?? ideas[0];
  const known = selected && state.unlocked.includes(selected.id);
  const enacted = selected && state.enacted.includes(selected.id);
  const enact = (id: string) => {
    try {
      onWorld(enactIdea(content, world, nationId, id));
      setMessage("实行理念已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <section className="ideas-screen" aria-label="诸子与国策">
      <div className="ideas-summary">
        <span>
          已掌握{" "}
          <b>
            {
              content.ideas.filter((idea) => state.unlocked.includes(idea.id))
                .length
            }
          </b>{" "}
          / {content.ideas.length} 项学说
        </span>
        <span>
          实行国策 <b>{state.enacted.length}</b> / {capacity}
        </span>
        <small>研究保留知识，实行获得国家加成</small>
      </div>
      <div className="ideas-workspace">
        <aside className="ideas-enacted" aria-label="实行国策">
          <header>
            <small>治国之道</small>
            <h3>实行国策</h3>
            <p>选定学说后，在右侧安排实行。</p>
          </header>
          <div className="ideas-policy-list">
            {state.enacted.map((id) => {
              const idea = content.ideas.find((entry) => entry.id === id)!;
              return (
                <article className="ideas-policy" key={id}>
                  <button
                    className="ideas-policy-title"
                    onClick={() => {
                      setSchool("all");
                      setSelectedId(id);
                    }}
                  >
                    <small>{idea.school}</small>
                    <strong>{idea.name}</strong>
                  </button>
                  <p>
                    {Object.entries(idea.effects)
                      .map(([key, value]) => effectLabel(key, value))
                      .join(" · ")}
                  </p>
                  <button className="quiet" onClick={() => enact(id)}>
                    停止实行
                  </button>
                </article>
              );
            })}
            {Array.from(
              {
                length: Math.max(
                  0,
                  Math.floor(capacity) - state.enacted.length,
                ),
              },
              (_, index) => (
                <div className="ideas-vacant" key={index}>
                  <span aria-hidden="true">◇</span>
                  <strong>待定国策</strong>
                  <small>尚有空闲实行槽位</small>
                </div>
              ),
            )}
          </div>
        </aside>
        <div className="ideas-catalogue">
          <nav className="ideas-schools" aria-label="学派选择">
            <button
              aria-pressed={school === "all"}
              onClick={() => setSchool("all")}
            >
              诸子百家
            </button>
            {[...new Set(content.ideas.map((idea) => idea.school))].map(
              (name) => (
                <button
                  aria-pressed={school === name}
                  key={name}
                  onClick={() => setSchool(name)}
                >
                  {name}
                </button>
              ),
            )}
          </nav>
          <div className="ideas-card-scroll">
            <div className="ideas-card-grid">
              {ideas.map((idea) => {
                const isKnown = state.unlocked.includes(idea.id);
                const isEnacted = state.enacted.includes(idea.id);
                const isResearching = state.groups.some(
                  (group) => group.targetId === idea.id,
                );
                return (
                  <button
                    className={`ideas-choice ${selected?.id === idea.id ? "is-selected" : ""}`}
                    key={idea.id}
                    aria-pressed={selected?.id === idea.id}
                    onClick={() => setSelectedId(idea.id)}
                  >
                    <div className="ideas-choice-art">
                      {idea.image && (
                        <img
                          src={`${import.meta.env.BASE_URL}${idea.image}`}
                          alt=""
                        />
                      )}
                      <span>{idea.school}</span>
                    </div>
                    <div className="ideas-choice-caption">
                      <strong>{idea.name}</strong>
                      <span>
                        <small>{["初档", "中档", "高档"][idea.tier - 1]}</small>
                        <small
                          className={
                            isEnacted ? "is-enacted" : isKnown ? "is-known" : ""
                          }
                        >
                          {isEnacted
                            ? "实行中"
                            : isKnown
                              ? "已掌握"
                              : isResearching
                                ? "研究中"
                                : "待研究"}
                        </small>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="ideas-catalogue-note">
            学说彼此独立，可直接研究高档理念。
          </p>
        </div>
        <aside
          className={`ideas-dossier ${known ? "is-known" : ""}`}
          aria-label="学说详情"
        >
          {selected ? (
            <>
              <ResearchDetail key={selected.id} {...props} subject={selected} />
              {known && (
                <div className="ideas-enact-action">
                  <p className="ui-note">
                    {enacted
                      ? "该学说正在实行，国家已获得相应加成。"
                      : `实行槽位 ${state.enacted.length} / ${capacity}，安排后获得国家加成。`}
                  </p>
                  <button
                    className={enacted ? "danger" : "primary"}
                    onClick={() => enact(selected.id)}
                  >
                    {enacted ? "停止实行该理念" : "安排实行该理念"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="ui-empty">选择一项学说查看详情。</div>
          )}
        </aside>
      </div>
      {message && (
        <p className="ideas-feedback" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
