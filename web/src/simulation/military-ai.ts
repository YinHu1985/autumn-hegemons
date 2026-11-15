import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import {
  assignGeneral,
  recruitRegiment,
  reinforceArmy,
  createArmy,
  startAttack,
  assignBattleDefenders,
} from "./military-commands";
import { armySize, armyLimits, militaryStrength } from "./military-strength";
import { defenseQueue } from "./military-queue";
import { battleStrength, retreatBattle } from "./military-battles";
import { canAttackCity } from "./geography";

/** AI follows the same attack commitments, defensive plans, and recovery rules as the player. */
export function tickMilitaryAI(content: Content, world: WorldState) {
  if (![10, 20, 30].includes(world.date.day)) return;
  for (const nationId of Object.keys(world.nations)) {
    if (nationId === world.playerNationId) continue;
    const cities = Object.values(world.settlements).filter(
      (city) => city.owner === nationId,
    );
    if (!cities.length) continue;
    const threat = defenseQueue(world, nationId)[0];
    const available = () =>
      Object.values(world.military.armies).filter(
        (army) =>
          army.nationId === nationId &&
          army.status === "idle" &&
          !army.expedition &&
          armySize(army) > 0,
      );
    if (threat?.phase === "preparation") {
      const remaining = threat.preparationDays - threat.elapsed;
      const incoming = battleStrength(content, world, threat, "attacker");
      const reserve = available().reduce(
        (sum, army) => sum + militaryStrength(content, world, army),
        0,
      );
      if (reserve < incoming * 0.8) {
        for (const campaign of Object.values(world.military.battles)) {
          if (
            campaign.attackerId !== nationId ||
            campaign.phase !== "preparation"
          )
            continue;
          const untilVictory = campaign.preparationDays - campaign.elapsed;
          if (untilVictory + content.warfare.returnDays > remaining)
            retreatBattle(content, world, campaign.id, nationId);
        }
      }
    }
    for (const armyId of Object.keys(world.military.armies)) {
      let army = world.military.armies[armyId];
      if (
        army.nationId !== nationId ||
        army.status !== "idle" ||
        army.expedition
      )
        continue;
      if (!army.generalId) {
        const general = Object.values(world.research.talents).find(
          (talent) =>
            talent.nationId === nationId &&
            talent.role === "general" &&
            talent.recruitedMonth !== null &&
            !talent.busy &&
            !Object.values(world.military.armies).some(
              (item) => item.generalId === talent.id,
            ),
        );
        if (general) {
          Object.assign(
            world,
            assignGeneral(world, nationId, armyId, general.id),
          );
          army = world.military.armies[armyId];
        }
      }
      const currentThreat = defenseQueue(world, nationId)[0];
      const urgent =
        currentThreat &&
        currentThreat.preparationDays - currentThreat.elapsed <= 30;
      const nation = world.nations[nationId];
      if (
        !urgent &&
        army.units.length < 4 &&
        nation.treasury > 70 &&
        nation.manpower >= 1000
      ) {
        const levy =
          content.units.find((unit) => !unit.requires && unit.cadre === 0) ??
          content.units[0];
        if (
          levy &&
          nation.treasury >= levy.cost &&
          nation.manpower >= levy.cadre + levy.levy
        ) {
          Object.assign(
            world,
            recruitRegiment(content, world, nationId, armyId, levy.id),
          );
          continue;
        }
      }
      const ideal = army.units.reduce((sum, unit) => {
        const type = content.units.find((item) => item.id === unit.typeId);
        return sum + (type ? type.cadre + type.levy : 0);
      }, 0);
      if (
        !urgent &&
        armySize(army) < ideal * 0.7 &&
        nation.treasury > 60 &&
        nation.manpower > 1000
      ) {
        Object.assign(world, reinforceArmy(content, world, nationId, armyId));
        continue;
      }
      if (
        currentThreat ||
        armySize(army) < 2500 ||
        army.units.some(
          (unit) =>
            unit.morale < 55 ||
            (unit.offensiveFatigue ?? 0) > 0.01 ||
            (unit.lastBattleDay !== undefined &&
              world.military.day - unit.lastBattleDay <
                content.warfare.recentCombatDays),
        )
      )
        continue;
      const origin = content.scenario.settlements.find(
        (city) => city.id === army.cityId,
      )!;
      const targets = content.scenario.settlements
        .filter(
          (city) =>
            canAttackCity(content, world, nationId, city.id) &&
            !Object.values(world.military.battles).some(
              (battle) =>
                battle.attackerId === nationId &&
                battle.cityId === city.id &&
                battle.phase !== "resolved",
            ),
        )
        .sort((a, b) => {
          const cost = (city: typeof a) =>
            Math.hypot(city.map.x - origin.map.x, city.map.y - origin.map.y) +
            world.settlements[city.id].scale * 55 +
            defenseQueue(world, world.settlements[city.id].owner).length * 120;
          return cost(a) - cost(b);
        });
      const target = targets[0];
      if (
        target &&
        !(
          world.military.day < 31 &&
          world.settlements[target.id].owner === world.playerNationId
        )
      )
        Object.assign(
          world,
          startAttack(content, world, nationId, [armyId], target.id),
        );
    }
    // Defense plans can name troops still returning; readiness is checked again on the decisive day.
    for (const campaign of defenseQueue(world, nationId)) {
      if (campaign.phase !== "preparation") continue;
      const defenders = Object.values(world.military.armies).filter(
        (army) =>
          army.nationId === nationId &&
          armySize(army) > 0 &&
          (!army.expedition || army.status === "returning"),
      );
      Object.assign(
        world,
        assignBattleDefenders(
          content,
          world,
          campaign.id,
          nationId,
          defenders.map((army) => army.id),
        ),
      );
    }
    const ownArmies = Object.values(world.military.armies).filter(
      (army) => army.nationId === nationId,
    );
    const nation = world.nations[nationId];
    if (
      ownArmies.length < armyLimits(content, world, nationId).armies &&
      !ownArmies.some((army) => !army.units.length) &&
      nation.treasury > 300 &&
      nation.manpower > 4000 &&
      (ownArmies.length === 0 || ownArmies.some((army) => army.expedition))
    )
      Object.assign(world, createArmy(content, world, nationId, cities[0].id));
  }
}
