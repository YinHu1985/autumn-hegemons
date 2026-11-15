import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import type { Battle, TacticalUnit } from "./military-state";
import { randomMilitary } from "./military-state";
import { applyCasualties } from "./military-strength";
import { tacticalActions } from "./tactical-actions";
import { tacticalObservationAudience } from "./tactical-visibility";
import {
  alive,
  distance,
  engaged,
  recordTacticalAction,
  remainingActionPoints,
  spendActionPoints,
  tacticalLog,
  tacticalTerrain,
  tacticalMovementPath,
  unitName,
} from "./tactical-board";

export function checkOutcome(battle: Battle) {
  const tactical = battle.tactical!;
  const active = tactical.units.find(
    (unit) => unit.id === tactical.activeUnitId,
  );
  if (active && !alive(active)) {
    // A counterattack may rout the actor. Let playback finish, then automation ends it.
    active.actionPoints = 0;
    active.acted = true;
  }
  for (const unit of tactical.units)
    unit.statuses = (unit.statuses ?? []).filter(
      (status) =>
        status.kind !== "provoke" ||
        tactical.units.some(
          (source) =>
            source.id === status.sourceId &&
            source.side !== unit.side &&
            alive(source),
        ),
    );
  if (!tactical.units.some((unit) => unit.side === "attacker" && alive(unit))) {
    tactical.winner = "defender";
  } else if (
    !tactical.units.some((unit) => unit.side === "defender" && alive(unit))
  ) {
    tactical.winner = "attacker";
  } else if (tactical.turn > 40) {
    const men = (side: string) =>
      tactical.units
        .filter((unit) => unit.side === side && alive(unit))
        .reduce((sum, unit) => sum + unit.cadre + unit.levy, 0);
    tactical.winner =
      men("attacker") > men("defender") * 1.15 ? "attacker" : "defender";
    tacticalLog(battle, "久战未决，按残存兵力判定战果。");
  }
  if (tactical.winner) {
    tactical.phase = "finished";
    tactical.activeUnitId = null;
  }
}
function power(content: Content, unit: TacticalUnit, ranged: boolean) {
  const type = content.units.find((item) => item.id === unit.typeId)!;
  const cadrePower =
    unit.cadre *
    type.attack *
    (!ranged && type.range > 1 ? content.tactics.rangedMeleeMultiplier : 1);
  // Escorts provide bodies and melee strength, never additional archers.
  return (
    (cadrePower + (ranged ? 0 : unit.levy * 0.35)) *
    (0.25 + unit.morale / 133) *
    (0.55 + unit.training / 200) *
    (unit.attackMultiplier ?? 1)
  );
}
function protection(content: Content, battle: Battle, unit: TacticalUnit) {
  const type = content.units.find((item) => item.id === unit.typeId)!;
  return Math.max(
    0.1,
    type.defense *
      (unit.defenseMultiplier ?? 1) *
      (tacticalTerrain(content, battle, unit.x, unit.y) === "plain" ? 1 : 1.3) *
      (unit.side === "defender" ? 1.12 : 1) *
      (unit.guarding ? content.tactics.guardDefenseMultiplier : 1),
  );
}
function casualty(unit: TacticalUnit, requested: number, morale: number) {
  const before = unit.cadre + unit.levy;
  applyCasualties(unit, Math.min(before, Math.max(0, Math.round(requested))));
  const actual = before - unit.cadre - unit.levy;
  unit.morale = Math.max(0, unit.morale - morale);
  return actual;
}
function shot(
  content: Content,
  battle: Battle,
  source: TacticalUnit,
  target: TacticalUnit,
) {
  return casualty(
    target,
    Math.max(
      1,
      (power(content, source, true) * content.tactics.rangedDamageRate) /
        protection(content, battle, target),
    ),
    3,
  );
}
export function tacticalAttack(
  content: Content,
  world: WorldState,
  battle: Battle,
  source: TacticalUnit,
  target: TacticalUnit,
  mode = "auto",
  forced = false,
) {
  const action =
    mode === "auto"
      ? distance(source, target) === 1
        ? "melee"
        : "shoot"
      : mode;
  if (action !== "melee" && action !== "shoot") throw new Error("未知攻击方式");
  const legal = tacticalActions(
    content,
    battle,
    source.id,
    action,
    world,
    forced,
  );
  if (!legal.targets.has(target.id))
    throw new Error(legal.reason || "目标不在攻击范围");
  const audience = tacticalObservationAudience(content, battle, source, target);
  const cost =
    action === "shoot" ? content.tactics.shootCost : content.tactics.meleeCost;
  spendActionPoints(content, source, cost);
  source.guarding = false;
  recordTacticalAction(battle, {
    kind: action,
    unitId: source.id,
    targetId: target.id,
    visibleTo: audience,
  });
  let damage: number;
  if (action === "shoot") damage = shot(content, battle, source, target);
  else {
    const type = content.units.find((item) => item.id === source.typeId)!;
    const enemy = content.units.find((item) => item.id === target.typeId)!;
    const matchup =
      type.category === "cavalry" && enemy.category === "ranged"
        ? 1.3
        : type.category === "infantry" && enemy.category === "cavalry"
          ? 1.1
          : 1;
    damage = casualty(
      target,
      Math.max(
        1,
        (power(content, source, false) *
          content.tactics.meleeDamageRate *
          matchup) /
          protection(content, battle, target),
      ),
      5,
    );
  }
  tacticalLog(
    battle,
    `${unitName(content, source)}${action === "shoot" ? "射击" : "近战攻击"}${unitName(content, target)}，造成 ${damage} 伤亡 · 行动力 −${cost}`,
    audience,
  );
  if (!audience.includes(target.side))
    tacticalLog(
      battle,
      `${unitName(content, target)}遭到未发现敌军攻击，损失 ${damage} 人`,
      [target.side],
    );
  if (action === "melee" && alive(target)) {
    const counter = casualty(
      source,
      Math.max(
        1,
        (power(content, target, false) * content.tactics.counterDamageRate) /
          protection(content, battle, source),
      ),
      2,
    );
    tacticalLog(
      battle,
      `${unitName(content, target)}反击，造成 ${counter} 伤亡`,
      audience,
    );
  }
  checkOutcome(battle);
}
export function tacticalStrategy(
  content: Content,
  world: WorldState,
  battle: Battle,
  source: TacticalUnit,
  target: TacticalUnit,
  strategyId: string,
) {
  const strategy = content.tactics.strategies.find(
    (item) => item.id === strategyId,
  );
  if (!strategy) throw new Error("未知计策");
  const legal = tacticalActions(content, battle, source.id, strategyId, world);
  if (!legal.targets.has(target.id))
    throw new Error(legal.reason || "不能向该目标施计");
  const audience = tacticalObservationAudience(content, battle, source, target);
  // Validate before touching AP, RNG or statuses. Every attempt pays exactly once.
  spendActionPoints(content, source, strategy.actionPoints);
  source.strategyUsed = true;
  source.guarding = false;
  recordTacticalAction(battle, {
    kind: "strategy",
    unitId: source.id,
    targetId: target.id,
    strategyId,
    visibleTo: audience,
  });
  const success = randomMilitary(world.military) < strategy.successChance;
  let detail = "";
  if (strategy.effect === "fireArrow")
    detail = `射击造成 ${shot(content, battle, source, target)} 伤亡；`;
  if (success) {
    if (strategy.effect === "rally") {
      const amount = Math.min(100 - target.morale, strategy.moraleChange ?? 0);
      target.morale += amount;
      detail += `士气 +${Math.round(amount)}`;
    } else if (strategy.effect === "doubt" || strategy.effect === "provoke") {
      target.statuses ??= [];
      target.statuses.push({
        kind: strategy.effect,
        remainingActivations: strategy.duration ?? 1,
        sourceId: source.id,
      });
      detail +=
        strategy.effect === "doubt"
          ? "敌军下一次行动被疑兵阻止"
          : "敌军下一次行动被迫追击";
    } else if (alive(target)) {
      const terrainFactor =
        tacticalTerrain(content, battle, target.x, target.y) === "forest"
          ? 1.3
          : 1;
      const firePower = power(content, source, strategy.effect === "fireArrow");
      const damage = casualty(
        target,
        (firePower * (strategy.damageRate ?? 0) * terrainFactor) /
          protection(content, battle, target),
        strategy.moraleChange ?? 0,
      );
      detail += `引燃阵地，造成 ${damage} 伤亡`;
    }
  } else detail += strategy.effect === "fireArrow" ? "未能引燃" : "计策被识破";
  tacticalLog(
    battle,
    `${unitName(content, source)}对${unitName(content, target)}施展${strategy.name}${success ? "成功" : "未成"}：${detail} · 行动力 −${strategy.actionPoints}`,
    audience,
  );
  if (!audience.includes(target.side))
    tacticalLog(
      battle,
      `${unitName(content, target)}受到未发现敌军的计策影响`,
      [target.side],
    );
  checkOutcome(battle);
}
export function tacticalMove(
  content: Content,
  battle: Battle,
  unit: TacticalUnit,
  x: number,
  y: number,
  forced = false,
) {
  if (!Number.isInteger(x) || !Number.isInteger(y))
    throw new Error("战场坐标不合法");
  const legal = tacticalActions(
    content,
    battle,
    unit.id,
    "move",
    undefined,
    forced,
  );
  if (!legal.moves.has(`${x},${y}`))
    throw new Error(legal.reason || "无法到达该格，路径受阻或行动力不足");
  // Planning uses current knowledge. Execution checks real occupancy one hex at a time.
  const planned = tacticalMovementPath(content, battle, unit, x, y);
  const path = planned.slice(0, 1);
  const combat = battle.tactical!.phase === "combat";
  let audience = tacticalObservationAudience(content, battle, unit);
  for (const step of planned.slice(1)) {
    if (combat && engaged(battle, unit)) break;
    if (
      battle.tactical!.units.some(
        (other) =>
          other.id !== unit.id &&
          alive(other) &&
          other.x === step.x &&
          other.y === step.y,
      )
    )
      break;
    unit.x = step.x;
    unit.y = step.y;
    path.push(step);
    const visibleNow = tacticalObservationAudience(content, battle, unit);
    audience = audience.filter((side) => visibleNow.includes(side));
    if (combat && engaged(battle, unit)) break;
  }
  if (path.length < 2) throw new Error("行进受阻，无法前进");
  recordTacticalAction(battle, {
    kind: "move",
    unitId: unit.id,
    path,
    visibleTo: audience,
  });
  if (combat) {
    spendActionPoints(
      content,
      unit,
      path.reduce((cost, step) => cost + step.cost, 0),
    );
    unit.guarding = false;
    if (path.length < planned.length)
      tacticalLog(battle, `${unitName(content, unit)}行进遇阻，已停止前进`, [
        unit.side,
      ]);
  }
}
export function tacticalHold(
  content: Content,
  world: WorldState,
  battle: Battle,
  unit: TacticalUnit,
  mode: "guard" | "wait",
) {
  const legal = tacticalActions(content, battle, unit.id, mode, world);
  if (!legal.targets.has(unit.id))
    throw new Error(legal.reason || "当前不能待命");
  const moraleRecovery = Math.min(
    100 - unit.morale,
    content.tactics.waitMoraleRecovery,
  );
  const audience = tacticalObservationAudience(content, battle, unit);
  if (mode === "wait") unit.morale += moraleRecovery;
  unit.guarding = mode === "guard";
  spendActionPoints(content, unit, remainingActionPoints(content, unit));
  recordTacticalAction(battle, {
    kind: mode,
    unitId: unit.id,
    visibleTo: audience,
  });
  tacticalLog(
    battle,
    `${unitName(content, unit)}${mode === "guard" ? `结阵坚守，防御提高 ${Math.round((content.tactics.guardDefenseMultiplier - 1) * 100)}% 至下次行动` : `整队待机，士气 +${Math.round(moraleRecovery)}`}`,
    audience,
  );
}
