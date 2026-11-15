import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import type { Army, Battle } from "./military-state";
import { logMilitary, randomMilitary } from "./military-state";
import {
  armySize,
  militaryStrength,
  applyCasualties,
} from "./military-strength";
import { researchModifier } from "./research";
import { applyOffensiveFatigue, recordCombat } from "./military-fatigue";
import { defenseQueue } from "./military-queue";
import {
  occupyCity,
  returnExpedition,
  releaseDefender,
  returnGarrison,
  reconcileCampaigns,
  setGeneralBusy,
} from "./military-lifecycle";
export { occupyCity } from "./military-lifecycle";

export function battleArmies(
  world: WorldState,
  battle: Battle,
  side: "attacker" | "defender",
) {
  return (side === "attacker" ? battle.attackerArmies : battle.defenderArmies)
    .map((id) => world.military.armies[id])
    .filter((army): army is Army => {
      if (!army || armySize(army) <= 0) return false;
      if (side === "attacker")
        return (
          army.nationId === battle.attackerId &&
          army.expedition &&
          army.status === "battle"
        );
      return (
        army.nationId === battle.defenderId &&
        !army.expedition &&
        (battle.phase === "preparation"
          ? army.status === "idle"
          : army.status === "battle")
      );
    });
}

export function availableGarrison(
  content: Content,
  world: WorldState,
  battle: Battle,
) {
  if (battle.phase !== "preparation") return battle.garrison;
  const city = world.settlements[battle.cityId];
  if (!city || city.owner !== battle.defenderId) return 0;
  return Math.floor(
    Math.min(
      world.nations[battle.defenderId].manpower,
      city.scale * 900 + (city.buildings.garrison?.level ?? 0) * 400,
    ),
  );
}

/** The same strategic defensive advantages also enter the tactical snapshot. */
export function defenseAdvantage(
  content: Content,
  world: WorldState,
  battle: Battle,
) {
  const terrain = content.scenario.settlements.find(
    (city) => city.id === battle.cityId,
  )?.terrain;
  return Math.max(
    0.1,
    1 +
      cityFortification(content, world, battle.cityId) * 0.18 +
      (["hill", "forest", "mountain"].includes(terrain ?? "") ? 0.2 : 0) +
      researchModifier(content, world, battle.defenderId, "army.defense"),
  );
}

export function battleStrength(
  content: Content,
  world: WorldState,
  battle: Battle,
  side: "attacker" | "defender",
) {
  const strength = battleArmies(world, battle, side).reduce(
    (sum, army) => sum + militaryStrength(content, world, army),
    0,
  );
  if (side === "attacker")
    return (
      strength *
      Math.max(
        0.1,
        1 + researchModifier(content, world, battle.attackerId, "army.offense"),
      )
    );
  return (
    (strength + availableGarrison(content, world, battle) * 0.5) *
    defenseAdvantage(content, world, battle)
  );
}

/** Mutating internal operation. Public commands validate ownership and clone the world first. */
export function createCampaign(
  content: Content,
  world: WorldState,
  armies: Army[],
  cityId: string,
) {
  const city = world.settlements[cityId];
  const attackerId = armies[0].nationId;
  const order = world.military.nextId++;
  const id = `battle-${order}`;
  const defenders = Object.values(world.military.armies).filter(
    (army) =>
      army.nationId === city.owner &&
      army.cityId === city.id &&
      army.status === "idle" &&
      !army.expedition &&
      armySize(army) > 0,
  );
  const battle: Battle = {
    id,
    cityId,
    attackerId,
    defenderId: city.owner,
    attackerArmies: armies.map((army) => army.id),
    defenderArmies: defenders.map((army) => army.id),
    kind: "field",
    phase: "preparation",
    elapsed: 0,
    preparationDays: content.warfare.preparationDays,
    startedDay: world.military.day,
    order,
    garrison: 0,
    result: null,
    tactical: null,
  };
  world.military.battles[id] = battle;
  for (const army of armies) {
    applyOffensiveFatigue(content, army, world.military.day);
    army.status = "battle";
    army.expedition = true;
    army.destination = cityId;
    army.remainingDays = 0;
    setGeneralBusy(world, army, true);
  }
  logMilitary(
    world.military,
    `向${content.scenario.settlements.find((item) => item.id === cityId)?.name}发起进攻，准备期${battle.preparationDays}日`,
  );
  return battle;
}

/** Compatibility entry for scenarios that already place an idle army at an enemy city. */
export function beginBattle(content: Content, world: WorldState, army: Army) {
  const city = world.settlements[army.cityId];
  if (
    !city ||
    city.owner === army.nationId ||
    army.status !== "idle" ||
    !armySize(army)
  )
    return;
  createCampaign(content, world, [army], city.id);
}

function lockDefense(content: Content, world: WorldState, battle: Battle) {
  const defenders = battleArmies(world, battle, "defender");
  battle.defenderArmies = defenders.map((army) => army.id);
  battle.garrison = availableGarrison(content, world, battle);
  world.nations[battle.defenderId].manpower -= battle.garrison;
  for (const army of defenders) {
    army.status = "battle";
    army.destination = battle.cityId;
    army.remainingDays = 0;
    setGeneralBusy(world, army, true);
  }
  battle.phase = "ready";
}

