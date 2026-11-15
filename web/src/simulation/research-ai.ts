import type { Content } from "../definitions/types";
import type { ResearchCategory } from "../definitions/research";
import type { WorldState } from "./state";
import {
  researchSubjects,
  startResearch,
  enactIdea,
  ideaSlots,
  recruitTalent,
  assignTalent,
} from "./research";
/** AI grows towards one funded team per category, using the same recruitment and research commands. */
export function tickResearchAI(
  content: Content,
  world: WorldState,
  playerNationId: string,
): void {
  const subjects = researchSubjects(content);
  const categories: ResearchCategory[] = [
    "civil",
    "military",
    "craft",
    "humanities",
  ];
  for (const nation of Object.values(world.nations)) {
    if (
      nation.id === playerNationId ||
      !Object.values(world.settlements).some((c) => c.owner === nation.id)
    )
      continue;
    const adopt = (next: WorldState) => {
      world.research = next.research;
      nation.treasury = next.nations[nation.id].treasury;
    };
    const learnedIdea = content.ideas.find(
      (i) =>
        world.research.nations[nation.id].unlocked.includes(i.id) &&
        !world.research.nations[nation.id].enacted.includes(i.id),
    );
    if (
      learnedIdea &&
      world.research.nations[nation.id].enacted.length <
        ideaSlots(content, world, nation.id)
    )
      adopt(enactIdea(content, world, nation.id, learnedIdea.id));
    if (nation.treasury < 30) continue;
    const desired = nation.treasury > 150 ? 4 : nation.treasury > 80 ? 2 : 1;
    const staff = Object.values(world.research.talents).filter(
      (t) =>
        t.nationId === nation.id &&
        t.recruitedMonth !== null &&
        t.role === "research",
    );
    if (staff.length < desired) {
      const candidate = Object.values(world.research.talents)
        .filter((t) => t.nationId === nation.id && t.recruitedMonth === null)
        .sort(
          (a, b) =>
            Number(staff.some((t) => t.specialty === a.specialty)) -
              Number(staff.some((t) => t.specialty === b.specialty)) ||
            b.scholarship - a.scholarship,
        )[0];
      if (candidate) {
        adopt(recruitTalent(world, nation.id, candidate.id));
        adopt(assignTalent(world, nation.id, candidate.id, "research"));
      }
    }
    const localRoutes = new Set(
      content.scenario.settlements
        .filter((c) => world.settlements[c.id].owner === nation.id)
        .flatMap((c) =>
          content.buildings
            .filter(
              (b) =>
                b.specialty === c.specialty ||
                b.specialties?.includes(c.specialty),
            )
            .map((b) => b.route),
        ),
    );
    for (const category of categories) {
      const state = world.research.nations[nation.id];
      if (
        state.groups.some(
          (g) =>
            subjects.find((s) => s.id === g.targetId)?.category === category,
        )
      )
        continue;
      const leader = Object.values(world.research.talents)
        .filter(
          (t) =>
            t.nationId === nation.id &&
            t.role === "research" &&
            t.recruitedMonth !== null &&
            !t.busy &&
            !state.groups.some((g) => g.leaderId === t.id),
        )
        .sort(
          (a, b) =>
            Number(b.specialty === category) -
              Number(a.specialty === category) || b.scholarship - a.scholarship,
        )[0];
      if (!leader) break;
      const topic = subjects
        .filter(
          (t) =>
            t.category === category &&
            !state.unlocked.includes(t.id) &&
            (!t.prerequisite || state.unlocked.includes(t.prerequisite)),
        )
        .sort(
          (a, b) =>
            a.tier - b.tier ||
            Number(localRoutes.has(b.route)) - Number(localRoutes.has(a.route)),
        )[0];
      if (topic)
        adopt(startResearch(content, world, nation.id, topic.id, leader.id));
    }
  }
}
