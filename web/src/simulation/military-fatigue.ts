import type { Content } from "../definitions/types";
import type { Army, Regiment } from "./military-state";

/** Only the decision to attack during recovery creates a combat penalty. */
export function applyOffensiveFatigue(
  content: Content,
  army: Army,
  day: number,
) {
  const rules = content.warfare;
  for (const unit of army.units) {
    if (
      unit.lastBattleDay !== undefined &&
      day - unit.lastBattleDay < rules.recentCombatDays
    )
      unit.offensiveFatigue = Math.min(
        rules.maximumOffensiveFatigue,
        (unit.offensiveFatigue ?? 0) + rules.offensiveFatiguePerAttack,
      );
  }
}

export function fatigueMultiplier(content: Content, unit: Regiment) {
  return (
    1 -
    Math.min(
      content.warfare.maximumOffensiveFatigue,
      unit.offensiveFatigue ?? 0,
    )
  );
}

/** Recover only while actually in the pool; waiting on an expedition is not rest. */
export function recoverFatigue(content: Content, army: Army) {
  if (army.expedition || !["idle", "resting"].includes(army.status)) return;
  const recovery =
    content.warfare.offensiveFatiguePerAttack /
    content.warfare.fatigueRecoveryDays;
  for (const unit of army.units)
    unit.offensiveFatigue = Math.max(
      0,
      (unit.offensiveFatigue ?? 0) - recovery,
    );
}

export function recordCombat(army: Army, day: number) {
  for (const unit of army.units) unit.lastBattleDay = day;
}
