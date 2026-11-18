import type { Content } from "../definitions/types";
import type { SettlementState, WorldState } from "./state";
import { resolveStat } from "./modifier-query";

export const terrainNames: Record<string, string> = {
  plain: "平原",
  forest: "森林",
  jungle: "丛林",
  hill: "丘陵",
  mountain: "高山",
  marsh: "沼泽",
  swamp: "沼泽",
  desert: "沙漠",
  tundra: "冻土",
};
export function buildingCapacity(city: SettlementState): number {
  return Math.min(8, city.scale + 1);
}
export function buildingCrowding(city: SettlementState): number {
  const count = Object.keys(city.buildings).length;
  return count <= buildingCapacity(city)
    ? 1
    : (buildingCapacity(city) / count) ** 2;
}
export function governanceCap(
  content: Content,
  world: WorldState,
  nationId: string,
  settlementId?: string,
): number {
  return resolveStat(
    content,
    world,
    { nationId, settlementId },
    "governance_cap",
    0.85,
    { min: 0.2, max: 1 },
  ).value;
}
export function constructionQuote(
  content: Content,
  world: WorldState,
  cityId: string,
  buildingId: string,
) {
  const city = world.settlements[cityId];
  const start = content.scenario.settlements.find((item) => item.id === cityId);
  if (!city || !start) throw new Error("城镇不存在");
  const expanding = buildingId === "__expand";
  const building = content.buildings.find((item) => item.id === buildingId);
  const level = building?.levels[city.buildings[buildingId]?.level ?? 0];
  if (!expanding && !level) throw new Error("建筑已达最高等级或不存在");
  const terrain = content.terrains.find((item) => item.id === start.terrain);
  const cost = expanding ? city.scale * city.scale * 55 : level!.cost;
  const days = expanding ? 90 + city.scale * 30 : level!.days;
  return {
    cost: Math.ceil(
      cost *
        (terrain?.constructionCost ?? 1) *
        resolveStat(
          content,
          world,
          { nationId: city.owner, settlementId: cityId },
          "building_cost",
          1,
          { min: 0.25 },
        ).value,
    ),
    days: Math.ceil(
      (days * (terrain?.constructionTime ?? 1)) /
        resolveStat(
          content,
          world,
          { nationId: city.owner, settlementId: cityId },
          "building_speed",
          1,
          { min: 0.25 },
        ).value,
    ),
  };
}
