import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { copyWorld } from "./state";
import { resolveStat } from "./modifier-query";
import { manpowerCapacity } from "./civic";
import { armySize, maximumCadreRatio, unitUnlocked } from "./military-strength";
import { logMilitary } from "./military-state";
import { createCampaign } from "./military-battles";
import { canAttackCity } from "./geography";
function ownedArmy(world: WorldState, nationId: string, armyId: string) {
  const army = world.military.armies[armyId];
  if (!army || army.nationId !== nationId) throw new Error("无法指挥这支军团");
  return army;
}
function idleArmy(world: WorldState, nationId: string, armyId: string) {
  if (world.military.activeBattleId) throw new Error("请先完成当前决战");
  const army = ownedArmy(world, nationId, armyId);
  if (army.status !== "idle" || army.expedition)
    throw new Error("军团必须先结束出征、返程或整训");
  if (world.settlements[army.cityId]?.owner !== nationId)
    throw new Error("请先返回己方城镇");
  return army;
}
export function initializeMilitary(world: WorldState) {
  for (const army of Object.values(world.military.armies)) {
    const nation = world.nations[army.nationId];
    const total = armySize(army);
    if (nation.manpower < total) army.units = [];
    else nation.manpower -= total;
  }
}
export function createArmy(
  content: Content,
  world: WorldState,
  nationId: string,
  cityId: string,
) {
  if (world.settlements[cityId]?.owner !== nationId)
    throw new Error("只能在己方城镇编组");
  const next = copyWorld(world);
  const id = `army-${next.military.nextId++}`;
  const n =
    Object.values(next.military.armies).filter((a) => a.nationId === nationId)
      .length + 1;
  next.military.armies[id] = {
    id,
    nationId,
    name: `第${n}军团`,
    cityId,
    generalId: null,
    units: [],
    status: "idle",
    destination: null,
    remainingDays: 0,
    arrivedDay: -1,
    expedition: false,
  };
  return next;
}
export function recruitRegiment(
  content: Content,
  world: WorldState,
  nationId: string,
  armyId: string,
  typeId: string,
) {
  idleArmy(world, nationId, armyId);
  const type = content.units.find((t) => t.id === typeId);
  if (!type) throw new Error("兵种不存在");
  if (!unitUnlocked(content, world, nationId, typeId))
    throw new Error("尚未研究所需科技");
  const nation = world.nations[nationId];
  if (nation.manpower < type.cadre + type.levy)
    throw new Error("全国可征人力不足");
  if (nation.treasury < type.cost) throw new Error("粮食不足");
  const next = copyWorld(world);
  next.nations[nationId].manpower -= type.cadre + type.levy;
  next.nations[nationId].treasury -= type.cost;
  next.military.armies[armyId].units.push({
    id: `unit-${next.military.nextId++}`,
    typeId,
    cadre: type.cadre,
    levy: type.levy,
    morale: 65,
    training: 25,
  });
  next.military.armies[armyId].status = "resting";
  next.military.armies[armyId].remainingDays = 15;
  return next;
}
export function demobilizeRegiment(
  content: Content,
  world: WorldState,
  nationId: string,
  armyId: string,
  unitId: string,
) {
  const army = idleArmy(world, nationId, armyId);
  const u = army.units.find((t) => t.id === unitId);
  if (!u) throw new Error("部队不存在");
  const next = copyWorld(world);
  next.nations[nationId].manpower = Math.min(
    manpowerCapacity(content, next, nationId),
    next.nations[nationId].manpower + u.cadre + u.levy,
  );
  next.military.armies[armyId].units = next.military.armies[
    armyId
  ].units.filter((t) => t.id !== unitId);
  return next;
}
export function assignGeneral(
  world: WorldState,
  nationId: string,
  armyId: string,
  generalId: string | null,
) {
  const army = idleArmy(world, nationId, armyId);
  const talent = generalId ? world.research.talents[generalId] : null;
  if (
    generalId &&
    (!talent ||
      talent.nationId !== nationId ||
      talent.role !== "general" ||
      talent.recruitedMonth === null)
  )
    throw new Error("需要已招募并调入将领池的人才");
  if (
    talent &&
    (talent.busy ||
      Object.values(world.military.armies).some(
        (a) => a.id !== armyId && a.generalId === talent.id,
      ))
  )
    throw new Error("将领已在另一支军团任职");
  const next = copyWorld(world);
  if (army.generalId && next.research.talents[army.generalId])
    next.research.talents[army.generalId].busy = false;
  next.military.armies[armyId].generalId = generalId;
  return next;
}
export function marchDays(
  content: Content,
  world: WorldState,
  armyId: string,
  destination: string,
) {
  const army = world.military.armies[armyId];
  const from = content.scenario.settlements.find((c) => c.id === army.cityId);
  const to = content.scenario.settlements.find((c) => c.id === destination);
  if (!from || !to) throw new Error("目的地不存在");
  const cavalry =
    army.units.length > 0 &&
    army.units.every(
      (u) =>
        content.units.find((t) => t.id === u.typeId)?.category === "cavalry",
    );
  const terrainFactor = ["mountain", "jungle", "swamp"].includes(to.terrain)
    ? 1.5
    : 1;
  return Math.max(
    20,
    Math.round(
      ((30 + Math.hypot(from.map.x - to.map.x, from.map.y - to.map.y) / 3) *
        terrainFactor) /
        (cavalry ? 1.6 : 1) /
        resolveStat(
          content,
          world,
          { nationId: army.nationId },
          "army.speed",
          1,
          { min: 0.25 },
        ).value,
    ),
  );
}
export function marchArmy(
  content: Content,
  world: WorldState,
  nationId: string,
  armyId: string,
  destination: string,
) {
  const army = idleArmy(world, nationId, armyId);
  if (!army.units.length) throw new Error("空军团无法行军");
  if (destination === army.cityId) throw new Error("军团已在此地");
  if (world.settlements[destination]?.owner !== nationId)
    return startAttack(content, world, nationId, [armyId], destination);
  const days = marchDays(content, world, armyId, destination);
  const next = copyWorld(world);
  const a = next.military.armies[armyId];
  a.status = "marching";
  a.expedition = false;
  a.destination = destination;
  a.remainingDays = days;
  if (a.generalId && next.research.talents[a.generalId])
    next.research.talents[a.generalId].busy = true;
  logMilitary(
    next.military,
    `${a.name}出征，预计${days}日抵达${content.scenario.settlements.find((c) => c.id === destination)?.name}`,
  );
  return next;
}
export function reinforceArmy(
  content: Content,
  world: WorldState,
  nationId: string,
  armyId: string,
) {
  const army = idleArmy(world, nationId, armyId);
  const next = copyWorld(world);
  const nation = next.nations[nationId];
  let restored = 0;
  for (const unit of next.military.armies[armyId].units) {
    const type = content.units.find((u) => u.id === unit.typeId);
    if (!type) continue;
    const targetCore = unit.cadreTarget ?? type.cadre;
    const targetLevy = type.cadre + type.levy - targetCore;
    const need =
      Math.max(0, targetCore - unit.cadre) +
      Math.max(0, targetLevy - unit.levy);
    const take = Math.min(
      need,
      Math.floor(nation.manpower),
      Math.floor(nation.treasury * 15),
    );
    const core = Math.min(Math.max(0, targetCore - unit.cadre), take);
    unit.cadre += core;
    unit.levy += Math.min(Math.max(0, targetLevy - unit.levy), take - core);
    nation.manpower -= take;
    nation.treasury -= take / 15;
    restored += take;
  }
  if (!restored) throw new Error("无需补员，或粮食、人力不足");
  next.military.armies[army.id].status = "resting";
  next.military.armies[army.id].remainingDays = 30;
  return next;
}

