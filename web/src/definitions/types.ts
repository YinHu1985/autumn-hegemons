import type { NamedModifierDefinition } from "./modifier-definitions";
import type { TerrainDefinition, SpecialtyDefinition } from "./geography";
import type { TechnologyDefinition, IdeaDefinition } from "./research";
import type { UnitDefinition } from "./military";
import type { EventDefinition, EventPoolDefinition } from "./events";
import type { WarfareRules } from "./warfare";
import type { TacticalRules } from "./tactics";
import type { RoadDefinition } from "./roads";
import type { DiplomacyRules } from "./diplomacy";
export type ResourceKind = "treasury" | "capacity";
export interface Good {
  id: string;
  name: string;
  kind: ResourceKind;
}
export interface BuildingLevel {
  technology?: string;
  modifiers?: Record<string, number>;
  cost: number;
  days: number;
  upkeep: number;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
}
export interface Building {
  route?: string;
  description?: string;
  id: string;
  name: string;
  specialty?: string;
  specialties?: string[];
  stage: 0 | 1;
  levels: BuildingLevel[];
}
export interface DateValue {
  year: number;
  month: number;
  day: number;
}
export interface NationStart {
  description?: string;
  color?: string;
  id: string;
  name: string;
  treasury: number;
  baseResources: Record<string, number>;
  budget: { buildings: number; army?: number; research?: number };
  manpower: number;
}
export interface SettlementStart {
  id: string;
  name: string;
  owner: string;
  map: { x: number; y: number };
  terrain: string;
  specialty: string;
  scale: number;
  governance: number;
  buildings: Record<string, number>;
}
export interface Scenario {
  /** Optional for legacy saves and imported content packs. */
  id?: string;
  name?: string;
  description?: string;
  recommendedNations?: string[];
  start: DateValue;
  nations: NationStart[];
  settlements: SettlementStart[];
  /** Omitted in older saves; an explicit empty list disables all land connections. */
  roads?: RoadDefinition[];
}
export interface Content {
  diplomacy: DiplomacyRules;
  tactics: TacticalRules;
  warfare: WarfareRules;
  terrains: TerrainDefinition[];
  specialties: SpecialtyDefinition[];
  goods: Good[];
  buildings: Building[];
  scenario: Scenario;
  technologies: TechnologyDefinition[];
  ideas: IdeaDefinition[];
  units: UnitDefinition[];
  events: EventDefinition[];
  eventPools: EventPoolDefinition[];
  modifierDefinitions: NamedModifierDefinition[];
}
export interface ContentTexts {
  diplomacy: string;
  tactics: string;
  warfare: string;
  terrains: string;
  specialties: string;
  goods: string;
  buildings: string;
  scenario: string;
  technologies: string;
  ideas: string;
  units: string;
  events: string;
  eventPools: string;
  modifierDefinitions: string;
}

export const CONTENT_FILES = [
  "goods",
  "specialties",
  "terrains",
  "buildings",
  "scenario",
  "technologies",
  "ideas",
  "units",
  "events",
  "eventPools",
  "modifierDefinitions",
  "warfare",
  "tactics",
  "diplomacy",
] as const;
