import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { copyWorld } from "./state";
import { advanceBattleDay } from "./time";
import { flushEventFacts } from "./events";
import {
  tickBattles,
  autoResolveBattle,
  retreatBattle,
} from "./military-battles";
import {
  beginTactical,
  commitTactical,
  tacticalMove,
  tacticalAttack,
  tacticalEndTurn,
  tacticalStrategy,
  tacticalHold,
  tacticalAdvanceClock,
  tacticalAutomationStep,
} from "./military-tactics";
import { isTacticalUnitVisible } from "./tactical-visibility";
import { recoverFatigue } from "./military-fatigue";
import { relocateHome, setGeneralBusy } from "./military-lifecycle";
import { hasPendingBattle } from "./military-queue";
export * from "./military-state";
export * from "./military-strength";
export * from "./military-commands";
export {
  battleStrength,
  availableGarrison,
  defenseAdvantage,
  occupyCity,
} from "./military-battles";
export * from "./military-queue";
export * from "./military-fatigue";
export function tickMilitaryDay(
  content: Content,
  world: WorldState,
  settlingBattle = false,
) {
  if (
    world.military.activeBattleId ||
    (!settlingBattle && hasPendingBattle(world))
  )
    return;
  world.military.day++;
  for (const army of Object.values(world.military.armies)) {
    if (
      army.generalId &&
      world.research.talents[army.generalId]?.role !== "general"
    )
      army.generalId = null;
    if (army.status === "returning") {
      army.remainingDays = Math.max(0, army.remainingDays - 1);
      if (army.remainingDays === 0) {
        army.status = "idle";
        army.expedition = false;
        army.destination = null;
        relocateHome(content, world, army);
      }
    } else if (army.status === "marching") {
      army.remainingDays = Math.max(0, army.remainingDays - 1);
      if (army.remainingDays === 0) {
        if (
          army.destination &&
          world.settlements[army.destination]?.owner === army.nationId
        )
          army.cityId = army.destination;
        army.destination = null;
        army.arrivedDay = world.military.day;
        army.status = "idle";
        relocateHome(content, world, army);
      }
    } else if (army.status === "idle" || army.status === "resting") {
      const coverage = world.nations[army.nationId].operatingCoverage.army;
      for (const unit of army.units) {
        unit.morale = Math.max(
          5,
          Math.min(100, unit.morale + (coverage - 0.45) * 0.55),
        );
        unit.training = Math.min(100, unit.training + coverage * 0.1);
      }
      recoverFatigue(content, army);
      if (army.status === "resting") {
        army.remainingDays = Math.max(0, army.remainingDays - 1);
        if (army.remainingDays === 0) army.status = "idle";
      }
    }
    setGeneralBusy(world, army, army.status !== "idle");
  }
  tickBattles(content, world);
}
export function resolveBattleNow(
  content: Content,
  world: WorldState,
  battleId: string,
  nationId: string,
) {
  if (world.military.activeBattleId) throw new Error("请先完成当前决战");
  const next = copyWorld(world);
  const b = next.military.battles[battleId];
  if (
    !b ||
    ![b.attackerId, b.defenderId].includes(nationId) ||
    b.phase !== "ready"
  )
    throw new Error("尚未到决战时刻");
  autoResolveBattle(content, next, b);
  return advanceBattleDay(content, next);
}
export function withdrawBattle(
  content: Content,
  world: WorldState,
  battleId: string,
  nationId: string,
) {
  if (world.military.activeBattleId) throw new Error("请先完成当前决战");
  const next = copyWorld(world);
  retreatBattle(content, next, battleId, nationId);
  flushEventFacts(content, next);
  return next;
}
export function startManualBattle(
  content: Content,
  world: WorldState,
  battleId: string,
  nationId: string,
) {
  const next = copyWorld(world);
  const b = next.military.battles[battleId];
  if (!b || ![b.attackerId, b.defenderId].includes(nationId))
    throw new Error("无法指挥此战役");
  beginTactical(content, next, b);
  return next;
}
export function selectTacticalUnit(
  world: WorldState,
  battleId: string,
  unitId: string,
  nationId: string,
) {
  const next = copyWorld(world);
  const b = next.military.battles[battleId];
  const t = b?.tactical;
  if (!t) throw new Error("战场不存在");
  if (
    ![b.attackerId, b.defenderId].includes(nationId) ||
    next.military.activeBattleId !== b.id
  )
    throw new Error("无法指挥此战役");
  const u = t.units.find((u) => u.id === unitId);
  if (!u) throw new Error("部队不存在");
  t.selectedId = u.id;
  return next;
}
export function actTactical(
  content: Content,
  world: WorldState,
  battleId: string,
  nationId: string,
  x: number,
  y: number,
  mode = "auto",
) {
  const next = copyWorld(world);
  const b = next.military.battles[battleId];
  const t = b?.tactical;
  if (!t || t.phase === "finished") throw new Error("战场不可操作");
  if (
    ![b.attackerId, b.defenderId].includes(nationId) ||
    next.military.activeBattleId !== b.id
  )
    throw new Error("无法指挥此战役");
  const side = nationId === b.attackerId ? "attacker" : "defender";
  const unit = t.units.find((u) => u.id === t.selectedId && u.side === side);
  if (!unit) throw new Error("请先选择己方部队");
  const target = t.units.find(
    (u) =>
      u.x === x &&
      u.y === y &&
      u.cadre + u.levy > 0 &&
      u.morale > 8 &&
      isTacticalUnitVisible(content, b, u, side),
  );
  if (mode === "guard" || mode === "wait")
    tacticalHold(content, next, b, unit, mode);
  else if (
    content.tactics.strategies.some((strategy) => strategy.id === mode)
  ) {
    if (!target) throw new Error("请指定计策目标");
    tacticalStrategy(content, next, b, unit, target, mode);
  } else if (
    target &&
    target.side !== side &&
    t.phase === "combat" &&
    mode !== "move"
  )
    tacticalAttack(content, next, b, unit, target, mode);
  else if (mode === "move" || mode === "auto")
    tacticalMove(content, b, unit, x, y);
  else throw new Error("请指定合法攻击目标");
  return next;
}
export function endTacticalTurn(
  content: Content,
  world: WorldState,
  battleId: string,
  nationId: string,
) {
  const next = copyWorld(world);
  const b = next.military.battles[battleId];
  if (!b?.tactical) throw new Error("战场不存在");
  if (
    ![b.attackerId, b.defenderId].includes(nationId) ||
    next.military.activeBattleId !== b.id
  )
    throw new Error("无法指挥此战役");
  tacticalEndTurn(
    content,
    next,
    b,
    nationId === b.attackerId ? "attacker" : "defender",
  );
  return next;
}
/** Tactical time is a separate clock; world days advance only when the battle is committed. */
export function advanceTacticalTime(
  content: Content,
  world: WorldState,
  battleId: string,
  delta: number,
) {
  const original = world.military.battles[battleId];
  if (!original?.tactical || world.military.activeBattleId !== battleId)
    throw new Error("战场不存在或未激活");
  // Animation advances this frequently. Copy only the tactical branch, not national economies.
  const battle = { ...original, tactical: structuredClone(original.tactical) };
  const next = {
    ...world,
    military: {
      ...world.military,
      battles: { ...world.military.battles, [battleId]: battle },
    },
  };
  tacticalAdvanceClock(content, battle, delta);
  return next;
}
/** Perform only one AI or forced action, allowing presentation to animate each result. */
export function stepTacticalAutomation(
  content: Content,
  world: WorldState,
  battleId: string,
  nationId: string,
) {
  const next = copyWorld(world);
  const battle = next.military.battles[battleId];
  if (!battle?.tactical || next.military.activeBattleId !== battleId)
    throw new Error("战场不存在或未激活");
  if (![battle.attackerId, battle.defenderId].includes(nationId))
    throw new Error("无法指挥此战役");
  tacticalAutomationStep(
    content,
    next,
    battle,
    nationId === battle.attackerId ? "attacker" : "defender",
  );
  return next;
}
export function finishManualBattle(
  content: Content,
  world: WorldState,
  battleId: string,
  nationId: string,
  retreat = false,
) {
  const next = copyWorld(world);
  const b = next.military.battles[battleId];
  if (!b || ![b.attackerId, b.defenderId].includes(nationId))
    throw new Error("无法指挥此战役");
  commitTactical(
    content,
    next,
    b,
    retreat ? (nationId === b.attackerId ? "attacker" : "defender") : undefined,
  );
  return advanceBattleDay(content, next);
}