export function professionalizeRegiment(
  content: Content,
  world: WorldState,
  nationId: string,
  armyId: string,
  unitId: string,
) {
  const army = idleArmy(world, nationId, armyId);
  const unit = army.units.find((u) => u.id === unitId);
  if (!unit) throw new Error("部队不存在");
  const allowed = Math.floor(
    (unit.cadre + unit.levy) *
      maximumCadreRatio(content, world, nationId, unit.typeId),
  );
  const amount = Math.max(0, allowed - unit.cadre);
  if (amount <= 0) throw new Error("已达到科技允许的常备比例");
  if (world.nations[nationId].treasury < amount * 0.12)
    throw new Error("转训粮食不足");
  const next = copyWorld(world);
  const target = next.military.armies[armyId].units.find(
    (u) => u.id === unitId,
  )!;
  target.cadre += amount;
  target.levy -= amount;
  target.cadreTarget = allowed;
  target.training = Math.max(0, target.training - 10);
  next.nations[nationId].treasury -= amount * 0.12;
  next.military.armies[armyId].status = "resting";
  next.military.armies[armyId].remainingDays = 30;
  return next;
}
export function transferRegiment(
  world: WorldState,
  nationId: string,
  fromId: string,
  toId: string,
  unitId: string,
) {
  const from = idleArmy(world, nationId, fromId);
  const to = idleArmy(world, nationId, toId);
  if (from.id === to.id || from.cityId !== to.cityId)
    throw new Error("只能调入同城的另一支空闲军团");
  const unit = from.units.find((u) => u.id === unitId);
  if (!unit) throw new Error("部队不存在");
  const next = copyWorld(world);
  next.military.armies[fromId].units = next.military.armies[
    fromId
  ].units.filter((u) => u.id !== unitId);
  next.military.armies[toId].units.push({ ...unit });
  return next;
}
export function dismissArmy(
  world: WorldState,
  nationId: string,
  armyId: string,
) {
  const army = idleArmy(world, nationId, armyId);
  if (army.units.length) throw new Error("请先复员或调出全部部队");
  const next = copyWorld(world);
  if (army.generalId && next.research.talents[army.generalId])
    next.research.talents[army.generalId].busy = false;
  delete next.military.armies[armyId];
  for (const battle of Object.values(next.military.battles))
    if (battle.phase === "preparation")
      battle.defenderArmies = battle.defenderArmies.filter(
        (id) => id !== armyId,
      );
  return next;
}

