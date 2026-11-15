import { useState } from "react";
import {
  CATEGORY_NAMES,
  type ResearchCategory,
} from "../../definitions/research";
import type { Talent } from "../../simulation/research-state";
import {
  categorySeats,
  groupMonthlyProgress,
  researchProgress,
  researchScale,
  researchSubjects,
  setResearchInvestment,
  stopResearch,
} from "../../simulation/research";
import type { ResearchPanelProps } from "../ResearchShared";
import { availableResearchLeaders } from "./useResearchAssignment";
import "./research-groups-rail.css";

interface Props extends ResearchPanelProps {
  leaderId: string;
  onSelect: (leaderId: string, targetId?: string) => void;
}

function TeamIdentity({
  talent,
  status,
  target,
}: {
  talent?: Talent;
  status: string;
  target: string;
}) {
  return (
    <>
      {talent?.portrait ? (
        <img
          className="tech-team-portrait"
          src={`${import.meta.env.BASE_URL}${talent.portrait}`}
          alt=""
        />
      ) : (
        <span
          className="tech-team-portrait tech-team-monogram"
          aria-hidden="true"
        >
          士
        </span>
      )}
      <span className="tech-team-identity">
        <span className="tech-team-name">
          <strong>{talent?.name ?? "负责人空缺"}</strong>
          <small>{status}</small>
        </span>
        <span className="tech-team-target">{target}</span>
        {talent && (
          <small className="tech-team-specialty">
            {CATEGORY_NAMES[talent.specialty]}专长 · 学识 {talent.scholarship} ·
            统率 {talent.command}
          </small>
        )}
      </span>
    </>
  );
}

/** Research assignments and idle researchers share one selection rail. */
export function ResearchGroupsRail({
  content,
  world,
  nationId,
  onWorld,
  leaderId,
  onSelect,
}: Props) {
  const [feedback, setFeedback] = useState({ groups: "", text: "" });
  const state = world.research.nations[nationId];
  const groupKey = state.groups.map((group) => group.id).join(",");
  const message = feedback.groups === groupKey ? feedback.text : "";
  const subjects = new Map(
    researchSubjects(content).map((subject) => [subject.id, subject]),
  );
  const scale = researchScale(content, world, nationId);
  const available = availableResearchLeaders(world, nationId);
  const quotas = (Object.keys(CATEGORY_NAMES) as ResearchCategory[]).map(
    (category) => {
      const used = state.groups.filter(
        (group) => subjects.get(group.targetId)?.category === category,
      ).length;
      const limit = categorySeats(content, world, nationId, category);
      return { category, used, limit };
    },
  );
  const overLimit = quotas.some(({ used, limit }) => used > limit);
  const run = (command: () => typeof world, success = "") => {
    try {
      const next = command();
      onWorld(next);
      setFeedback({
        groups: next.research.nations[nationId].groups
          .map((group) => group.id)
          .join(","),
        text: success,
      });
    } catch (error) {
      setFeedback({
        groups: groupKey,
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <aside className="tech-team-rail" aria-label="科技组">
      <header className="tech-team-rail-heading">
        <strong>科技组</strong>
        <small>
          {state.groups.length} 在研 · {available.length} 待命
        </small>
      </header>
      <div className="tech-team-seats" aria-label="各类科技组席位">
        {quotas.map(({ category, used, limit }) => (
          <span
            key={category}
            className={used > limit ? "is-over-limit" : undefined}
            title={`${CATEGORY_NAMES[category]}科技组 ${used} / ${limit}，超额降低同类科研效率`}
          >
            {CATEGORY_NAMES[category]}
            <b>
              {used}
              <i> / {limit}</i>
            </b>
          </span>
        ))}
      </div>
      {overLimit && (
        <p className="tech-team-warning">
          同类科技组已超额，该类科研效率降低。
        </p>
      )}
      <div className="tech-team-list">
        {state.groups.map((group) => {
          const target = subjects.get(group.targetId);
          const leader = world.research.talents[group.leaderId];
          const progress = target
            ? researchProgress(content, world, nationId, target)
            : 0;
          const percent = target
            ? Math.min(100, (progress / target.cost) * 100)
            : 0;
          return (
            <article
              key={group.id}
              className={`tech-team-card${leaderId === group.leaderId ? " is-selected" : ""}`}
            >
              <button
                type="button"
                className="tech-team-select"
                aria-pressed={leaderId === group.leaderId}
                onClick={() => onSelect(group.leaderId, group.targetId)}
              >
                <TeamIdentity
                  talent={leader}
                  status="在研"
                  target={target?.name ?? group.targetId}
                />
              </button>
              <div className="tech-team-progress-caption">
                <small>
                  {target ? CATEGORY_NAMES[target.category] : "课题"} ·{" "}
                  {percent.toFixed(0)}%
                </small>
                <span>
                  +
                  {groupMonthlyProgress(
                    content,
                    world,
                    nationId,
                    group,
                  ).toFixed(1)}{" "}
                  / 月
                </span>
              </div>
              <progress
                className="tech-team-progress"
                aria-label={`${target?.name ?? "课题"}研究进度`}
                max={target?.cost ?? 1}
                value={progress}
              />
              <label className="tech-team-investment">
                <span>
                  下月投入 <b>{group.investment}</b>
                </span>
                <input
                  aria-label={`${target?.name ?? "课题"}投入`}
                  type="range"
                  min="0"
                  max={scale}
                  step="1"
                  value={group.investment}
                  onChange={(event) =>
                    run(() =>
                      setResearchInvestment(
                        content,
                        world,
                        nationId,
                        group.id,
                        Number(event.target.value),
                      ),
                    )
                  }
                />
              </label>
              <div className="tech-team-funding">
                <small>本月已拨 {group.fundedInvestment.toFixed(1)}</small>
                <button
                  type="button"
                  title="停止课题，保留研究进度"
                  aria-label={`停止研究${target?.name ?? "课题"}`}
                  onClick={() =>
                    run(
                      () => stopResearch(world, nationId, group.id),
                      "研究已停止，进度保留。",
                    )
                  }
                >
                  停止
                </button>
              </div>
            </article>
          );
        })}
        {available.length > 0 && (
          <div className="tech-team-section-label">
            待命人才 <span>{available.length}</span>
          </div>
        )}
        {available.map((talent) => (
          <article
            className={`tech-team-card tech-team-idle${leaderId === talent.id ? " is-selected" : ""}`}
            key={talent.id}
          >
            <button
              type="button"
              className="tech-team-select"
              aria-pressed={leaderId === talent.id}
              onClick={() => onSelect(talent.id)}
            >
              <TeamIdentity
                talent={talent}
                status="待命"
                target="选择课题安排研究"
              />
            </button>
          </article>
        ))}
        {!state.groups.length && !available.length && (
          <p className="tech-team-empty">
            尚无科研人才。请在人才馆将空闲人才调入科研池。
          </p>
        )}
      </div>
      <footer className="tech-team-rail-footer">
        {message ? (
          <p role="status">{message}</p>
        ) : (
          <p>选择人才与课题，月底拨款开展研究。</p>
        )}
      </footer>
    </aside>
  );
}
