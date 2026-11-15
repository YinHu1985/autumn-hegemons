import { useState } from "react";
import type { Content } from "../definitions/types";
import type { TechnologyDefinition } from "../definitions/research";
import { CATEGORY_NAMES } from "../definitions/research";
import type { WorldState } from "../simulation/state";
import { inspiration, worldKnowledge } from "../simulation/research";
import { useResearchAssignment } from "./research/useResearchAssignment";
export interface ResearchPanelProps {
  content: Content;
  world: WorldState;
  nationId: string;
  onWorld: (world: WorldState) => void;
}
export { formatModifier as effectLabel } from "../definitions/modifiers";
import { formatModifier as effectLabel } from "../definitions/modifiers";
export function ResearchDetail({
  content,
  world,
  nationId,
  onWorld,
  subject,
}: { subject: TechnologyDefinition } & ResearchPanelProps) {
  const [leaderId, setLeaderId] = useState("");
  const {
    available,
    selected,
    known,
    researching,
    locked,
    progress,
    start,
    message,
  } = useResearchAssignment({
    content,
    world,
    nationId,
    onWorld,
    subject,
    leaderId,
  });
  return (
    <article className="research-detail">
      {subject.image && (
        <img
          className="research-art"
          src={`${import.meta.env.BASE_URL}${subject.image}`}
          alt={subject.name}
        />
      )}
      <small>
        {CATEGORY_NAMES[subject.category]} ·{" "}
        {["初段", "中段", "后段"][subject.tier - 1]}
      </small>
      <h3>{subject.name}</h3>
      <p>{subject.description}</p>
      <div className="research-progress">
        <i style={{ width: `${(progress / subject.cost) * 100}%` }} />
      </div>
      <p className="research-fineprint">
        进度 {progress.toFixed(1)} / {subject.cost} · 知识启发{" "}
        {inspiration(content, world, nationId, subject).toFixed(0)}
      </p>
      <dl className="research-facts">
        <div>
          <dt>世界掌握率</dt>
          <dd>
            {Math.round(worldKnowledge(content, world, subject.id) * 100)}%
          </dd>
        </div>
        <div>
          <dt>单位投入费用</dt>
          <dd>{subject.upkeep} 粮 / 月</dd>
        </div>
      </dl>
      <ul className="research-effects">
        {Object.entries(subject.effects)
          .filter(([, v]) => v !== 0)
          .map(([key, value]) => (
            <li key={key}>{effectLabel(key, value)}</li>
          ))}
      </ul>
      {locked && (
        <p className="research-warning">
          前置：
          {
            content.technologies.find((t) => t.id === subject.prerequisite)
              ?.name
          }
        </p>
      )}
      {!known && !researching && (
        <>
          <label className="research-select">
            课题负责人
            <select
              value={selected}
              onChange={(e) => setLeaderId(e.target.value)}
            >
              <option value="">选择科研人才</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · 学识 {t.scholarship} ·{" "}
                  {CATEGORY_NAMES[t.specialty]}
                </option>
              ))}
            </select>
          </label>
          {!available.length && (
            <p className="research-fineprint">
              先在人才馆将空闲人才调入科研池。
            </p>
          )}
        </>
      )}
      <button
        className="primary"
        disabled={known || researching || !!locked || !selected}
        onClick={start}
      >
        {known ? "已掌握" : researching ? "研究中" : "成立研究组"}
      </button>
      <p className="research-feedback" role="status">
        {message}
      </p>
    </article>
  );
}