/** A campaign owns its entire attacking formation until the return journey completes. */
export function startAttack(
  content: Content,
  world: WorldState,
  nationId: string,
  armyIds: string[],
  cityId: string,
) {
  const city = world.settlements[cityId];
  if (!city || city.owner === nationId)
    throw new Error("只能向敌国城镇发起进攻");
  if (!canAttackCity(content, world, nationId, cityId))
    throw new Error("只能进攻与本国城邑道路相邻且两国关系险恶的目标");
  if (!armyIds.length || new Set(armyIds).size !== armyIds.length)
    throw new Error("请选择不重复的进攻军团");
  for (const id of armyIds) {
    const army = idleArmy(world, nationId, id);
    if (armySize(army) <= 0) throw new Error("空军团不能出征");
  }
  const next = copyWorld(world);
  createCampaign(
    content,
    next,
    armyIds.map((id) => next.military.armies[id]),
    cityId,
  );
  return next;
}

/** Preparation orders are plans, not a second lock on troops already serving another front. */
export function assignBattleDefenders(
  content: Content,
  world: WorldState,
  battleId: string,
  nationId: string,
  armyIds: string[],
) {
  if (world.military.activeBattleId) throw new Error("请先完成当前决战");
  const battle = world.military.battles[battleId];
  if (
    !battle ||
    battle.defenderId !== nationId ||
    battle.phase !== "preparation"
  )
    throw new Error("只能在准备阶段安排己方防守阵容");
  if (new Set(armyIds).size !== armyIds.length)
    throw new Error("防守军团不可重复");
  for (const id of armyIds) {
    const army = ownedArmy(world, nationId, id);
    if (armySize(army) <= 0) throw new Error("空军团不能迎战");
  }
  const next = copyWorld(world);
  next.military.battles[battleId].defenderArmies = [...armyIds];
  return next;
}
