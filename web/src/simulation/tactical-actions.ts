import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import type { Battle, TacticalUnit } from "./military-state";
import { hasTechnology } from "./research";
import { tacticalVisibility } from "./tactical-visibility";
import {
  alive,
  BOARD_COLUMNS,
  controllingStatus,
  distance,
  engaged,
  maxActionPoints,
  movementCosts,
  remainingActionPoints,
  tacticalRows,
} from "./tactical-board";

export interface TacticalOrder {
  id: string;
  name: string;
  cost: number;
  range: number;
  successChance?: number;
  available: boolean;
  reason: string;
  target: "enemy" | "ally" | "self" | "ground";
}
function canShoot(content: Content, unit: TacticalUnit) {
  return (
    unit.cadre > 0 &&
    (content.units.find((type) => type.id === unit.typeId)?.range ?? 1) > 1
  );
}
function unavailableReason(
  content: Content,
  world: WorldState | undefined,
  battle: Battle,
  unit: TacticalUnit,
  mode: string,
  ignoreControl: boolean,
) {
  const tactical = battle.tactical!;
  const visible = tacticalVisibility(content, battle, unit.side).unitIds;
  if (!alive(unit)) return "该部队已经溃退";
  if (tactical.phase !== "combat") return "当前不是交战阶段";
  if (tactical.activeUnitId !== unit.id) return "尚未轮到这支部队行动";
  if (!ignoreControl && controllingStatus(battle, unit))
    return "该部队受计策控制，本次行动无法自主下令";
  const points = remainingActionPoints(content, unit);
  if (points <= 0) return "行动力已经耗尽";
  if (mode === "auto") return "";
  if (mode === "move")
    return engaged(battle, unit, unit, visible) ? "已与敌军贴身，无法移动" : "";
  if (mode === "guard" || mode === "wait") return "";
  if (mode === "melee")
    return points < content.tactics.meleeCost ? "行动力不足，无法近战" : "";
  const strategy = content.tactics.strategies.find((item) => item.id === mode);
  if (mode !== "shoot" && !strategy) return "未知战术命令";
  if (strategy) {
    if (unit.strategyUsed) return "本次行动已使用过计策";
    if (strategy.requires) {
      const nationId =
        unit.side === "attacker" ? battle.attackerId : battle.defenderId;
      const unlocked =
        world &&
        (content.ideas.some((idea) => idea.id === strategy.requires)
          ? world.research.nations[nationId]?.enacted.includes(
              strategy.requires,
            )
          : hasTechnology(world, nationId, strategy.requires));
      if (!unlocked) return "尚未解锁所需科技或理念";
    }
  }
  if (mode === "shoot" || strategy?.effect === "fireArrow") {
    if (!canShoot(content, unit)) return "没有可射击的常备兵";
    if (engaged(battle, unit, unit, visible))
      return "已与敌军贴身，只能近战，无法射击";
  }
  if (points < (strategy?.actionPoints ?? content.tactics.shootCost))
    return "行动力不足";
  return "";
}

