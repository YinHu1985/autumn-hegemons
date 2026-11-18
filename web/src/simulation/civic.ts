import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { calculateEconomy } from "./economy";
import { resolveStat } from "./modifier-query";
import { governanceCap } from "./settlements";
export { buildingCapacity, constructionQuote } from "./settlements";

export type { ActiveEvent, ChronicleEntry, CivicState } from "./events/state";
export { eventRandom as civicRandom } from "./events/state";
export { chooseEvent } from "./events/commands";
import { createEventState, type CivicState } from "./events/state";
export function createCivic(_content: Content): CivicState {
  return createEventState();
}
export function recordChronicle(
  world: WorldState,
  nationId: string,
  text: string,
): void {
  world.civic.log.unshift({ date: { ...world.date }, nationId, text });
  world.civic.log = world.civic.log.slice(0, 160);
}
export function manpowerCapacity(
  content: Content,
  world: WorldState,
  nationId: string,
): number {
  const cities = Object.values(world.settlements).filter(
    (city) => city.owner === nationId,
  );
  const additional = calculateEconomy(
    content,
    world,
    nationId,
  ).modifierContributions;
  return Math.floor(
    cities.reduce(
      (sum, city) =>
        sum +
        city.scale *
          city.governance *
          2000 *
          resolveStat(
            content,
            world,
            { nationId, settlementId: city.id },
            "manpower",
            1,
            { min: 0.1, additional },
          ).value,
      0,
    ),
  );
}
export function tickCivicDay(content: Content, world: WorldState): void {
  for (const city of Object.values(world.settlements)) {
    const cap = governanceCap(content, world, city.owner, city.id);
    if (city.governance < cap)
      city.governance = Math.min(
        cap,
        city.governance +
          0.0005 *
            resolveStat(
              content,
              world,
              { nationId: city.owner, settlementId: city.id },
              "governance_growth",
              1,
              { min: 0 },
            ).value,
      );
  }
}
export function tickCivicMonth(content: Content, world: WorldState): void {
  for (const nation of Object.values(world.nations)) {
    const capacity = manpowerCapacity(content, world, nation.id);
    nation.manpower = Math.min(
      capacity,
      nation.manpower + Math.floor(capacity * 0.015),
    );
  }
}
