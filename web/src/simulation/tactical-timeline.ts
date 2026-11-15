import type { Content } from "../definitions/types";
import type { Battle, TacticalUnit } from "./military-state";
import { alive, maxActionPoints, recordTacticalAction } from "./tactical-board";
import { checkOutcome } from "./tactical-combat";
import { tacticalObservationAudience } from "./tactical-visibility";

const EPSILON = 1e-7;

/** Initiative is separate from AP: it controls when a unit acts, not its movement budget. */
export function tacticalInitiative(content: Content, unit: TacticalUnit) {
  const base =
    content.units.find((type) => type.id === unit.typeId)?.initiative ??
    content.tactics.baseInitiative;
  const centered = (value: number) =>
    (Math.max(0, Math.min(100, value)) - 50) / 50;
  return Math.max(
    0.01,
    base *
      (1 +
        centered(unit.training) * content.tactics.trainingInitiativeBonus +
        centered(unit.morale) * content.tactics.moraleInitiativeBonus),
  );
}

function progress(content: Content, unit: TacticalUnit) {
  return Math.max(
    0,
    Math.min(content.tactics.actionThreshold, unit.actionProgress),
  );
}

/** The order window sorts remaining bar length; ETA additionally accounts for initiative. */
export function tacticalTimeline(content: Content, battle: Battle) {
  const tactical = battle.tactical;
  if (!tactical) return [];
  return tactical.units
    .filter(alive)
    .map((unit) => {
      const value = progress(content, unit);
      const initiative = tacticalInitiative(content, unit);
      const remaining = content.tactics.actionThreshold - value;
      return {
        unitId: unit.id,
        progress: value,
        remaining,
        initiative,
        timeUntilAction: remaining / initiative,
        current: tactical.activeUnitId === unit.id,
      };
    })
    .sort(
      (a, b) =>
        a.remaining - b.remaining ||
        Number(b.current) - Number(a.current) ||
        b.initiative - a.initiative ||
        a.unitId.localeCompare(b.unitId),
    );
}

function readyUnit(
  content: Content,
  units: TacticalUnit[],
  values: Map<string, number>,
) {
  return units
    .filter(
      (unit) =>
        (values.get(unit.id) ?? 0) >= content.tactics.actionThreshold - EPSILON,
    )
    .sort(
      (a, b) =>
        tacticalInitiative(content, b) - tacticalInitiative(content, a) ||
        a.id.localeCompare(b.id),
    )[0];
}

/** Predict repeated activations with current morale/training held fixed; never mutate the battle. */
export function tacticalForecast(content: Content, battle: Battle, count = 12) {
  const tactical = battle.tactical;
  const forecast: {
    unitId: string;
    at: number;
    wait: number;
    initiative: number;
  }[] = [];
  if (!tactical || tactical.phase === "finished" || !Number.isFinite(count))
    return forecast;
  const units = tactical.units.filter(alive);
  const values = new Map(
    units.map((unit) => [unit.id, progress(content, unit)]),
  );
  const limit = Math.max(0, Math.min(1000, Math.floor(count)));
  let at = tactical.clock;
  const active = units.find((unit) => unit.id === tactical.activeUnitId);
  if (active && limit) {
    forecast.push({
      unitId: active.id,
      at,
      wait: 0,
      initiative: tacticalInitiative(content, active),
    });
    values.set(
      active.id,
      Math.max(0, values.get(active.id)! - content.tactics.actionThreshold),
    );
  }
  while (units.length && forecast.length < limit) {
    const wait = Math.max(
      0,
      Math.min(
        ...units.map(
          (unit) =>
            (content.tactics.actionThreshold - values.get(unit.id)!) /
            tacticalInitiative(content, unit),
        ),
      ),
    );
    at += wait;
    for (const unit of units)
      values.set(
        unit.id,
        Math.min(
          content.tactics.actionThreshold,
          values.get(unit.id)! + tacticalInitiative(content, unit) * wait,
        ),
      );
    const next = readyUnit(content, units, values);
    if (!next) break;
    forecast.push({
      unitId: next.id,
      at,
      wait,
      initiative: tacticalInitiative(content, next),
    });
    values.set(
      next.id,
      Math.max(0, values.get(next.id)! - content.tactics.actionThreshold),
    );
  }
  return forecast;
}

/** Finish only this unit's activation. Other full bars stay full and ready to act. */
export function finishTacticalActivation(
  content: Content,
  battle: Battle,
  record = true,
) {
  const tactical = battle.tactical!;
  const unit = tactical.units.find((item) => item.id === tactical.activeUnitId);
  if (!unit) return;
  unit.actionProgress = Math.max(
    0,
    unit.actionProgress - content.tactics.actionThreshold,
  );
  unit.actionPoints = 0;
  unit.acted = true;
  unit.statuses = unit.statuses
    .map((status) => ({
      ...status,
      remainingActivations: status.remainingActivations - 1,
    }))
    .filter((status) => status.remainingActivations > 0);
  tactical.activeUnitId = null;
  if (record)
    recordTacticalAction(battle, {
      kind: "end",
      unitId: unit.id,
      visibleTo: tacticalObservationAudience(content, battle, unit),
    });
  checkOutcome(battle);
}

/** Advance at a constant rate up to the first ready unit, then freeze for its decisions. */
export function tacticalAdvanceClock(
  content: Content,
  battle: Battle,
  delta: number,
) {
  if (!Number.isFinite(delta) || delta < 0)
    throw new Error("战术时间增量必须是非负数");
  const tactical = battle.tactical!;
  if (tactical.phase !== "combat" || tactical.activeUnitId) return;
  checkOutcome(battle);
  if (tactical.winner) return;
  const units = tactical.units.filter(alive);
  if (!units.length) return;
  const untilReady = Math.max(
    0,
    Math.min(
      ...units.map(
        (unit) =>
          (content.tactics.actionThreshold - progress(content, unit)) /
          tacticalInitiative(content, unit),
      ),
    ),
  );
  const elapsed = Math.min(delta, untilReady);
  tactical.clock += elapsed;
  tactical.turn =
    Math.floor(
      tactical.clock /
        (content.tactics.actionThreshold / content.tactics.baseInitiative),
    ) + 1;
  for (const unit of units)
    unit.actionProgress = Math.min(
      content.tactics.actionThreshold,
      progress(content, unit) + tacticalInitiative(content, unit) * elapsed,
    );
  checkOutcome(battle);
  if (tactical.winner) return;
  const next = readyUnit(
    content,
    units,
    new Map(units.map((unit) => [unit.id, unit.actionProgress])),
  );
  if (!next) return;
  next.actionProgress = content.tactics.actionThreshold;
  next.maxActionPoints = maxActionPoints(content, next);
  next.actionPoints = next.maxActionPoints;
  next.acted = false;
  next.strategyUsed = false;
  next.guarding = false;
  next.activationCount++;
  tactical.activeUnitId = next.id;
  tactical.activeSide = next.side;
  tactical.selectedId = next.id;
  tactical.activation++;
}
