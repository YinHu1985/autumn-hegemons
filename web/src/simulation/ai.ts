import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { calculateEconomy } from "./economy";
import { startConstruction, canBuildSpecialty } from "./commands";
import { constructionQuote, buildingCapacity } from "./settlements";
import { hasTechnology } from "./research";

/** Simple economic steward: keeps an operating reserve, builds affordable local production. */
export function tickEconomyAI(
  content: Content,
  world: WorldState,
  playerNationId: string,
): void {
  for (const nation of Object.values(world.nations)) {
    if (nation.id === playerNationId) continue;
    const cities = Object.values(world.settlements).filter(
      (city) => city.owner === nation.id,
    );
    if (!cities.length) continue;
    const economy = calculateEconomy(content, world, nation.id);
    nation.budget.buildings = 1;
    nation.budget.army = nation.treasury < economy.income * 0.5 ? 0.65 : 1;
    nation.budget.research = nation.treasury < economy.income ? 0.5 : 1;
    if (nation.treasury < economy.income * 2 + 50) continue;
    for (const city of cities) {
      if (city.construction) continue;
      const specialty = content.scenario.settlements.find(
        (item) => item.id === city.id,
      )!.specialty;
      const options = content.buildings
        .filter((building) => {
          const current = city.buildings[building.id]?.level ?? 0;
          const next = building.levels[current];
          return (
            next &&
            canBuildSpecialty(building, specialty) &&
            (!next.technology ||
              hasTechnology(world, nation.id, next.technology)) &&
            (current > 0 ||
              Object.keys(city.buildings).length < buildingCapacity(city))
          );
        })
        .sort(
          (a, b) =>
            Number(!!b.specialty || !!b.specialties) -
            Number(!!a.specialty || !!a.specialties),
        );
      const building = options.find(
        (item) =>
          constructionQuote(content, world, city.id, item.id).cost <
          nation.treasury - economy.income * 2,
      );
      if (!building) continue;
      const next = startConstruction(content, world, city.id, building.id);
      nation.treasury = next.nations[nation.id].treasury;
      city.construction = next.settlements[city.id].construction;
      break;
    }
  }
}

import { tickResearchAI } from "./research-ai";
import { hasPendingBattle } from "./military-queue";
import { tickMilitaryAI } from "./military-ai";
import { resolveAIEvents } from "./events";

/** AI uses the same commands and prices as the player. Decisions are deliberately sparse. */
export function tickAI(content: Content, world: WorldState): void {
  resolveAIEvents(content, world);
  if (world.military.activeBattleId || hasPendingBattle(world)) return;
  const playerNationId = world.playerNationId;
  if (world.date.day === 1) {
    tickEconomyAI(content, world, playerNationId);
    tickResearchAI(content, world, playerNationId);
  }
  tickMilitaryAI(content, world);
}
