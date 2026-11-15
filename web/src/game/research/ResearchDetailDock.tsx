import type { TechnologyDefinition } from "../../definitions/research";
import { CATEGORY_NAMES } from "../../definitions/research";
import { formatModifier } from "../../definitions/modifiers";
import {
  groupMonthlyProgress,
  inspiration,
  worldKnowledge,
} from "../../simulation/research";
import type { ResearchPanelProps } from "../ResearchShared";
import { useResearchAssignment } from "./useResearchAssignment";
import "./research-detail-dock.css";

interface Props extends ResearchPanelProps {
  subject?: TechnologyDefinition;
  leaderId: string;
  onLeaderChange: (id: string) => void;
  onSelectSubject: (id: string) => void;
}

/** Fixed-height, independently scrolling details beneath the technology routes. */
export function ResearchDetailDock({
  subject,
  leaderId,
  onLeaderChange,
  onSelectSubject,
  ...props
}: Props) {
  const { content, world, nationId } = props;
  const assignment = useResearchAssignment({ ...props, subject, leaderId });
  const {
    available,
    selected,
    known,
    researching,
    group,
    locked,
    progress,
    start,
    message,
  } = assignment;
  if (!subject)
    return (
      <aside
        className="tech-detail-dock tech-detail-empty"
        aria-label="科技详情"
      >
        <strong>选择一项科技</strong>
        <p>点击上方课题，查看工艺、作用与前置条件，再安排科研人才主持。</p>
      </aside>
    );
  const prerequisite = content.technologies.find(
    (entry) => entry.id === subject.prerequisite,
  );
  const leader = world.research.talents[group?.leaderId ?? selected];
  const status = known
    ? "已掌握"
    : researching
      ? "研究中"
      : locked
        ? "前置未成"
        : "可研究";
  const effects = Object.entries(subject.effects).filter(
    ([, value]) => value !== 0,
  );
  const unlocks = content.buildings.flatMap((building) =>
    building.levels.flatMap((level, index) =>
      level.technology === subject.id
        ? [`${building.name} · ${index + 1} 级`]
        : [],
    ),
  );
  const percent = Math.max(0, Math.min(100, (progress / subject.cost) * 100));
  return (
    <aside className="tech-detail-dock" aria-label="科技详情">
      <section className="tech-detail-background" aria-label="工艺简介">
        <header>
          <span>工艺档案</span>
          <small>
            {CATEGORY_NAMES[subject.category]} ·{" "}
            {["初段", "中段", "后段"][subject.tier - 1]}
          </small>
        </header>
        {subject.image && (
          <img
            className="tech-detail-art"
            src={`${import.meta.env.BASE_URL}${subject.image}`}
            alt={subject.name}
          />
        )}
        <h3>{subject.name}</h3>
        <p className="tech-detail-description">{subject.description}</p>
        <dl className="tech-detail-facts">
          <div>
            <dt>世界掌握率</dt>
            <dd>
              {Math.round(worldKnowledge(content, world, subject.id) * 100)}%
            </dd>
          </div>
          <div>
            <dt>单位投入月费</dt>
            <dd>{subject.upkeep} 粮</dd>
          </div>
        </dl>
      </section>
      <section className="tech-detail-overview" aria-label="科技作用与前置">
        <header>
          <span>作用与前置</span>
          <small
            className={`tech-detail-status ${known ? "is-known" : researching ? "is-researching" : locked ? "is-locked" : "is-ready"}`}
          >
            {status}
          </small>
        </header>
        {effects.length ? (
          <ul className="tech-detail-effects">
            {effects.map(([key, value]) => (
              <li key={key}>{formatModifier(key, value)}</li>
            ))}
          </ul>
        ) : (
          <p className="tech-detail-note">效果待定</p>
        )}
        {unlocks.length > 0 && (
          <p className="tech-detail-unlocks">解锁：{unlocks.join("、")}</p>
        )}
        <div className="tech-detail-prerequisite">
          <span>直系前置</span>
          {prerequisite ? (
            <button
              className={locked ? "is-locked" : "is-known"}
              onClick={() => onSelectSubject(prerequisite.id)}
            >
              {prerequisite.name} <small>{locked ? "未掌握" : "已掌握"}</small>
            </button>
          ) : (
            <small>无，可直接研究</small>
          )}
        </div>
      </section>
      <section className="tech-detail-assignment" aria-label="科研安排">
        <header>
          <span>科研安排</span>
          <small>
            知识启发 {inspiration(content, world, nationId, subject).toFixed(0)}
          </small>
        </header>
        <div className="tech-detail-progress-label">
          <span>研究进度</span>
          <strong>
            {progress.toFixed(1)}{" "}
            <small>/ {subject.cost.toLocaleString()}</small>
          </strong>
        </div>
        <div
          className="tech-detail-progress"
          role="progressbar"
          aria-label={`${subject.name}研究进度`}
          aria-valuemin={0}
          aria-valuemax={subject.cost}
          aria-valuenow={Number(progress.toFixed(1))}
        >
          <i style={{ width: `${percent}%` }} />
        </div>
        {!known && !researching && (
          <label className="tech-detail-leader">
            <span>课题负责人</span>
            <select
              value={selected}
              onChange={(event) => onLeaderChange(event.target.value)}
            >
              <option value="">选择科研人才</option>
              {available.map((talent) => (
                <option key={talent.id} value={talent.id}>
                  {talent.name} · 学识 {talent.scholarship} ·{" "}
                  {CATEGORY_NAMES[talent.specialty]}
                </option>
              ))}
            </select>
          </label>
        )}
        {group && (
          <p className="tech-detail-active-group">
            {leader?.name ?? "负责人空缺"}主持 · 本月预计 +
            {groupMonthlyProgress(content, world, nationId, group).toFixed(1)}
          </p>
        )}
        <button
          className="tech-detail-start primary"
          disabled={known || researching || locked || !selected}
          onClick={start}
        >
          {known ? "已掌握" : researching ? "研究中" : "成立研究组"}
        </button>
        {message ? (
          <p className="tech-detail-feedback" role="status">
            {message}
          </p>
        ) : (
          <p className="tech-detail-note">
            {known
              ? "成果已生效，可继续安排其他课题。"
              : researching
                ? "投入与停止研究可在左侧科技组中调整。"
                : locked
                  ? "先掌握直系前置科技，再安排研究。"
                  : !available.length
                    ? "先在人才馆将空闲人才调入科研池。"
                    : "月底拨款，按投入、能力与特长推进。"}
          </p>
        )}
      </section>
    </aside>
  );
}
