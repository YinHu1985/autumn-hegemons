import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import type { Battle, TacticalUnit } from "./military-state";
import { randomMilitary } from "./military-state";
import { tacticalActions } from "./tactical-actions";
import {
  tacticalObservationAudience,
  tacticalVisibility,
} from "./tactical-visibility";
import {
  checkOutcome,
  tacticalAttack,
  tacticalHold,
  tacticalMove,
  tacticalStrategy,
} from "./tactical-combat";
import {
  alive,
  controllingStatus,
  distance,
  movementCosts,
  remainingActionPoints,
  recordTacticalAction,
  tacticalLog,
  tacticalRows,
  unitName,
} from "./tactical-board";
import { finishTacticalActivation } from "./tactical-timeline";
type Side = TacticalUnit["side"];

function nearestPosition(
  content: Content,
  battle: Battle,
  unit: TacticalUnit,
  target: Pick<TacticalUnit, "x" | "y">,
  desiredRange = 1,
) {
  const possibilities = [...movementCosts(content, battle, unit)]
    .filter(([, cost]) => cost > 0)
    .map(([position, cost]) => {
      const [x, y] = position.split(",").map(Number);
      const gap = distance({ x, y }, target);
      // Retain attack AP when a position in attack range is reachable.
      const canAttack =
        gap <= desiredRange &&
        remainingActionPoints(content, unit) - cost >=
          (desiredRange > 1
            ? content.tactics.shootCost
            : content.tactics.meleeCost);
      return {
        x,
        y,
        cost,
        gap,
        score:
          (canAttack ? -100 : 0) + Math.abs(gap - desiredRange) * 10 + cost,
      };
    })
    .sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
  return possibilities.find(
    (position) => position.gap < distance(unit, target),
  );
}

/** One forced action, so the caller can present each move or hit before requesting another. */
function controlledStep(
  content: Content,
  world: WorldState,
  battle: Battle,
  unit: TacticalUnit,
) {
  const status = controllingStatus(battle, unit)!;
  const audience = tacticalObservationAudience(content, battle, unit);
  if (status.kind === "doubt") {
    tacticalLog(
      battle,
      `${unitName(content, unit)}受疑兵扰乱，本次行动无法出击`,
      audience,
    );
    recordTacticalAction(battle, {
      kind: "skip",
      unitId: unit.id,
      visibleTo: audience,
    });
    finishTacticalActivation(content, battle, false);
    return;
  }
  const visible = tacticalVisibility(content, battle, unit.side).unitIds;
  const source = battle.tactical!.units.find(
    (item) =>
      item.id === status.sourceId && alive(item) && visible.has(item.id),
  );
  if (!source) {
    tacticalLog(
      battle,
      `${unitName(content, unit)}受挑衅牵制，但无法发现可追击目标`,
      audience,
    );
    recordTacticalAction(battle, {
      kind: "skip",
      unitId: unit.id,
      visibleTo: audience,
    });
    finishTacticalActivation(content, battle, false);
    return;
  }
  const attack = tacticalActions(
    content,
    battle,
    unit.id,
    "melee",
    world,
    true,
  );
  if (attack.targets.has(source.id)) {
    tacticalAttack(content, world, battle, unit, source, "melee", true);
    return;
  }
  const next = nearestPosition(content, battle, unit, source);
  if (next) {
    tacticalLog(
      battle,
      `${unitName(content, unit)}受挑衅，被迫追击${unitName(content, source)}`,
      tacticalObservationAudience(content, battle, unit, source),
    );
    tacticalMove(content, battle, unit, next.x, next.y, true);
    return;
  }
  tacticalLog(
    battle,
    `${unitName(content, unit)}受挑衅牵制，无法接近目标`,
    audience,
  );
  recordTacticalAction(battle, {
    kind: "skip",
    unitId: unit.id,
    targetId: source.id,
    visibleTo: tacticalObservationAudience(content, battle, unit, source),
  });
  finishTacticalActivation(content, battle, false);
}

