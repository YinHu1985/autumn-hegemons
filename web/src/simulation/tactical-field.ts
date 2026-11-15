import type { Content } from "../definitions/types";
import type { Battle, TacticalUnit } from "./military-state";

/** Public battlefield geometry and terrain, independent of any side's intelligence. */
export const BOARD_COLUMNS = 12;
export const alive = (unit: TacticalUnit) =>
  unit.cadre + unit.levy > 0 && unit.morale > 8;

export function tacticalRows(battle: Battle) {
  return Math.max(
    8,
    Math.ceil(
      Math.max(
        battle.tactical?.units.filter((unit) => unit.side === "attacker")
          .length ?? 0,
        battle.tactical?.units.filter((unit) => unit.side === "defender")
          .length ?? 0,
      ) / 3,
    ),
  );
}

export function tacticalTerrain(
  content: Content,
  battle: Battle,
  x: number,
  y: number,
) {
  const main =
    content.scenario.settlements.find((city) => city.id === battle.cityId)
      ?.terrain ?? "plain";
  const pattern = (x * 7 + y * 11) % 13;
  if (pattern < 2)
    return main === "forest" || main === "jungle" ? "forest" : "hill";
  if (pattern === 4) return "forest";
  return "plain";
}