/** Rendering and command validation share this pure query; it never advances statuses. */
export function tacticalActions(
  content: Content,
  battle: Battle,
  unitId: string | null,
  mode = "auto",
  world?: WorldState,
  ignoreControl = false,
) {
  const moves = new Map<string, number>();
  const attacks = new Set<string>();
  const targets = new Set<string>();
  const tactical = battle.tactical;
  const unit = tactical?.units.find((item) => item.id === unitId);
  const visible = unit
    ? tacticalVisibility(content, battle, unit.side).unitIds
    : new Set<string>();
  const result = {
    moves,
    attacks,
    targets,
    engaged: unit && tactical ? engaged(battle, unit, unit, visible) : false,
    actionPoints: unit ? remainingActionPoints(content, unit) : 0,
    maxActionPoints: unit
      ? (unit.maxActionPoints ?? maxActionPoints(content, unit))
      : 0,
    reason: "",
  };
  if (!tactical || !unit || tactical.phase === "finished" || !alive(unit)) {
    result.reason = !unit ? "请先选择己方部队" : "该部队无法行动";
    return result;
  }
  if (tactical.phase === "deployment") {
    if (mode !== "move" && mode !== "auto") {
      result.reason = "布阵阶段只能调整位置";
      return result;
    }
    for (let x = 0; x < BOARD_COLUMNS; x++)
      for (let y = 0; y < tacticalRows(battle); y++) {
        if (
          (unit.side === "attacker" ? x > 3 : x < 8) ||
          tactical.units.some(
            (other) =>
              visible.has(other.id) &&
              alive(other) &&
              other.x === x &&
              other.y === y,
          )
        )
          continue;
        moves.set(`${x},${y}`, 0);
      }
    return result;
  }
  result.reason = unavailableReason(
    content,
    world,
    battle,
    unit,
    mode,
    ignoreControl,
  );
  if (result.reason) return result;
  if (mode === "auto") {
    for (const child of ["move", "melee", "shoot"]) {
      const actions = tacticalActions(
        content,
        battle,
        unitId,
        child,
        world,
        ignoreControl,
      );
      actions.moves.forEach((cost, key) => moves.set(key, cost));
      actions.attacks.forEach((id) => {
        attacks.add(id);
        targets.add(id);
      });
    }
    return result;
  }
  if (mode === "move") {
    for (const [position, cost] of movementCosts(content, battle, unit))
      if (cost > 0) moves.set(position, cost);
    if (!moves.size) result.reason = "没有可到达的空地";
    return result;
  }
  if (mode === "guard" || mode === "wait") {
    targets.add(unit.id);
    return result;
  }
  const strategy = content.tactics.strategies.find((item) => item.id === mode);
  const range =
    mode === "melee"
      ? 1
      : mode === "shoot"
        ? content.units.find((type) => type.id === unit.typeId)!.range
        : strategy?.effect === "fireArrow"
          ? Math.min(
              strategy.range,
              content.units.find((type) => type.id === unit.typeId)!.range,
            )
          : strategy!.range;
  for (const target of tactical.units) {
    if (
      !visible.has(target.id) ||
      !alive(target) ||
      distance(unit, target) > range
    )
      continue;
    if (strategy?.effect === "rally") {
      if (target.side === unit.side && target.morale < 100)
        targets.add(target.id);
      continue;
    }
    if (target.side === unit.side) continue;
    if (
      (strategy?.effect === "doubt" || strategy?.effect === "provoke") &&
      target.statuses?.some(
        (status) =>
          status.kind === strategy.effect && status.remainingActivations > 0,
      )
    )
      continue;
    targets.add(target.id);
    attacks.add(target.id);
  }
  if (!targets.size)
    result.reason =
      strategy?.effect === "rally"
        ? "范围内没有需要鼓舞的友军"
        : "范围内没有合法目标";
  return result;
}

export function tacticalOrders(
  content: Content,
  world: WorldState,
  battle: Battle,
  unitId: string | null,
): TacticalOrder[] {
  const unit = battle.tactical?.units.find((item) => item.id === unitId);
  const definition = content.units.find((item) => item.id === unit?.typeId);
  const orders: Omit<TacticalOrder, "available" | "reason">[] = [
    {
      id: "move",
      name: "移动",
      cost: content.tactics.plainMoveCost,
      range: 0,
      target: "ground",
    },
    {
      id: "melee",
      name: "近战",
      cost: content.tactics.meleeCost,
      range: 1,
      target: "enemy",
    },
    {
      id: "shoot",
      name: "射击",
      cost: content.tactics.shootCost,
      range: definition?.range ?? 0,
      target: "enemy",
    },
    ...content.tactics.strategies.map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      cost: strategy.actionPoints,
      range:
        strategy.effect === "fireArrow"
          ? Math.min(strategy.range, definition?.range ?? 0)
          : strategy.range,
      successChance: strategy.successChance,
      target:
        strategy.effect === "rally" ? ("ally" as const) : ("enemy" as const),
    })),
    {
      id: "guard",
      name: "坚守",
      cost: unit ? remainingActionPoints(content, unit) : 0,
      range: 0,
      target: "self",
    },
    {
      id: "wait",
      name: "待机",
      cost: unit ? remainingActionPoints(content, unit) : 0,
      range: 0,
      target: "self",
    },
  ];
  return orders.map((order) => {
    const actions = tacticalActions(content, battle, unitId, order.id, world);
    return { ...order, available: !actions.reason, reason: actions.reason };
  });
}
