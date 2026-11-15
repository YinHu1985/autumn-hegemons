import { useState } from "react";
import type { ResearchPanelProps } from "./ResearchShared";
import { diplomaticRelation, relationValue } from "../simulation/diplomacy";
import {
  RELATION_LABELS,
  relationDescription,
  signedRelation,
} from "./diplomacy/presentation";
import { DiplomaticActions } from "./diplomacy/DiplomaticActions";
import { DiplomaticMissionList } from "./diplomacy/DiplomaticMissionList";
import { NationRelations } from "./diplomacy/NationRelations";
import "./diplomacy/diplomacy.css";

export function DiplomacyPanel({
  content,
  world,
  nationId,
  onWorld,
  onTalents,
}: ResearchPanelProps & { onTalents?: () => void }) {
  const nations = content.scenario.nations;
  const [selectedId, setSelectedId] = useState(
    nations.find((nation) => nation.id !== nationId)?.id ?? nationId,
  );
  const [message, setMessage] = useState("");
  const selected =
    nations.find((nation) => nation.id === selectedId) ?? nations[0];
  const ownName = nations.find((nation) => nation.id === nationId)?.name;
  const tier = diplomaticRelation(content, world, nationId, selected.id);
  const relation = relationValue(content, world, nationId, selected.id);
  const run = (command: () => typeof world) => {
    try {
      onWorld(command());
      setMessage("外交安排已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <section className="diplomacy-panel">
      <aside className="diplomacy-nations" aria-label="外交国家列表">
        <header>
          <h2>列国往来</h2>
          <small>与{ownName}国的关系</small>
        </header>
        <div className="diplomacy-country-scroll">
          {nations.map((nation) => {
            const countryTier = diplomaticRelation(
              content,
              world,
              nationId,
              nation.id,
            );
            const alive = Object.values(world.settlements).some(
              (city) => city.owner === nation.id,
            );
            return (
              <button
                key={nation.id}
                className={`${nation.id === selected.id ? "active" : ""} relation-${countryTier}`}
                aria-pressed={nation.id === selected.id}
                onClick={() => setSelectedId(nation.id)}
              >
                <strong>{nation.name}</strong>
                <span>{alive ? RELATION_LABELS[countryTier] : "已灭国"}</span>
                <b>
                  {nation.id === nationId
                    ? "—"
                    : signedRelation(
                        relationValue(content, world, nationId, nation.id),
                      )}
                </b>
              </button>
            );
          })}
        </div>
      </aside>
      <div className="diplomacy-detail">
        <header className="diplomacy-country-heading">
          <div
            className="diplomacy-country-seal"
            style={{ borderColor: selected.color }}
          >
            {selected.name}
          </div>
          <div>
            <small>
              邦交 ·{" "}
              {selected.id === nationId
                ? "本国"
                : `${ownName}与${selected.name}`}
            </small>
            <h2>{selected.name}国</h2>
            <p>{selected.description}</p>
          </div>
          <div className={`diplomacy-relation-score relation-${tier}`}>
            <b>{selected.id === nationId ? "—" : signedRelation(relation)}</b>
            <span>{RELATION_LABELS[tier]}</span>
          </div>
        </header>
        {selected.id !== nationId && (
          <div
            className={`diplomacy-relation-track relation-${tier}`}
            aria-label={`与${selected.name}关系：${relationDescription(content, world, nationId, selected.id)}`}
          >
            <i style={{ left: `${(relation + 200) / 4}%` }} />
            <span>险恶</span>
            <span>不和</span>
            <span>友好</span>
            <span>亲密</span>
          </div>
        )}
        <p className="diplomacy-rule">
          关系每年向 {signedRelation(content.diplomacy.center)} 回归{" "}
          {content.diplomacy.yearlyDrift} 点。仅关系险恶（低于
          −100）时可以进攻相邻城邑。
        </p>
        <DiplomaticActions
          key={selected.id}
          content={content}
          world={world}
          nationId={nationId}
          targetId={selected.id}
          run={run}
          onTalents={onTalents}
        />
        <p className="diplomacy-feedback" role="status">
          {message}
        </p>
        <DiplomaticMissionList
          content={content}
          world={world}
          nationId={nationId}
          run={run}
        />
        <NationRelations
          content={content}
          world={world}
          nationId={selected.id}
          onSelect={setSelectedId}
        />
      </div>
    </section>
  );
}
