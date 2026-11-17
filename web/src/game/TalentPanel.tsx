import { useState } from "react";
import { CATEGORY_NAMES } from "../definitions/research";
import { refreshTalentPool } from "../simulation/research";
import type { ResearchPanelProps } from "./ResearchShared";
import { TalentDossier } from "./talents/TalentDossier";
import { TALENT_ROLES, talentRoleName } from "./talents/talent-view";
import "./talents/talents.css";

export function TalentPanel({
  content,
  world,
  nationId,
  onWorld,
}: ResearchPanelProps) {
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const talents = Object.values(world.research.talents).filter(
    (talent) => talent.nationId === nationId,
  );
  const matches = (id: string, talent: (typeof talents)[number]) =>
    id === "all" ||
    (id === "candidate"
      ? talent.recruitedMonth === null
      : talent.recruitedMonth !== null && talent.role === id);
  const visible = talents.filter((talent) => matches(filter, talent));
  const selected =
    visible.find((talent) => talent.id === selectedId) ?? visible[0];
  const run = (command: () => typeof world, notice: string) => {
    try {
      onWorld(command());
      setMessage(notice);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const candidates = talents.filter(
    (talent) => talent.recruitedMonth === null,
  ).length;
  return (
    <section className="talents-panel">
      <header className="talents-toolbar">
        <div>
          <strong>已入仕 {talents.length - candidates} 人</strong>
          <span>待延揽 {candidates} 人</span>
        </div>
        <button
          disabled={world.nations[nationId].treasury < 15}
          title="更换当前未招募的游士"
          onClick={() =>
            run(
              () => refreshTalentPool(world, nationId),
              "已重新访贤，游士名录已更新。",
            )
          }
        >
          访贤 · 15粮
        </button>
      </header>
      <nav className="talents-filters" aria-label="人才职务筛选">
        {[
          { id: "all", name: "全部" },
          { id: "candidate", name: "待招募" },
          ...TALENT_ROLES,
        ].map(({ id, name }) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => {
              setFilter(id);
              setMessage("");
            }}
          >
            {name}
            <small>
              {talents.filter((talent) => matches(id, talent)).length}
            </small>
          </button>
        ))}
      </nav>
      <div className="talents-workspace">
        <aside className="talent-roster" aria-label="人才名录">
          {visible.map((talent) => (
            <button
              key={talent.id}
              aria-pressed={selected?.id === talent.id}
              className="talent-roster-entry"
              onClick={() => {
                setSelectedId(talent.id);
                setMessage("");
              }}
            >
              <img
                src={`${import.meta.env.BASE_URL}${talent.portrait}`}
                alt=""
              />
              <span>
                <strong>{talent.name}</strong>
                <small>{CATEGORY_NAMES[talent.specialty]}专长</small>
              </span>
              <em>
                {talent.recruitedMonth === null
                  ? "待聘"
                  : talentRoleName(talent.role)}
              </em>
            </button>
          ))}
          {!visible.length && <div className="ui-empty">此名录暂无人才</div>}
        </aside>
        {selected ? (
          <TalentDossier
            content={content}
            world={world}
            nationId={nationId}
            talent={selected}
            run={run}
          />
        ) : (
          <div className="ui-empty talent-dossier-empty">
            <strong>虚位以待</strong>
            <p>从其他名录调任人才，或访贤延揽新的游士。</p>
          </div>
        )}
      </div>
      {message && (
        <p className="panel-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
