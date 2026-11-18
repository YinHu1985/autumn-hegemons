import type { Content } from "../definitions/types";
import { emitEventFact } from "./events/state";
import type {
  ResearchCategory,
  TechnologyDefinition,
} from "../definitions/research";
import type { WorldState } from "./state";
import { copyWorld } from "./state";
import { calculateEconomy } from "./economy";
import type { ResearchState, ResearchGroup } from "./research-state";
import { absoluteMonth, researchRandom } from "./research-state";
import { generateTalent, refreshCandidates } from "./talents";
import { cancelDiplomacyTasksForTalent } from "./diplomacy";
import { researcherEffectiveness } from "./research-aptitude";
import { resolveStat } from "./modifier-query";
import { applyCompletionEffects } from "./completion-effects";
export { researchModifier } from "./research-modifiers";
export { isIdeaUnlocked, unlockIdea, enactIdea, ideaSlots } from "./ideas";
export {
  researcherAptitude,
  researchSpecialtyMultiplier,
  researcherEffectiveness,
} from "./research-aptitude";
export type {
  ResearchState,
  ResearchGroup,
  Talent,
  TalentRole,
} from "./research-state";
export { recruitTalent, assignTalent, refreshTalentPool } from "./talents";

export function createResearch(content: Content): ResearchState {
  const state: ResearchState = {
    nations: {},
    talents: {},
    seed: 73917,
    nextId: 1,
  };
  for (const nation of content.scenario.nations) {
    state.nations[nation.id] = {
      unlocked: (content.technologies ?? [])
        .filter((t) => ["agriculture_1", "infantry_1"].includes(t.id))
        .map((t) => t.id),
      unlockedIdeas: [],
      progress: {},
      bonuses: {},
      enacted: [],
      groups: [],
      lastRefresh: absoluteMonth(content.scenario.start),
      notices: [],
    };
    for (let i = 0; i < 3; i++) {
      const talent = generateTalent(
        state,
        nation.id,
        absoluteMonth(content.scenario.start),
      );
      talent.role = (["advisor", "general", "research"] as const)[i];
    }
    refreshCandidates(state, nation.id, absoluteMonth(content.scenario.start));
  }
  return state;
}
export function researchSubjects(content: Content): TechnologyDefinition[] {
  return content.technologies;
}
export function hasTechnology(
  world: WorldState,
  nationId: string,
  id: string,
): boolean {
  return world.research.nations[nationId]?.unlocked.includes(id) ?? false;
}
export function researchScale(
  content: Content,
  world: WorldState,
  nationId: string,
): number {
  return resolveStat(content, world, { nationId }, "research_scale", 10, {
    min: 1,
    additional: calculateEconomy(content, world, nationId)
      .modifierContributions,
  }).value;
}
export function categorySeats(
  content: Content,
  world: WorldState,
  nationId: string,
  category: ResearchCategory,
): number {
  return resolveStat(
    content,
    world,
    { nationId },
    `research.seats.${category}`,
    1,
    { min: 1 },
  ).value;
}
export function inspiration(
  content: Content,
  world: WorldState,
  nationId: string,
  target: TechnologyDefinition,
): number {
  const state = world.research.nations[nationId];
  const count = content.technologies.filter(
    (t) =>
      state.unlocked.includes(t.id) &&
      t.category === target.category &&
      t.tier === target.tier - 1,
  ).length;
  return Math.min(
    target.cost * target.inspirationCap,
    count * target.inspiration + (state.bonuses[target.id] ?? 0),
  );
}
export function addResearchInspiration(
  content: Content,
  world: WorldState,
  nationId: string,
  targetId: string,
  amount: number,
): void {
  const t = researchSubjects(content).find((t) => t.id === targetId);
  if (!t || !Number.isFinite(amount) || amount < 0) return;
  const state = world.research.nations[nationId];
  state.bonuses[targetId] = Math.min(
    t.cost * t.inspirationCap,
    (state.bonuses[targetId] ?? 0) + amount,
  );
}
export function worldKnowledge(
  content: Content,
  world: WorldState,
  id: string,
): number {
  const alive = content.scenario.nations.filter((n) =>
    Object.values(world.settlements).some((c) => c.owner === n.id),
  );
  return alive.length
    ? alive.filter((n) => hasTechnology(world, n.id, id)).length / alive.length
    : 0;
}
export function researchProgress(
  content: Content,
  world: WorldState,
  nationId: string,
  target: TechnologyDefinition,
): number {
  if (hasTechnology(world, nationId, target.id)) return target.cost;
  return Math.min(
    target.cost,
    (world.research.nations[nationId].progress[target.id] ?? 0) +
      inspiration(content, world, nationId, target),
  );
}
export function groupMonthlyProgress(
  content: Content,
  world: WorldState,
  nationId: string,
  group: ResearchGroup,
  funded = true,
): number {
  const t = researchSubjects(content).find((t) => t.id === group.targetId);
  const leader = world.research.talents[group.leaderId];
  if (!t || !leader) return 0;
  const same = world.research.nations[nationId].groups.filter(
    (g) =>
      researchSubjects(content).find((s) => s.id === g.targetId)?.category ===
      t.category,
  ).length;
  const seats = categorySeats(content, world, nationId, t.category);
  const penalty = Math.min(1, (seats / same) ** 2);
  const economy = calculateEconomy(content, world, nationId);
  const efficiency = resolveStat(
    content,
    world,
    { nationId },
    "research_efficiency",
    1,
    {
      min: 0,
      additional: economy.modifierContributions,
    },
  ).value;
  const investment = funded ? group.fundedInvestment : group.investment;
  const scale = resolveStat(
    content,
    world,
    { nationId },
    "research_scale",
    10,
    {
      min: 1,
      additional: economy.modifierContributions,
    },
  ).value;
  // A shrinking soft cap keeps existing funding, but excess scale reduces its efficiency.
  // Use already funded investment, not today's slider, to prevent budget-switch exploits.
  const scalePenalty = Math.min(1, (scale / Math.max(0.01, investment)) ** 2);
  return (
    investment *
    scalePenalty *
    researcherEffectiveness(t, leader) *
    efficiency *
    penalty *
    (1 + worldKnowledge(content, world, t.id) * 3)
  );
}
export function researchUpkeep(
  content: Content,
  world: WorldState,
  nationId: string,
): number {
  return world.research.nations[nationId].groups.reduce((sum, g) => {
    const t = researchSubjects(content).find((t) => t.id === g.targetId);
    return sum + (t ? 2 + g.investment * t.upkeep : 0);
  }, 0);
}
export function fundResearchMonth(world: WorldState, nationId: string): void {
  for (const group of world.research.nations[nationId].groups)
    group.fundedInvestment =
      group.investment * world.nations[nationId].operatingCoverage.research;
}
export function startResearch(
  content: Content,
  world: WorldState,
  nationId: string,
  targetId: string,
  leaderId: string,
): WorldState {
  const subject = researchSubjects(content).find((t) => t.id === targetId);
  const leader = world.research.talents[leaderId];
  const state = world.research.nations[nationId];
  if (!subject) throw new Error("课题不存在");
  if (state.unlocked.includes(targetId)) throw new Error("已经掌握这项知识");
  if (subject.prerequisite && !state.unlocked.includes(subject.prerequisite))
    throw new Error("尚未掌握直系前置科技");
  if (
    !leader ||
    leader.nationId !== nationId ||
    leader.role !== "research" ||
    leader.recruitedMonth === null ||
    leader.busy
  )
    throw new Error("需要一名空闲科研人才");
  if (
    state.groups.some((g) => g.targetId === targetId || g.leaderId === leaderId)
  )
    throw new Error("课题或负责人已经在研究组中");
  const next = copyWorld(world);
  next.research.nations[nationId].groups.push({
    id: `group_${next.research.nextId++}`,
    leaderId,
    targetId,
    investment: Math.min(5, researchScale(content, world, nationId)),
    fundedInvestment: 0,
  });
  return next;
}
export function setResearchInvestment(
  content: Content,
  world: WorldState,
  nationId: string,
  id: string,
  value: number,
): WorldState {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > researchScale(content, world, nationId)
  )
    throw new Error("投入超出研究组规模");
  const next = copyWorld(world);
  const g = next.research.nations[nationId].groups.find((g) => g.id === id);
  if (!g) throw new Error("研究组不存在");
  g.investment = value;
  return next;
}
export function stopResearch(
  world: WorldState,
  nationId: string,
  id: string,
): WorldState {
  const next = copyWorld(world);
  next.research.nations[nationId].groups = next.research.nations[
    nationId
  ].groups.filter((g) => g.id !== id);
  return next;
}
export function tickResearchMonth(content: Content, world: WorldState): void {
  // Snapshot all gains before unlocking any nation, so world diffusion is independent of nation order.
  const gains = new Map<string, number>();
  for (const [id, state] of Object.entries(world.research.nations))
    for (const group of state.groups)
      gains.set(group.id, groupMonthlyProgress(content, world, id, group));
  const subjects = researchSubjects(content);
  for (const [id, state] of Object.entries(world.research.nations)) {
    for (const group of [...state.groups]) {
      const target = subjects.find((t) => t.id === group.targetId);
      if (!target) continue;
      if (state.unlocked.includes(target.id)) {
        state.groups = state.groups.filter((g) => g.id !== group.id);
        continue;
      }
      state.progress[target.id] =
        (state.progress[target.id] ?? 0) + (gains.get(group.id) ?? 0);
      if (researchProgress(content, world, id, target) >= target.cost) {
        state.unlocked.push(target.id);
        applyCompletionEffects(
          content,
          world,
          id,
          target.completionEffects ?? [],
          { kind: "technology", id: target.id, name: target.name },
        );
        state.groups = state.groups.filter((g) => g.id !== group.id);
        state.notices.unshift(`研究完成：${target.name}`);
        emitEventFact(world, {
          type: "research_completed",
          nationId: id,
          subjectId: target.id,
        });
      }
    }
    const month = absoluteMonth(world.date);
    if (month - state.lastRefresh >= 36)
      refreshCandidates(world.research, id, month);
    for (const talent of Object.values(world.research.talents))
      if (
        talent.nationId === id &&
        talent.recruitedMonth !== null &&
        month - talent.recruitedMonth >= 240 &&
        researchRandom(world.research) < 0.008
      ) {
        state.notices.unshift(`${talent.name}谢世，所任职务已空缺。`);
        state.groups = state.groups.filter((g) => g.leaderId !== talent.id);
        for (const army of Object.values(world.military?.armies ?? {}))
          if (army.generalId === talent.id) army.generalId = null;
        cancelDiplomacyTasksForTalent(world, talent.id);
        delete world.research.talents[talent.id];
      }
    state.notices = state.notices.slice(0, 12);
  }
}
