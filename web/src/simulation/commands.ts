import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { copyWorld } from "./state";
import { constructionQuote } from "./settlements";
import { hasTechnology } from "./research";

export type BudgetCategory = "buildings" | "army" | "research";
export function setBudget(
  world: WorldState,
  nationId: string,
  category: BudgetCategory,
  rate: number,
): WorldState {
  if (!world.nations[nationId]) throw new Error("国家不存在");
  if (!Number.isFinite(rate) || rate < 0 || rate > 1)
    throw new Error("维护比例应在 0 到 100% 之间");
  const next = copyWorld(world);
  next.nations[nationId].budget[category] = rate;
  return next;
}
export function setBuildingBudget(
  world: WorldState,
  nationId: string,
  rate: number,
): WorldState {
  return setBudget(world, nationId, "buildings", rate);
}

export function canBuildSpecialty(
  building: Content["buildings"][number],
  specialty: string,
): boolean {
  return (
    (!building.specialty || building.specialty === specialty) &&
    (!building.specialties || building.specialties.includes(specialty))
  );
}
export function startConstruction(
  content: Content,
  world: WorldState,
  cityId: string,
  buildingId: string,
): WorldState {
  const city = world.settlements[cityId];
  const building = content.buildings.find((item) => item.id === buildingId);
  if (!city || !building) throw new Error("城镇或建筑不存在");
  if (city.construction) throw new Error("这座城镇已有工程");
  const start = content.scenario.settlements.find(
    (item) => item.id === cityId,
  )!;
  if (!canBuildSpecialty(building, start.specialty))
    throw new Error("本地特产不允许建造这座作坊");
  const current = city.buildings[buildingId]?.level ?? 0;
  if (current >= building.levels.length) throw new Error("已达到建筑最高等级");
  const level = building.levels[current];
  if (level.technology && !hasTechnology(world, city.owner, level.technology))
    throw new Error(
      `尚未掌握 ${content.technologies.find((item) => item.id === level.technology)?.name ?? level.technology}`,
    );
  const quote = constructionQuote(content, world, cityId, buildingId);
  if (world.nations[city.owner].treasury < quote.cost)
    throw new Error("财政粮食不足");
  const next = copyWorld(world);
  next.nations[city.owner].treasury -= quote.cost;
  next.settlements[cityId].construction = {
    buildingId,
    targetLevel: current + 1,
    remainingDays: quote.days,
  };
  return next;
}
export function startExpansion(
  content: Content,
  world: WorldState,
  cityId: string,
): WorldState {
  const city = world.settlements[cityId];
  if (!city) throw new Error("城镇不存在");
  if (city.construction) throw new Error("这座城镇已有工程");
  if (city.scale >= 7) throw new Error("城镇已达到当前规模上限");
  const quote = constructionQuote(content, world, cityId, "__expand");
  if (world.nations[city.owner].treasury < quote.cost)
    throw new Error("财政粮食不足");
  const next = copyWorld(world);
  next.nations[city.owner].treasury -= quote.cost;
  next.settlements[cityId].construction = {
    buildingId: "__expand",
    targetLevel: city.scale + 1,
    remainingDays: quote.days,
  };
  return next;
}