export function finishBattle(
  content: Content,
  world: WorldState,
  battle: Battle,
  winner: "attacker" | "defender",
  applyLosses = true,
  combatOccurred = battle.phase === "ready",
  resultText?: string,
) {
  if (battle.phase === "resolved") return;
  // Cleanup must include destroyed formations: a zero-size army still owns its campaign lock.
  const attackers = battle.attackerArmies
    .map((id) => world.military.armies[id])
    .filter(
      (army): army is Army =>
        !!army &&
        army.nationId === battle.attackerId &&
        army.expedition &&
        army.status === "battle",
    );
  const defenders =
    battle.phase === "ready"
      ? battle.defenderArmies
          .map((id) => world.military.armies[id])
          .filter(
            (army): army is Army =>
              !!army &&
              army.nationId === battle.defenderId &&
              !army.expedition &&
              army.status === "battle",
          )
      : [];
  for (const side of ["attacker", "defender"] as const) {
    for (const army of side === "attacker" ? attackers : defenders) {
      if (combatOccurred && applyLosses) {
        const rate = side === winner ? 0.12 : 0.48;
        for (const unit of army.units)
          applyCasualties(
            unit,
            (unit.cadre + unit.levy) *
              rate *
              (0.8 + randomMilitary(world.military) * 0.4),
          );
      }
      if (combatOccurred) recordCombat(army, world.military.day);
      army.units = army.units.filter((unit) => unit.cadre + unit.levy > 0);
    }
  }
  if (combatOccurred && applyLosses)
    battle.garrison = Math.round(
      battle.garrison * (winner === "attacker" ? 0.25 : 0.88),
    );
  // Return surviving local levies before applying the loss of this city's pool capacity.
  returnGarrison(content, world, battle);
  battle.phase = "resolved";
  battle.result =
    resultText ??
    (winner === "attacker" ? "进攻方获胜，取得城镇" : "防守方获胜");
  if (world.military.activeBattleId === battle.id)
    world.military.activeBattleId = null;
  if (winner === "attacker")
    occupyCity(content, world, battle.cityId, battle.attackerId);
  for (const army of attackers)
    if (world.military.armies[army.id]) returnExpedition(content, world, army);
  for (const army of defenders)
    if (world.military.armies[army.id]) releaseDefender(content, world, army);
  logMilitary(
    world.military,
    `${content.scenario.settlements.find((city) => city.id === battle.cityId)?.name}会战结束：${battle.result}`,
  );
}

export function autoResolveBattle(
  content: Content,
  world: WorldState,
  battle: Battle,
) {
  if (battle.phase !== "ready" || battle.tactical)
    throw new Error("尚未到决战时刻");
  const attacker = battleStrength(content, world, battle, "attacker");
  const defender = battleStrength(content, world, battle, "defender");
  finishBattle(
    content,
    world,
    battle,
    attacker * (0.85 + randomMilitary(world.military) * 0.3) >= defender
      ? "attacker"
      : "defender",
  );
}

export function tickBattles(content: Content, world: WorldState) {
  reconcileCampaigns(content, world);
  // Snapshot the front at day's start: resolving a battle cannot give the next one a second turn today.
  const heads = new Set(
    Object.keys(world.nations).map((id) => defenseQueue(world, id)[0]?.id),
  );
  for (const battle of Object.values(world.military.battles)) {
    if (battle.phase === "resolved" || battle.tactical) continue;
    if (!battleArmies(world, battle, "attacker").length) {
      finishBattle(
        content,
        world,
        battle,
        "defender",
        false,
        false,
        "进攻部队已不具备作战能力",
      );
      continue;
    }
    if (battle.phase === "ready") {
      // Imported saves may already contain a ready AI battle from the old decision window.
      if (
        ![battle.attackerId, battle.defenderId].includes(world.playerNationId)
      )
        autoResolveBattle(content, world, battle);
      continue;
    }
    const limit = heads.has(battle.id)
      ? battle.preparationDays
      : Math.floor(battle.preparationDays * content.warfare.queuedProgressCap);
    battle.elapsed = Math.min(limit, battle.elapsed + 1);
    if (!heads.has(battle.id) || battle.elapsed < battle.preparationDays)
      continue;
    lockDefense(content, world, battle);
    logMilitary(
      world.military,
      `${content.scenario.settlements.find((city) => city.id === battle.cityId)?.name}准备完毕，进入决战`,
    );
    if (!battleArmies(world, battle, "defender").length && battle.garrison <= 0)
      finishBattle(
        content,
        world,
        battle,
        "attacker",
        false,
        false,
        "守方无可用兵力，城镇易手",
      );
    else if (
      ![battle.attackerId, battle.defenderId].includes(world.playerNationId)
    )
      autoResolveBattle(content, world, battle);
  }
}

export function retreatBattle(
  content: Content,
  world: WorldState,
  battleId: string,
  nationId: string,
) {
  const battle = world.military.battles[battleId];
  if (
    !battle ||
    battle.phase === "resolved" ||
    battle.tactical ||
    ![battle.attackerId, battle.defenderId].includes(nationId)
  )
    throw new Error("战役不可撤退");
  const attacking = nationId === battle.attackerId;
  finishBattle(
    content,
    world,
    battle,
    attacking ? "defender" : "attacker",
    false,
    false,
    attacking ? "进攻方撤回远征部队" : "防守方放弃城镇",
  );
}

export function cityFortification(
  content: Content,
  world: WorldState,
  cityId: string,
) {
  const city = world.settlements[cityId];
  return (
    Object.entries(city.buildings).reduce(
      (sum, [id, state]) =>
        sum +
        (content.buildings.find((building) => building.id === id)?.levels[
          state.effectiveLevel - 1
        ]?.modifiers?.fortification ?? 0),
      0,
    ) *
    city.governance *
    world.nations[city.owner].operatingCoverage.buildings
  );
}
