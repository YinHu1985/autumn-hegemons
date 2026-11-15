import type { Content } from "../definitions/types";
import { DEFAULT_TACTICAL_VISIBILITY } from "../definitions/tactical-visibility";
import type { Battle, TacticalUnit } from "./military-state";
import {
  alive,
  BOARD_COLUMNS,
  tacticalRows,
  tacticalTerrain,
} from "./tactical-field";
import { hexDistance, hexLine, type TacticalPosition } from "./tactical-grid";

export interface TacticalVisibility {
  tiles: Set<string>;
  unitIds: Set<string>;
}
const settings = (content: Content) =>
  content.tactics.visibility ?? DEFAULT_TACTICAL_VISIBILITY;
const tileKey = (position: TacticalPosition) => `${position.x},${position.y}`;
const inside = (position: TacticalPosition, rows: number) =>
  Number.isInteger(position.x) &&
  Number.isInteger(position.y) &&
  position.x >= 0 &&
  position.x < BOARD_COLUMNS &&
  position.y >= 0 &&
  position.y < rows;

export function tacticalVisionRange(
  content: Content,
  unit: Pick<TacticalUnit, "typeId">,
) {
  const definition = content.units.find((type) => type.id === unit.typeId);
  const config = settings(content);
  const range =
    definition?.vision ??
    (definition?.category === "cavalry"
      ? config.cavalryRange
      : config.baseRange);
  return Number.isFinite(range) ? Math.max(0, Math.floor(range)) : 0;
}

function canSeeTile(
  content: Content,
  battle: Battle,
  observer: TacticalUnit,
  target: TacticalPosition,
  range: number,
  rows: number,
) {
  const distance = hexDistance(observer, target);
  if (distance > range) return false;
  if (distance <= 1) return true;
  const config = settings(content);
  const terrain = tacticalTerrain(content, battle, target.x, target.y);
  if (
    config.concealmentTerrains.includes(terrain) &&
    distance > config.concealmentRange
  )
    return false;
  // Conservatively cover both sides of a boundary; woods/hills cannot be seen around a corner.
  for (const nudge of [1e-6, -1e-6])
    for (const position of hexLine(observer, target, nudge).slice(1, -1)) {
      if (
        inside(position, rows) &&
        config.blockingTerrains.includes(
          tacticalTerrain(content, battle, position.x, position.y),
        )
      )
        return false;
    }
  return true;
}

/** Shared, present-time sight only. Terrain remains public; there is no explored history. */
export function tacticalVisibility(
  content: Content,
  battle: Battle,
  side: TacticalUnit["side"],
): TacticalVisibility {
  const tiles = new Set<string>(),
    unitIds = new Set<string>();
  const tactical = battle.tactical;
  if (!tactical) return { tiles, unitIds };
  const rows = tacticalRows(battle);
  if (!settings(content).enabled || tactical.phase === "finished") {
    for (let x = 0; x < BOARD_COLUMNS; x++)
      for (let y = 0; y < rows; y++) tiles.add(`${x},${y}`);
    tactical.units.forEach((unit) => unitIds.add(unit.id));
    return { tiles, unitIds };
  }
  for (const observer of tactical.units.filter(
    (unit) => unit.side === side && alive(unit) && inside(unit, rows),
  )) {
    const range = tacticalVisionRange(content, observer);
    for (
      let x = Math.max(0, observer.x - range);
      x <= Math.min(BOARD_COLUMNS - 1, observer.x + range);
      x++
    )
      for (
        let y = Math.max(0, observer.y - range);
        y <= Math.min(rows - 1, observer.y + range);
        y++
      ) {
        const target = { x, y };
        if (
          !tiles.has(tileKey(target)) &&
          canSeeTile(content, battle, observer, target, range, rows)
        )
          tiles.add(tileKey(target));
      }
  }
  for (const unit of tactical.units)
    if (unit.side === side || (alive(unit) && tiles.has(tileKey(unit))))
      unitIds.add(unit.id);
  return { tiles, unitIds };
}

export function isTacticalUnitVisible(
  content: Content,
  battle: Battle,
  unit: TacticalUnit,
  side: TacticalUnit["side"],
  visibility?: TacticalVisibility,
) {
  return (visibility ?? tacticalVisibility(content, battle, side)).unitIds.has(
    unit.id,
  );
}

/** Capture before mutating participants; casualties or later scouting must not rewrite history. */
export function tacticalObservationAudience(
  content: Content,
  battle: Battle,
  ...participants: TacticalUnit[]
): TacticalUnit["side"][] {
  return (["attacker", "defender"] as const).filter((side) => {
    const visibility = tacticalVisibility(content, battle, side);
    return participants.every((unit) => visibility.unitIds.has(unit.id));
  });
}
