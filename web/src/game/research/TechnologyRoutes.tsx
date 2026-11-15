import { CATEGORY_NAMES } from "../../definitions/research";
import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { researchProgress } from "../../simulation/research";
import type { TechnologyRoute } from "./technology-routes";

interface Props {
  content: Content;
  world: WorldState;
  nationId: string;
  routes: TechnologyRoute[];
  selectedId: string;
  onSelect: (id: string) => void;
}
const TIERS = [1, 2, 3] as const;

export function TechnologyRoutes({
  content,
  world,
  nationId,
  routes,
  selectedId,
  onSelect,
}: Props) {
  const state = world.research.nations[nationId];
  return (
    <div
      className="technology-route-scroll"
      tabIndex={0}
      aria-label="按路线排列的科技"
    >
      <div className="technology-tier-heading" aria-hidden="true">
        <span>研究路线</span>
        <span>
          初段 <small>Ⅰ</small>
        </span>
        <span>
          中段 <small>Ⅱ</small>
        </span>
        <span>
          后段 <small>Ⅲ</small>
        </span>
      </div>
      {routes.map((route) => (
        <section
          className="technology-route"
          key={route.id}
          aria-label={`${route.label}科技路线`}
        >
          <header className="technology-route-label">
            <small>{CATEGORY_NAMES[route.category]}</small>
            <h3>{route.label}</h3>
          </header>
          {TIERS.map((tier) => (
            <div className="technology-stage" key={tier}>
              {route.subjects
                .filter((subject) => subject.tier === tier)
                .map((subject) => {
                  const known = state.unlocked.includes(subject.id);
                  const researching = state.groups.some(
                    (group) => group.targetId === subject.id,
                  );
                  const prerequisite = content.technologies.find(
                    (item) => item.id === subject.prerequisite,
                  );
                  const locked =
                    prerequisite && !state.unlocked.includes(prerequisite.id);
                  const progress = researchProgress(
                    content,
                    world,
                    nationId,
                    subject,
                  );
                  const status = known
                    ? "已掌握"
                    : researching
                      ? "研究中"
                      : locked
                        ? "前置未成"
                        : "可研究";
                  const connects =
                    prerequisite &&
                    prerequisite.tier === tier - 1 &&
                    prerequisite.route === subject.route &&
                    prerequisite.category === subject.category;
                  return (
                    <div
                      className={`technology-node-wrap${connects ? " has-prerequisite" : ""}`}
                      key={subject.id}
                    >
                      <button
                        className={`technology-node ${known ? "is-known" : researching ? "is-researching" : locked ? "is-locked" : "is-ready"}${selectedId === subject.id ? " is-selected" : ""}`}
                        aria-pressed={selectedId === subject.id}
                        aria-label={`${subject.name} · ${status} · 进度 ${progress.toFixed(0)} / ${subject.cost}`}
                        title={`${subject.name} · ${status}${prerequisite ? ` · 前置：${prerequisite.name}` : ""}`}
                        onClick={() => onSelect(subject.id)}
                      >
                        <strong>{subject.name}</strong>
                        <span className="technology-node-meta">
                          <small>
                            {known ? "✓ " : researching ? "◷ " : ""}
                            {status}
                          </small>
                          <small>
                            {progress.toFixed(0)} / {subject.cost}
                          </small>
                        </span>
                        <span
                          className="technology-node-progress"
                          aria-hidden="true"
                        >
                          <i
                            style={{
                              width: `${Math.min(100, (progress / subject.cost) * 100)}%`,
                            }}
                          />
                        </span>
                      </button>
                    </div>
                  );
                })}
              {!route.subjects.some((subject) => subject.tier === tier) && (
                <span className="technology-stage-empty">—</span>
              )}
            </div>
          ))}
        </section>
      ))}
      {!routes.length && (
        <p className="technology-no-results">此分类暂无科技。</p>
      )}
    </div>
  );
}
