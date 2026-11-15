import { useState } from "react";
import { CATEGORY_NAMES, type ResearchCategory } from "../definitions/research";
import type { ResearchPanelProps } from "./ResearchShared";
import {
  researchScale,
  researchSubjects,
  researchUpkeep,
} from "../simulation/research";
import { ResearchGroupsRail } from "./research/ResearchGroupsRail";
import { ResearchDetailDock } from "./research/ResearchDetailDock";
import { TechnologyRoutes } from "./research/TechnologyRoutes";
import { availableResearchLeaders } from "./research/useResearchAssignment";
import { technologyRoutes } from "./research/technology-routes";
import "./research/technology-screen.css";

/** Coordinates selection; each pane owns its presentation, while simulation owns research. */
export function ResearchPanel(props: ResearchPanelProps) {
  const { content, world, nationId } = props;
  const state = world.research.nations[nationId];
  const [category, setCategory] = useState<ResearchCategory>("civil");
  const [selectedId, setSelectedId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const categories = (Object.keys(CATEGORY_NAMES) as ResearchCategory[]).filter(
    (key) => content.technologies.some((item) => item.category === key),
  );
  const currentCategory = categories.includes(category)
    ? category
    : (categories[0] ?? "civil");
  const routes = technologyRoutes(content, currentCategory);
  const subject =
    researchSubjects(content).find((item) => item.id === selectedId) ??
    routes
      .flatMap((route) => route.subjects)
      .find((item) => !state.unlocked.includes(item.id)) ??
    routes[0]?.subjects[0];
  const known = content.technologies.filter((item) =>
    state.unlocked.includes(item.id),
  ).length;
  const focusedLeaderId =
    (world.research.talents[leaderId]?.role === "research" ? leaderId : "") ||
    state.groups.find((group) => group.targetId === subject?.id)?.leaderId ||
    availableResearchLeaders(world, nationId)[0]?.id ||
    "";

  const selectSubject = (id: string) => {
    const target = researchSubjects(content).find((item) => item.id === id);
    if (!target) return;
    setSelectedId(id);
    if (content.technologies.some((item) => item.id === id))
      setCategory(target.category);
  };
  return (
    <section className="technology-screen" aria-label="科技与研究组">
      <div className="technology-summary" aria-label="科研概况">
        <span>
          百工技艺 <b>{known}</b> / {content.technologies.length}
        </span>
        <span>
          科技组规模 <b>{researchScale(content, world, nationId).toFixed(0)}</b>
        </span>
        <span>
          计划月费 <b>{researchUpkeep(content, world, nationId).toFixed(1)}</b>{" "}
          粮
        </span>
        <span>
          科研实付{" "}
          <b>
            {Math.round(
              world.nations[nationId].operatingCoverage.research * 100,
            )}
            %
          </b>
        </span>
        <small>同类知识启发 · 世界传播加速</small>
      </div>
      <div className="technology-workspace">
        <ResearchGroupsRail
          {...props}
          leaderId={focusedLeaderId}
          onSelect={(id, targetId) => {
            setLeaderId(id);
            if (targetId) selectSubject(targetId);
          }}
        />
        <section className="technology-catalogue" aria-label="科技面板">
          <div className="technology-navigation">
            <nav aria-label="科技分类">
              {categories.map((key) => (
                <button
                  key={key}
                  aria-pressed={currentCategory === key}
                  onClick={() => {
                    setCategory(key);
                    setSelectedId("");
                  }}
                >
                  {CATEGORY_NAMES[key]}
                  <small>
                    {
                      content.technologies.filter(
                        (item) => item.category === key,
                      ).length
                    }
                  </small>
                </button>
              ))}
            </nav>
          </div>
          <TechnologyRoutes
            content={content}
            world={world}
            nationId={nationId}
            routes={routes}
            selectedId={subject?.id ?? ""}
            onSelect={selectSubject}
          />
          <div className="technology-catalogue-note">
            <span>{routes.length} 条路线 · 点选科技查看下方详情</span>
            <span>理念研究见「百家」</span>
          </div>
        </section>
        <ResearchDetailDock
          {...props}
          subject={subject}
          leaderId={focusedLeaderId}
          onLeaderChange={setLeaderId}
          onSelectSubject={selectSubject}
        />
      </div>
    </section>
  );
}
