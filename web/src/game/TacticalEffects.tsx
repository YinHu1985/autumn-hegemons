import type { TacticalPlaybackFrame } from "./useTacticalPlayback";
import type { Content } from "../definitions/types";
import {
  tacticalActionObserved,
  tacticalPlaybackSnapshot,
  tacticalView,
  type TacticalSide,
} from "./tactical-view";

export function tacticalTileCenter(point: { x: number; y: number }) {
  return { x: point.x + 0.5, y: point.y + 0.5 + (point.x % 2) * 0.5 };
}

/** Convert each staggered cell before interpolating, so paths follow six-neighbour edges. */
export function animatedTacticalPosition(
  frame: TacticalPlaybackFrame,
  battleId: string,
) {
  const { action, progress, before } = frame;
  const units = before.military.battles[battleId]?.tactical?.units ?? [];
  const actor = units.find((unit) => unit.id === action.unitId);
  if (!actor) return null;
  if (action.kind === "move" && action.path && action.path.length > 1) {
    const position = Math.min(
      action.path.length - 1,
      progress * (action.path.length - 1),
    );
    const index = Math.min(action.path.length - 2, Math.floor(position));
    const fraction = position - index;
    const start = tacticalTileCenter(action.path[index]);
    const end = tacticalTileCenter(action.path[index + 1]);
    return {
      x: start.x + (end.x - start.x) * fraction,
      y: start.y + (end.y - start.y) * fraction,
    };
  }
  if (action.kind === "melee") {
    const target = units.find((unit) => unit.id === action.targetId);
    if (target) {
      const start = tacticalTileCenter(actor);
      const end = tacticalTileCenter(target);
      const fraction = Math.sin(progress * Math.PI) * 0.35;
      return {
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction,
      };
    }
  }
  return null;
}

/** All effects use the same pausable clock as playback, including projectiles and impacts. */
export function TacticalEffects({
  content,
  frame,
  battleId,
  side,
  columns,
  rows,
}: {
  content: Content;
  frame: TacticalPlaybackFrame | null;
  battleId: string;
  side: TacticalSide;
  columns: number;
  rows: number;
}) {
  if (!frame) return null;
  const { action, progress, before, after } = frame;
  const battle = before.military.battles[battleId];
  if (!battle) return null;
  const view = tacticalView(
    content,
    tacticalPlaybackSnapshot(battle, frame),
    side,
  );
  const previous = battle.tactical?.units ?? [];
  const next = after.military.battles[battleId]?.tactical?.units ?? [];
  const actor = previous.find((unit) => unit.id === action.unitId);
  if (!actor || action.kind === "move") return null;
  const observed = tacticalActionObserved(content, battle, side, frame);
  const target = previous.find((unit) => unit.id === action.targetId) ?? actor;
  const sourcePoint = tacticalTileCenter(actor);
  const targetPoint = tacticalTileCenter(target);
  const source = { x: sourcePoint.x * 100, y: sourcePoint.y * 100 };
  const destination = { x: targetPoint.x * 100, y: targetPoint.y * 100 };
  const strategyEffect = content.tactics.strategies.find(
    (entry) => entry.id === action.strategyId,
  )?.effect;
  const shooting =
    observed && (action.kind === "shoot" || strategyEffect === "fireArrow");
  const fire =
    observed && (strategyEffect === "fire" || strategyEffect === "fireArrow");
  const impacts = previous.flatMap((unit) => {
    if (!view.visibility.unitIds.has(unit.id)) return [];
    const current = next.find((entry) => entry.id === unit.id);
    if (!current) return [];
    const casualties = unit.cadre + unit.levy - current.cadre - current.levy;
    const morale = Math.round(current.morale - unit.morale);
    const status = current.statuses.find(
      (entry) => !unit.statuses.some((old) => old.kind === entry.kind),
    );
    const text =
      casualties > 0
        ? `−${casualties}`
        : status
          ? status.kind === "doubt"
            ? "疑兵"
            : "中计"
          : morale
            ? `士气 ${morale > 0 ? "+" : ""}${morale}`
            : "";
    return text
      ? [
          {
            ...tacticalTileCenter(unit),
            text,
            helpful: casualties === 0 && morale > 0,
          },
        ]
      : [];
  });
  if (!impacts.length && observed) {
    const text =
      action.kind === "guard"
        ? "固守"
        : action.kind === "wait"
          ? "待命"
          : action.kind === "skip"
            ? "受制"
            : action.kind === "end"
              ? "行动结束"
              : action.kind === "strategy"
                ? "未奏效"
                : "";
    if (text)
      impacts.push({
        ...targetPoint,
        text,
        helpful: action.kind === "guard" || action.kind === "wait",
      });
  }
  const flight = Math.max(0, Math.min(1, (progress - 0.08) / 0.44));
  const impactProgress = Math.max(0, (progress - 0.45) / 0.55);
  // Unobserved actions still spend their full playback time, without a source or action cue.
  if (!shooting && !impacts.length) return null;
  return (
    <div className="tactical-effects" aria-hidden="true">
      {shooting && progress >= 0.08 && progress <= 0.58 && (
        <svg
          className={`tactical-projectile${fire ? " projectile-fire" : ""}`}
          viewBox={`0 0 ${columns * 100} ${rows * 100}`}
          preserveAspectRatio="none"
        >
          <path
            className="projectile-trace"
            d={`M ${source.x} ${source.y} L ${source.x + (destination.x - source.x) * flight} ${source.y + (destination.y - source.y) * flight}`}
          />
          <g
            className="projectile-arrow"
            transform={`translate(${source.x + (destination.x - source.x) * flight} ${source.y + (destination.y - source.y) * flight}) rotate(${(Math.atan2(destination.y - source.y, destination.x - source.x) * 180) / Math.PI})`}
          >
            <path d="M -26 0 L 12 0 M 2 -8 L 12 0 L 2 8" />
          </g>
        </svg>
      )}
      {progress >= 0.45 &&
        impacts.map((impact, index) => (
          <span
            key={index}
            className={`tactical-impact${impact.helpful ? " impact-helpful" : ""}${fire ? " impact-fire" : ""}`}
            style={{
              left: `${(impact.x * 100) / columns}%`,
              top: `${(impact.y * 100) / rows}%`,
            }}
          >
            <i
              style={{
                transform: `translate(-50%, -50%) scale(${0.45 + impactProgress * 1.6})`,
                opacity: Math.max(0, 1 - impactProgress),
              }}
            />
            <b
              style={{
                transform: `translate(-50%, ${-23 - impactProgress * 19}px)`,
                opacity: Math.min(1, (1 - progress) * 7),
              }}
            >
              {impact.text}
            </b>
          </span>
        ))}
    </div>
  );
}
