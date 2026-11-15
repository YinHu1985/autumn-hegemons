import type { Content } from "../definitions/types";
import type { Battle, TacticalUnit } from "../simulation/military-state";
import {
  isTacticalUnitVisible,
  tacticalForecast,
  tacticalTimeline,
  tacticalVisibility,
} from "../simulation/military-tactics";
import type { TacticalPlaybackFrame } from "./useTacticalPlayback";

export type TacticalSide = "attacker" | "defender";

/** The UI's public information: never forecast the omniscient sequence then filter it. */
export function tacticalView(
  content: Content,
  battle: Battle,
  side: TacticalSide,
) {
  const visibility = tacticalVisibility(content, battle, side);
  const tactical = battle.tactical;
  const units = (tactical?.units ?? [])
    .filter(
      (unit) =>
        unit.cadre + unit.levy > 0 &&
        unit.morale > 8 &&
        visibility.unitIds.has(unit.id),
    )
    .map((unit) => ({
      ...unit,
      statuses: unit.statuses.map(({ sourceId, ...status }) => ({
        ...status,
        ...(sourceId && visibility.unitIds.has(sourceId) ? { sourceId } : {}),
      })),
    }));
  const active = units.find((unit) => unit.id === tactical?.activeUnitId);
  const selected = units.find((unit) => unit.id === tactical?.selectedId);
  const log = tactical?.observedLog?.[side] ?? [];
  const observedBattle: Battle = {
    ...battle,
    tactical: tactical
      ? {
          ...tactical,
          units,
          activeUnitId: active?.id ?? null,
          selectedId: selected?.id ?? null,
          lastAction: null,
          log,
          observedLog: undefined,
        }
      : null,
  };
  const men = { attacker: 0, defender: 0 };
  for (const unit of units) men[unit.side] += unit.cadre + unit.levy;
  return {
    visibility,
    units,
    active,
    selected,
    men,
    log,
    timeline: tacticalTimeline(content, observedBattle),
    forecast: tacticalForecast(content, observedBattle, 6),
  };
}

function movementSegment(frame: TacticalPlaybackFrame) {
  const path = frame.action.path;
  if (frame.action.kind !== "move" || !path || path.length < 2) return null;
  const position = Math.max(0, Math.min(1, frame.progress)) * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(position));
  return { start: path[index], end: path[index + 1], position, path };
}

function placeUnit(
  battle: Battle,
  unitId: string,
  point: { x: number; y: number },
): Battle {
  if (!battle.tactical) return battle;
  return {
    ...battle,
    tactical: {
      ...battle.tactical,
      units: battle.tactical.units.map((unit) =>
        unit.id === unitId ? { ...unit, x: point.x, y: point.y } : unit,
      ),
    },
  };
}

/** Rule-only snapshot at the last reached tile. It never uses an unreached destination's sight. */
export function tacticalPlaybackSnapshot(
  battle: Battle,
  frame: TacticalPlaybackFrame | null,
) {
  if (!frame) return battle;
  const segment = movementSegment(frame);
  if (!segment) return battle;
  const reached =
    segment.path[
      Math.min(segment.path.length - 1, Math.floor(segment.position))
    ];
  return placeUnit(battle, frame.action.unitId, reached);
}

/** A segment is drawable only if both ends can be observed; hidden path portions stay absent. */
export function tacticalMovementVisible(
  content: Content,
  battle: Battle,
  side: TacticalSide,
  frame: TacticalPlaybackFrame | null,
) {
  if (!frame) return false;
  const actor = battle.tactical?.units.find(
    (unit) => unit.id === frame.action.unitId,
  );
  if (!actor) return false;
  const segment = movementSegment(frame);
  if (segment) {
    if (actor.side === side) return true;
    return [segment.start, segment.end].every((point) => {
      const snapshot = placeUnit(battle, actor.id, point);
      const moved = snapshot.tactical!.units.find(
        (unit) => unit.id === actor.id,
      )!;
      return isTacticalUnitVisible(content, snapshot, moved, side);
    });
  }
  const target = battle.tactical?.units.find(
    (unit) => unit.id === frame.action.targetId,
  );
  return (
    frame.action.kind === "melee" &&
    isTacticalUnitVisible(content, battle, actor, side) &&
    !!target &&
    isTacticalUnitVisible(content, battle, target, side)
  );
}

/** Action names and paths require both a visible source and a visible target, when present. */
export function tacticalActionObserved(
  content: Content,
  battle: Battle,
  side: TacticalSide,
  frame: TacticalPlaybackFrame | null,
) {
  if (!frame) return false;
  const { action } = frame;
  const view = tacticalView(
    content,
    tacticalPlaybackSnapshot(battle, frame),
    side,
  );
  if (!view.visibility.unitIds.has(action.unitId)) return false;
  if (action.kind === "move")
    return tacticalMovementVisible(content, battle, side, frame);
  if (action.targetId && !view.visibility.unitIds.has(action.targetId))
    return false;
  return action.visibleTo === undefined || action.visibleTo.includes(side);
}

export function visibleTacticalUnitAt(
  units: TacticalUnit[],
  x: number,
  y: number,
) {
  return units.find((unit) => unit.x === x && unit.y === y);
}
