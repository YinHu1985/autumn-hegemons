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
  isIdeaUnlocked,
  researcherEffectiveness,
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
  for (const nationId of Object.keys(world.nations)) {
    let nation = world.nations[nationId];
    if (
      nation.id === playerNationId ||
      !Object.values(world.settlements).some((c) => c.owner === nation.id)
    )
      continue;
    const adopt = (next: WorldState) => {
      // Commands may also apply idea actions to cities, modifiers or event state.
      // Commit the whole result and refresh references after replacing the snapshot.
      Object.assign(world, next);
      nation = world.nations[nationId];
    };
    const learnedIdea = content.ideas.find(
      (i) =>
        isIdeaUnlocked(content, world, nation.id, i.id) &&
        !world.research.nations[nation.id].enacted.includes(i.id),
    );
    if (
      learnedIdea &&
      world.research.nations[nation.id].enacted.length <
        ideaSlots(content, world, nation.id)
    )
      adopt(enactIdea(content, world, nation.id, learnedIdea.id));
    if (nation.treasury < 30) continue;
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
    const topicForCategory = (category: ResearchCategory) => {
      const state = world.research.nations[nation.id];
      return subjects
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
    };
    const desired = nation.treasury > 150 ? 4 : nation.treasury > 80 ? 2 : 1;
    const staff = Object.values(world.research.talents).filter(
      (t) =>
        t.nationId === nation.id &&
        t.recruitedMonth !== null &&
        t.role === "research",
    );
    if (staff.length < desired) {
      const futureTopics = categories
        .filter(
          (category) =>
            !world.research.nations[nation.id].groups.some(
              (group) =>
                subjects.find((subject) => subject.id === group.targetId)
                  ?.category === category,
            ),
        )
        .flatMap((category) => {
          const topic = topicForCategory(category);
          return topic ? [topic] : [];
        });
      const candidate = Object.values(world.research.talents)
        .filter(
          (t) =>
            futureTopics.length > 0 &&
            t.nationId === nation.id &&
            t.recruitedMonth === null,
        )
        .sort(
          (a, b) =>
            Math.max(
              ...futureTopics.map((topic) => researcherEffectiveness(topic, b)),
            ) -
              Math.max(
                ...futureTopics.map((topic) =>
                  researcherEffectiveness(topic, a),
                ),
              ) ||
            Number(staff.some((t) => t.specialty === a.specialty)) -
              Number(staff.some((t) => t.specialty === b.specialty)),
        )[0];
      if (candidate) {
        adopt(recruitTalent(world, nation.id, candidate.id));
        adopt(assignTalent(world, nation.id, candidate.id, "research"));
      }
    }
    for (const category of categories) {
      const state = world.research.nations[nation.id];
      if (
        state.groups.some(
          (g) =>
            subjects.find((s) => s.id === g.targetId)?.category === category,
        )
      )
        continue;
      const topic = topicForCategory(category);
      if (!topic) continue;
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
            researcherEffectiveness(topic, b) -
            researcherEffectiveness(topic, a),
        )[0];
      if (!leader) break;
      adopt(startResearch(content, world, nation.id, topic.id, leader.id));
    }
  }
}
