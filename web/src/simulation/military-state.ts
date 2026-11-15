import type { Content } from "../definitions/types";
export interface Regiment {
  id: string;
  typeId: string;
  cadre: number;
  levy: number;
  morale: number;
  training: number;
  cadreTarget?: number;
  lastBattleDay?: number;
  offensiveFatigue?: number;
}
export interface Army {
  id: string;
  nationId: string;
  name: string;
  cityId: string;
  generalId: string | null;
  units: Regiment[];
  status: "idle" | "marching" | "battle" | "resting" | "returning";
  destination: string | null;
  remainingDays: number;
  arrivedDay: number;
  expedition: boolean;
}
export interface TacticalUnit extends Regiment {
  armyId: string | null;
  side: "attacker" | "defender";
  x: number;
  y: number;
  acted: boolean;
  actionPoints: number;
  maxActionPoints: number;
  strategyUsed: boolean;
  guarding: boolean;
  statuses: TacticalStatus[];
  actionProgress: number;
  activationCount: number;
  attackMultiplier?: number;
  defenseMultiplier?: number;
}
export interface TacticalStatus {
  kind: "doubt" | "provoke";
  remainingActivations: number;
  sourceId?: string;
}
export interface TacticalState {
  turn: number;
  phase: "deployment" | "combat" | "finished";
  selectedId: string | null;
  units: TacticalUnit[];
  log: string[];
  /** Information known at the time of an event, never reconstructed from current sight. */
  observedLog?: { attacker: string[]; defender: string[] };
  winner: "attacker" | "defender" | null;
  activeSide: "attacker" | "defender";
  activeUnitId: string | null;
  clock: number;
  activation: number;
  lastAction: TacticalAction | null;
}
export interface TacticalAction {
  sequence: number;
  kind:
    "move" | "melee" | "shoot" | "strategy" | "guard" | "wait" | "skip" | "end";
  unitId: string;
  targetId?: string;
  strategyId?: string;
  path?: { x: number; y: number; cost: number }[];
  /** Observed participants before resolution; for movement, observed every executed step. */
  visibleTo?: TacticalUnit["side"][];
}
export interface Battle {
  id: string;
  cityId: string;
  attackerId: string;
  defenderId: string;
  attackerArmies: string[];
  defenderArmies: string[];
  kind: "field";
  phase: "preparation" | "ready" | "resolved";
  elapsed: number;
  preparationDays: number;
  startedDay: number;
  order: number;
  garrison: number;
  result: string | null;
  tactical: TacticalState | null;
}
export interface MilitaryState {
  armies: Record<string, Army>;
  battles: Record<string, Battle>;
  nextId: number;
  day: number;
  rng: number;
  activeBattleId: string | null;
  log: string[];
}
export function createMilitary(content: Content): MilitaryState {
  const state: MilitaryState = {
    armies: {},
    battles: {},
    nextId: 1,
    day: 0,
    rng: 17623,
    activeBattleId: null,
    log: [],
  };
  for (const nation of content.scenario.nations) {
    const city = content.scenario.settlements.find(
      (c) => c.owner === nation.id,
    );
    if (!city) continue;
    const type =
      content.units.find((u) => u.id === "infantry") ?? content.units[0];
    const id = `army-${state.nextId++}`;
    state.armies[id] = {
      id,
      nationId: nation.id,
      name: `${nation.name}国中军`,
      cityId: city.id,
      generalId: null,
      units: type
        ? [
            {
              id: `unit-${state.nextId++}`,
              typeId: type.id,
              cadre: type.cadre,
              levy: type.levy,
              morale: 80,
              training: 55,
            },
          ]
        : [],
      status: "idle",
      destination: null,
      remainingDays: 0,
      arrivedDay: -1,
      expedition: false,
    };
  }
  return state;
}
export function randomMilitary(state: MilitaryState): number {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}
export function logMilitary(state: MilitaryState, text: string) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 60);
}
export function hasManualBattle(world: { military: MilitaryState }) {
  return world.military.activeBattleId !== null;
}
