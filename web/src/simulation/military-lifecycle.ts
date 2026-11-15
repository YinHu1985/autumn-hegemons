import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import type { Army, Battle } from "./military-state";
import { logMilitary } from "./military-state";
import { manpowerCapacity } from "./civic";

export function nationHasLand(world: WorldState, nationId: string) {
  return Object.values(world.settlements).some(
    (city) => city.owner === nationId,
  );
}

export function setGeneralBusy(world: WorldState, army: Army, busy: boolean) {
  if (army.generalId && world.research.talents[army.generalId])
    world.research.talents[army.generalId].busy = busy;
}

/** The national pool is represented by idle armies stationed in any friendly city. */
export function relocateHome(content: Content, world: WorldState, army: Army) {
  if (world.settlements[army.cityId]?.owner === army.nationId) return true;
  const origin = content.scenario.settlements.find(
    (city) => city.id === army.cityId,
  );
  const home = content.scenario.settlements
    .filter((city) => world.settlements[city.id]?.owner === army.nationId)
    .sort((a, b) => {
      if (!origin) return a.id.localeCompare(b.id);
      return (
        Math.hypot(a.map.x - origin.map.x, a.map.y - origin.map.y) -
        Math.hypot(b.map.x - origin.map.x, b.map.y - origin.map.y)
      );
    })[0];
  if (!home) return false;
  army.cityId = home.id;
  return true;
}

export function releaseDefender(
  content: Content,
  world: WorldState,
  army: Army,
) {
  army.status = "idle";
  army.expedition = false;
  army.remainingDays = 0;
  army.destination = null;
  relocateHome(content, world, army);
  setGeneralBusy(world, army, false);
}

export function returnExpedition(
  content: Content,
  world: WorldState,
  army: Army,
) {
  army.status = "returning";
  army.expedition = true;
  army.remainingDays = content.warfare.returnDays;
  relocateHome(content, world, army);
  army.destination = army.cityId;
  setGeneralBusy(world, army, true);
}

export function returnGarrison(
  content: Content,
  world: WorldState,
  battle: Battle,
) {
  if (battle.garrison > 0) {
    const nation = world.nations[battle.defenderId];
    nation.manpower = Math.min(
      manpowerCapacity(content, world, battle.defenderId),
      nation.manpower + battle.garrison,
    );
    battle.garrison = 0;
  }
}

/** Cancel a stale objective instead of silently declaring war on its new owner. */
export function cancelCampaign(
  content: Content,
  world: WorldState,
  battle: Battle,
  reason: string,
) {
  if (battle.phase === "resolved") return;
  const lockedDefense = battle.phase === "ready";
  for (const id of battle.attackerArmies) {
    const army = world.military.armies[id];
    if (army?.expedition && army.status === "battle")
      returnExpedition(content, world, army);
  }
  if (lockedDefense)
    for (const id of battle.defenderArmies) {
      const army = world.military.armies[id];
      if (army && !army.expedition && army.status === "battle")
        releaseDefender(content, world, army);
    }
  returnGarrison(content, world, battle);
  battle.phase = "resolved";
  battle.result = reason;
  if (world.military.activeBattleId === battle.id)
    world.military.activeBattleId = null;
  logMilitary(
    world.military,
    `${content.scenario.settlements.find((city) => city.id === battle.cityId)?.name}：${reason}`,
  );
}

export function reconcileCampaigns(content: Content, world: WorldState) {
  for (const battle of Object.values(world.military.battles)) {
    if (battle.phase === "resolved") continue;
    if (!nationHasLand(world, battle.attackerId))
      cancelCampaign(content, world, battle, "进攻国灭亡，战役取消");
    else if (world.settlements[battle.cityId]?.owner !== battle.defenderId)
      cancelCampaign(content, world, battle, "目标归属已变，撤回远征部队");
  }
}

export function occupyCity(
  content: Content,
  world: WorldState,
  cityId: string,
  nationId: string,
) {
  const city = world.settlements[cityId];
  const old = city.owner;
  if (old === nationId) return;
  const oldCap = manpowerCapacity(content, world, old);
  city.owner = nationId;
  city.governance = 0.25;
  city.construction = null;
  world.nations[old].manpower =
    oldCap > 0
      ? (world.nations[old].manpower * manpowerCapacity(content, world, old)) /
        oldCap
      : 0;
  logMilitary(
    world.military,
    `${content.scenario.settlements.find((item) => item.id === cityId)?.name}归属${content.scenario.nations.find((nation) => nation.id === nationId)?.name}国`,
  );
  reconcileCampaigns(content, world);
  if (!nationHasLand(world, old)) {
    for (const army of Object.values(world.military.armies).filter(
      (item) => item.nationId === old,
    )) {
      setGeneralBusy(world, army, false);
      delete world.military.armies[army.id];
    }
    logMilitary(
      world.military,
      `${content.scenario.nations.find((nation) => nation.id === old)?.name}国灭亡`,
    );
  } else {
    for (const army of Object.values(world.military.armies))
      if (
        army.nationId === old &&
        ["idle", "resting", "returning"].includes(army.status)
      ) {
        relocateHome(content, world, army);
        if (army.status === "returning") army.destination = army.cityId;
      }
  }
}
