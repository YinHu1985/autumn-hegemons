import { useState } from "react";
import {
  ResearchDetail,
  effectLabel,
  type ResearchPanelProps,
} from "./ResearchShared";
import { enactIdea, ideaSlots } from "../simulation/research";
import "./research.css";
export function IdeasPanel(props: ResearchPanelProps) {
  const { content, world, nationId, onWorld } = props;
  const [selectedId, setSelectedId] = useState("");
  const [school, setSchool] = useState("all");
  const [message, setMessage] = useState("");
  const state = world.research.nations[nationId];
  const ideas = content.ideas.filter(
    (i) => school === "all" || i.school === school,
  );
  const selected = ideas.find((i) => i.id === selectedId) ?? ideas[0];
  const enact = (id: string) => {
    try {
      onWorld(enactIdea(content, world, nationId, id));
      setMessage("实行理念已更新。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="research-panel">
      <header className="research-heading">
        <div>
          <small>百家争鸣</small>
          <h2>诸子与国策</h2>
        </div>
        <span>
          实行槽位 {state.enacted.length} /{" "}
          {ideaSlots(content, world, nationId)}
        </span>
      </header>
      <p className="research-fineprint">
        理念都是独立课题，可以直接研究高档理念。知识永久保留，安排实行后产生国家加成。
      </p>
      <div className="idea-slots">
        {state.enacted.map((id) => {
          const idea = content.ideas.find((t) => t.id === id)!;
          return (
            <article key={id}>
              <strong>{idea.name}</strong>
              <small>
                {Object.entries(idea.effects)
                  .map(([key, value]) => effectLabel(key, value))
                  .join(" · ")}
              </small>
              <button onClick={() => enact(id)}>卸下</button>
            </article>
          );
        })}
        {Array.from(
          {
            length: Math.max(
              0,
              Math.floor(ideaSlots(content, world, nationId)) -
                state.enacted.length,
            ),
          },
          (_, i) => (
            <article className="empty-slot" key={i}>
              待定国策
            </article>
          ),
        )}
      </div>
      <div className="research-toolbar">
        <button
          className={school === "all" ? "active" : ""}
          onClick={() => setSchool("all")}
        >
          全部学派
        </button>
        {[...new Set(content.ideas.map((t) => t.school))].map((name) => (
          <button
            className={school === name ? "active" : ""}
            key={name}
            onClick={() => setSchool(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="research-layout">
        <div className="idea-grid">
          {ideas.map((idea) => (
            <article
              className={`idea-card ${selected?.id === idea.id ? "selected" : ""}`}
              key={idea.id}
            >
              <button
                className="idea-art-button"
                onClick={() => setSelectedId(idea.id)}
              >
                {idea.image && (
                  <img
                    src={`${import.meta.env.BASE_URL}${idea.image}`}
                    alt=""
                  />
                )}
                <span>
                  <small>
                    {idea.school} · {["初档", "中档", "高档"][idea.tier - 1]}
                  </small>
                  <strong>{idea.name}</strong>
                </span>
              </button>
              <button
                disabled={!state.unlocked.includes(idea.id)}
                onClick={() => enact(idea.id)}
              >
                {state.enacted.includes(idea.id)
                  ? "取消实行"
                  : state.unlocked.includes(idea.id)
                    ? "安排实行"
                    : "尚未掌握"}
              </button>
            </article>
          ))}
        </div>
        {selected && (
          <ResearchDetail key={selected.id} {...props} subject={selected} />
        )}
      </div>
      <p className="research-feedback" role="status">
        {message}
      </p>
    </section>
  );
}