function aiStep(
  content: Content,
  world: WorldState,
  battle: Battle,
  unit: TacticalUnit,
) {
  const tactical = battle.tactical!;
  const strategies = content.tactics.strategies
    .flatMap((strategy) =>
      [
        ...tacticalActions(content, battle, unit.id, strategy.id, world)
          .targets,
      ].map((id) => ({
        strategy,
        target: tactical.units.find((target) => target.id === id)!,
      })),
    )
    .filter(
      ({ strategy, target }) =>
        strategy.effect !== "rally" || target.morale < 65,
    );
  if (strategies.length && randomMilitary(world.military) < 0.3) {
    const choice =
      strategies[
        Math.floor(randomMilitary(world.military) * strategies.length)
      ];
    tacticalStrategy(
      content,
      world,
      battle,
      unit,
      choice.target,
      choice.strategy.id,
    );
    return;
  }
  for (const mode of ["shoot", "melee"]) {
    const legal = tacticalActions(content, battle, unit.id, mode, world);
    const target = tactical.units
      .filter((item) => legal.targets.has(item.id))
      .sort(
        (a, b) =>
          a.cadre + a.levy - b.cadre - b.levy || a.id.localeCompare(b.id),
      )[0];
    if (target) {
      tacticalAttack(content, world, battle, unit, target, mode);
      return;
    }
  }
  const visible = tacticalVisibility(content, battle, unit.side).unitIds;
  const target = tactical.units
    .filter(
      (item) => item.side !== unit.side && alive(item) && visible.has(item.id),
    )
    .sort(
      (a, b) =>
        distance(unit, a) - distance(unit, b) || a.id.localeCompare(b.id),
    )[0];
  if (!target) {
    // Public initial fronts and deterministic patrol waypoints, never concealed enemy coordinates.
    const front = unit.side === "attacker" ? 10 : 1;
    const rows = tacticalRows(battle);
    const waypoints = [
      { x: front, y: unit.y },
      { x: front, y: 0 },
      { x: 6, y: rows - 1 },
      { x: front, y: rows - 1 },
      { x: 5, y: 0 },
    ];
    const goal =
      waypoints[Math.floor((unit.activationCount ?? 0) / 4) % waypoints.length];
    const next = nearestPosition(content, battle, unit, goal, 0);
    if (next) tacticalMove(content, battle, unit, next.x, next.y);
    else tacticalHold(content, world, battle, unit, "guard");
    return;
  }
  const type = content.units.find((item) => item.id === unit.typeId)!;
  const next = nearestPosition(
    content,
    battle,
    unit,
    target,
    unit.cadre > 0 ? type.range : 1,
  );
  if (next) tacticalMove(content, battle, unit, next.x, next.y);
  else tacticalHold(content, world, battle, unit, "guard");
}

/** Never runs a whole faction or activation; every call emits at most one action cue. */
export function tacticalAutomationStep(
  content: Content,
  world: WorldState,
  battle: Battle,
  playerSide: Side,
) {
  const tactical = battle.tactical!;
  if (tactical.phase !== "combat" || !tactical.activeUnitId) return;
  const unit = tactical.units.find((item) => item.id === tactical.activeUnitId);
  if (!unit) throw new Error("当前行动部队不存在");
  if (!alive(unit) || remainingActionPoints(content, unit) <= 0) {
    finishTacticalActivation(content, battle);
    return;
  }
  if (controllingStatus(battle, unit))
    controlledStep(content, world, battle, unit);
  else if (unit.side !== playerSide) aiStep(content, world, battle, unit);
}

export function tacticalEndTurn(
  content: Content,
  _world: WorldState,
  battle: Battle,
  playerSide: Side,
) {
  const tactical = battle.tactical!;
  if (tactical.phase === "deployment") {
    tactical.phase = "combat";
    tactical.activeUnitId = null;
    tactical.clock = 0;
    tactical.activation = 0;
    tactical.turn = 1;
    for (const unit of tactical.units) {
      unit.actionProgress = 0;
      unit.activationCount = 0;
      unit.actionPoints = 0;
      unit.acted = true;
    }
    tacticalLog(battle, "军鼓已响，行动条开始累积；每支部队条满后独立行动。");
    checkOutcome(battle);
    return;
  }
  if (tactical.phase !== "combat") return;
  const active = tactical.units.find(
    (unit) => unit.id === tactical.activeUnitId,
  );
  if (!active || active.side !== playerSide)
    throw new Error("尚未轮到我方部队行动");
  if (
    controllingStatus(battle, active) &&
    remainingActionPoints(content, active) > 0
  )
    throw new Error("当前部队受计策控制，需先执行被迫行动");
  finishTacticalActivation(content, battle);
}
