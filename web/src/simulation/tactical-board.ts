import type { Content } from "../definitions/types";
import type { Battle, TacticalUnit } from "./military-state";
import { hexDistance, hexNeighbors } from "./tactical-grid";

import {
  alive,
  BOARD_COLUMNS,
  tacticalRows,
  tacticalTerrain,
} from "./tactical-field";
import { tacticalVisibility } from "./tactical-visibility";
export {
  alive,
  BOARD_COLUMNS,
  tacticalRows,
  tacticalTerrain,
} from "./tactical-field";
export { recordTacticalAction, tacticalLog } from "./tactical-events";
export const distance = hexDistance;
export function maxActionPoints(
  content: Content,
  unit: Pick<TacticalUnit, "typeId">,
) {
  const type = content.units.find((type) => type.id === unit.typeId);
  return (
    type?.actionPoints ??
    (type?.category === "cavalry"
      ? content.tactics.cavalryActionPoints
      : content.tactics.baseActionPoints)
  );
}
/** Pure fallback supports snapshots written before tactical action points existed. */
export function remainingActionPoints(content: Content, unit: TacticalUnit) {
  return unit.actionPoints ?? (unit.acted ? 0 : maxActionPoints(content, unit));
}
export function engaged(
  battle: Battle,
  unit: TacticalUnit,
  position = unit,
  knownUnitIds?: Set<string>,
) {
  return battle.tactical!.units.some(
    (enemy) =>
      enemy.side !== unit.side &&
      (!knownUnitIds || knownUnitIds.has(enemy.id)) &&
      alive(enemy) &&
      distance(position, enemy) === 1,
  );
}
export function controllingStatus(battle: Battle, unit: TacticalUnit) {
  return (
    unit.statuses?.find(
      (status) => status.kind === "doubt" && status.remainingActivations > 0,
    ) ??
    unit.statuses?.find(
      (status) =>
        status.kind === "provoke" &&
        status.remainingActivations > 0 &&
        battle.tactical!.units.some(
          (source) =>
            source.id === status.sourceId &&
            source.side !== unit.side &&
            alive(source),
        ),
    )
  );
}
/** Entering an enemy's adjacent tile ends a path. An engaged unit cannot move out. */
export function movementCosts(
  content: Content,
  battle: Battle,
  unit: TacticalUnit,
) {
  return movementSearch(content, battle, unit).costs;
}
function movementSearch(content: Content, battle: Battle, unit: TacticalUnit) {
  const visible = tacticalVisibility(content, battle, unit.side).unitIds;
  const costs = new Map<string, number>([[`${unit.x},${unit.y}`, 0]]);
  const previous = new Map<string, string>();
  if (engaged(battle, unit, unit, visible)) return { costs, previous };
  const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
  const max = remainingActionPoints(content, unit);
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    if (current.cost !== costs.get(`${current.x},${current.y}`)) continue;
    if (engaged(battle, unit, { ...unit, ...current }, visible)) continue;
    for (const { x, y } of hexNeighbors(
      current,
      BOARD_COLUMNS,
      tacticalRows(battle),
    )) {
      if (
        battle.tactical!.units.some(
          (other) =>
            other.id !== unit.id &&
            visible.has(other.id) &&
            alive(other) &&
            other.x === x &&
            other.y === y,
        )
      )
        continue;
      const next =
        current.cost +
        (tacticalTerrain(content, battle, x, y) === "plain"
          ? content.tactics.plainMoveCost
          : content.tactics.roughMoveCost);
      const key = `${x},${y}`;
      if (next > max || next >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, next);
      previous.set(key, `${current.x},${current.y}`);
      queue.push({ x, y, cost: next });
    }
  }
  return { costs, previous };
}
/** Planned route uses current sight only; execution may truncate it on contact. Includes the origin. */
export function tacticalMovementPath(
  content: Content,
  battle: Battle,
  unit: TacticalUnit,
  x: number,
  y: number,
) {
  const origin = { x: unit.x, y: unit.y, cost: 0 };
  if (battle.tactical?.phase === "deployment")
    return [origin, { x, y, cost: 0 }];
  const { costs, previous } = movementSearch(content, battle, unit);
  let key = `${x},${y}`;
  if (!costs.has(key)) return [];
  const path: { x: number; y: number; cost: number }[] = [];
  const start = `${unit.x},${unit.y}`;
  while (key !== start) {
    const from = previous.get(key);
    if (!from) return [];
    const [px, py] = key.split(",").map(Number);
    path.unshift({ x: px, y: py, cost: costs.get(key)! - costs.get(from)! });
    key = from;
  }
  return [origin, ...path];
}
export function spendActionPoints(
  content: Content,
  unit: TacticalUnit,
  amount: number,
) {
  unit.actionPoints = Math.max(
    0,
    remainingActionPoints(content, unit) - amount,
  );
  unit.acted = unit.actionPoints === 0;
}
export function unitName(content: Content, unit: TacticalUnit) {
  return (
    content.units.find((type) => type.id === unit.typeId)?.name ?? unit.typeId
  );
}
