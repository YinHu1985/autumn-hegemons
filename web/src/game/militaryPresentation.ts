import type { Content } from "../definitions/types";
import type { Army, Regiment } from "../simulation/military-state";
import type { WorldState } from "../simulation/state";

export function armyStatusLabel(army: Army): string {
  if (army.status === "battle") return army.expedition ? "远征中" : "迎战中";
  return {
    idle: "可调度",
    marching: "调动中",
    resting: "整训中",
    returning: "返程中",
  }[army.status];
}

export function recentCombatRemaining(
  content: Content,
  world: WorldState,
  unit: Regiment,
): number {
  if (unit.lastBattleDay === undefined) return 0;
  return Math.max(
    0,
    content.warfare.recentCombatDays -
      (world.military.day - unit.lastBattleDay),
  );
}

export function fatigueRecoveryRemaining(content: Content, unit: Regiment) {
  if (content.warfare.offensiveFatiguePerAttack <= 0) return 0;
  return Math.ceil(
    ((unit.offensiveFatigue ?? 0) / content.warfare.offensiveFatiguePerAttack) *
      content.warfare.fatigueRecoveryDays,
  );
}
