import { initializeMilitary } from "./military";
import { createResearch, type ResearchState } from "./research";
import { createMilitary, type MilitaryState } from "./military-state";
import { createCivic, manpowerCapacity, type CivicState } from "./civic";
import type { Content, DateValue } from "../definitions/types";
import { createDiplomacy, type DiplomacyState } from "./diplomacy";

export interface BuildingState {
  level: number;
  effectiveLevel: number;
}
export interface Construction {
  buildingId: string;
  targetLevel: number;
  remainingDays: number;
}
export interface SettlementState {
  id: string;
  owner: string;
  scale: number;
  governance: number;
  buildings: Record<string, BuildingState>;
  construction: Construction | null;
}
export interface MonthReport {
  date: DateValue;
  income: number;
  required: number;
  requested: number;
  paid: number;
  coverage: number;
  closingTreasury: number;
  categories?: Record<
    string,
    { required: number; requested: number; paid: number; coverage: number }
  >;
}
export interface NationState {
  id: string;
  treasury: number;
  budget: { buildings: number; army: number; research: number };
  operatingCoverage: { buildings: number; army: number; research: number };
  manpower: number;
  lastReport: MonthReport | null;
}
export interface WorldState {
  date: DateValue;
  playerNationId: string;
  research: ResearchState;
  military: MilitaryState;
  civic: CivicState;
  diplomacy: DiplomacyState;
  nations: Record<string, NationState>;
  settlements: Record<string, SettlementState>;
}

export function createWorld(content: Content): WorldState {
  const world: WorldState = {
    date: { ...content.scenario.start },
    playerNationId: content.scenario.nations[0].id,
    research: createResearch(content),
    military: createMilitary(content),
    civic: createCivic(content),
    diplomacy: createDiplomacy(content),
    nations: Object.fromEntries(
      content.scenario.nations.map((nation) => [
        nation.id,
        {
          id: nation.id,
          treasury: nation.treasury,
          budget: {
            ...nation.budget,
            army: nation.budget.army ?? 1,
            research: nation.budget.research ?? 1,
          },
          operatingCoverage: { buildings: 1, army: 1, research: 1 },
          manpower: nation.manpower,
          lastReport: null,
        },
      ]),
    ),
    settlements: Object.fromEntries(
      content.scenario.settlements.map((city) => [
        city.id,
        {
          id: city.id,
          owner: city.owner,
          scale: city.scale,
          governance: city.governance,
          buildings: Object.fromEntries(
            Object.entries(city.buildings).map(([id, level]) => [
              id,
              { level, effectiveLevel: level },
            ]),
          ),
          construction: null,
        },
      ]),
    ),
  };
  // Initial troops are recruited after the authored reserve is capped, exactly once.
  for (const nation of Object.values(world.nations))
    nation.manpower = Math.min(
      nation.manpower,
      manpowerCapacity(content, world, nation.id),
    );
  initializeMilitary(world);
  return world;
}

export function copyWorld(world: WorldState): WorldState {
  return structuredClone(world);
}
