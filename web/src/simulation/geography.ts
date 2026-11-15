import type { Content } from "../definitions/types";
import { scenarioRoads } from "../definitions/roads";
import type { WorldState } from "./state";
import { diplomaticRelation } from "./diplomacy";

/** National reserves may attack any frontier city directly linked to current land. */
export function canAttackCity(
  content: Content,
  world: WorldState,
  nationId: string,
  cityId: string,
): boolean {
  const target = world.settlements[cityId];
  if (!world.nations[nationId] || !target || target.owner === nationId)
    return false;
  if (diplomaticRelation(content, world, nationId, target.owner) !== "hostile")
    return false;
  return scenarioRoads(content.scenario).some((road) => {
    const neighbor =
      road.from === cityId ? road.to : road.to === cityId ? road.from : null;
    return neighbor !== null && world.settlements[neighbor]?.owner === nationId;
  });
}
