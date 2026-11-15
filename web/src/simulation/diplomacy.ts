import type { Content } from "../definitions/types";
import type { WorldState } from "./state";

export type DiplomaticTier = "hostile" | "discord" | "friendly" | "close";
export type DiplomaticRelation = DiplomaticTier | "self";

export interface DiplomaticMission {
  id: string;
  nationId: string;
  targetNationId: string;
  envoyId: string;
  actionId: string;
  totalDays: number;
  remainingDays: number;
}
/** Relationships are symmetric; missions are directed orders issued by a country. */
export interface DiplomacyState {
  relations: Array<{ nations: [string, string]; value: number }>;
  missions: DiplomaticMission[];
  nextId: number;
}

export function createDiplomacy(content: Content): DiplomacyState {
  const ids = content.scenario.nations.map((nation) => nation.id).sort();
  return {
    relations: ids.flatMap((a, index) =>
      ids.slice(index + 1).map((b) => ({
        nations: [a, b] as [string, string],
        value: content.diplomacy.center,
      })),
    ),
    missions: [],
    nextId: 1,
  };
}

export function relationValue(
  content: Content,
  world: Pick<WorldState, "diplomacy">,
  a: string,
  b: string,
): number {
  if (a === b) return content.diplomacy.maxRelation;
  return (
    world.diplomacy.relations.find(
      (relation) =>
        relation.nations.includes(a) && relation.nations.includes(b),
    )?.value ?? content.diplomacy.center
  );
}

/** Four hundred-point tiers, with +200 included in the highest tier. */
export function relationTier(value: number): DiplomaticTier {
  if (value < -100) return "hostile";
  if (value < 0) return "discord";
  if (value < 100) return "friendly";
  return "close";
}

export function diplomaticRelation(
  content: Content,
  world: Pick<WorldState, "diplomacy">,
  a: string,
  b: string,
): DiplomaticRelation {
  return a === b ? "self" : relationTier(relationValue(content, world, a, b));
}

/** Internal mutation shared by mission completion and yearly decay. */
export function changeRelation(
  content: Content,
  world: WorldState,
  a: string,
  b: string,
  change: number,
): number {
  if (a === b || !world.nations[a] || !world.nations[b])
    throw new Error("外交关系必须指定两个不同且存在的国家");
  if (!Number.isSafeInteger(change)) throw new Error("外交关系变化应为整数");
  let relation = world.diplomacy.relations.find(
    (entry) => entry.nations.includes(a) && entry.nations.includes(b),
  );
  if (!relation) {
    relation = {
      nations: [a, b].sort() as [string, string],
      value: content.diplomacy.center,
    };
    world.diplomacy.relations.push(relation);
  }
  relation.value = Math.max(
    content.diplomacy.minRelation,
    Math.min(content.diplomacy.maxRelation, relation.value + change),
  );
  return relation.value;
}

export {
  startDiplomaticMission,
  cancelDiplomaticMission,
  cancelDiplomacyTasksForTalent,
  tickDiplomacyDay,
  tickDiplomacyYear,
} from "./diplomatic-missions";
