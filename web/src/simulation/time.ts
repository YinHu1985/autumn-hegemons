import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { copyWorld } from "./state";
import { calculateEconomy } from "./economy";
import {
  researchUpkeep,
  tickResearchMonth,
  fundResearchMonth,
} from "./research";
import {
  militaryUpkeep,
  tickMilitaryDay,
  hasManualBattle,
  hasPendingBattle,
} from "./military";
import { tickCivicDay, tickCivicMonth } from "./civic";
import { tickAI } from "./ai";
import { tickDiplomacyDay, tickDiplomacyYear } from "./diplomacy";
import { pruneExpiredModifiers } from "./modifier-instances";
import { emitEventFact } from "./events/state";
import { flushEventFacts, tickEventsDay, tickEventsMonth } from "./events";

const categories = ["buildings", "army", "research"] as const;
export function settleMonth(content: Content, world: WorldState): void {
  // 本期科研使用上期已支付投入，随后为下期安排预算。
  const economyAtClose = Object.fromEntries(
    Object.keys(world.nations).map((id) => [
      id,
      calculateEconomy(content, world, id),
    ]),
  );
  tickResearchMonth(content, world);
  for (const nation of Object.values(world.nations)) {
    if (
      !Object.values(world.settlements).some((city) => city.owner === nation.id)
    )
      continue;
    const economy = economyAtClose[nation.id];
    const required = {
      buildings: economy.fullBuildingUpkeep,
      army: militaryUpkeep(content, world, nation.id),
      research: researchUpkeep(content, world, nation.id),
    };
    const requested = categories.reduce(
      (sum, key) => sum + required[key] * nation.budget[key],
      0,
    );
    const funds = Math.max(0, nation.treasury + economy.income);
    const ratio = requested > 0 ? Math.min(1, funds / requested) : 1;
    const report: NonNullable<typeof nation.lastReport>["categories"] = {};
    let paid = 0;
    for (const key of categories) {
      const planned = required[key] * nation.budget[key];
      const actual = planned * ratio;
      const coverage = required[key] ? actual / required[key] : 1;
      nation.operatingCoverage[key] = coverage;
      report[key] = {
        required: required[key],
        requested: planned,
        paid: actual,
        coverage,
      };
      paid += actual;
    }
    nation.treasury = Math.max(0, funds - paid);
    nation.lastReport = {
      date: { ...world.date },
      income: economy.income,
      required: Object.values(required).reduce((a, b) => a + b, 0),
      requested,
      paid,
      coverage: nation.operatingCoverage.buildings,
      closingTreasury: nation.treasury,
      categories: report,
    };
    fundResearchMonth(world, nation.id);
  }
  for (const city of Object.values(world.settlements))
    for (const building of Object.values(city.buildings))
      building.effectiveLevel = building.level;
  tickCivicMonth(content, world);
}
function oneDay(
  content: Content,
  world: WorldState,
  settlingBattle = false,
): void {
  const closingMonth = world.date.day === 30;
  for (const city of Object.values(world.settlements)) {
    if (!city.construction) continue;
    city.construction.remainingDays -= 1;
    if (city.construction.remainingDays <= 0) {
      const { buildingId, targetLevel } = city.construction;
      if (buildingId === "__expand") city.scale = targetLevel;
      else
        city.buildings[buildingId] = {
          level: targetLevel,
          effectiveLevel: city.buildings[buildingId]?.effectiveLevel ?? 0,
        };
      city.construction = null;
      emitEventFact(world, {
        type: "construction_completed",
        nationId: city.owner,
        settlementId: city.id,
        subjectId: buildingId,
      });
    }
  }
  tickCivicDay(content, world);
  tickMilitaryDay(content, world, settlingBattle);
  tickDiplomacyDay(content, world);
  if (world.date.day === 30) {
    settleMonth(content, world);
    world.date.day = 1;
    world.date.month++;
    if (world.date.month === 13) {
      world.date.month = 1;
      world.date.year++;
      if (world.date.year === 0) world.date.year = 1;
      tickDiplomacyYear(content, world);
    }
  } else world.date.day++;
  // Queries already exclude effects at the expiry boundary; storage follows the clock.
  pruneExpiredModifiers(world);
  // All domains commit first. New reports use the resulting date and retain their full decision window.
  flushEventFacts(content, world);
  if (closingMonth) tickEventsMonth(content, world);
  tickEventsDay(content, world);
  tickAI(content, world);
}
export function advanceDays(
  content: Content,
  world: WorldState,
  days: number,
): WorldState {
  if (!Number.isInteger(days) || days < 1 || days > 360)
    throw new Error("推进天数需在1到360之间");
  if (hasManualBattle(world) || hasPendingBattle(world)) return world;
  const next = copyWorld(world);
  const existingEvents = new Set(world.civic.events.map((event) => event.id));
  for (let i = 0; i < days; i++) {
    oneDay(content, next);
    if (hasManualBattle(next) || hasPendingBattle(next)) break;
    if (
      next.civic.events.some(
        (event) =>
          event.nationId === next.playerNationId &&
          !existingEvents.has(event.id) &&
          content.events.find(
            (definition) => definition.id === event.definitionId,
          )?.presentation?.important,
      )
    )
      break;
  }
  return next;
}

/** An atomic battle consumes one strategic day even when another decision is waiting. */
export function advanceBattleDay(
  content: Content,
  world: WorldState,
): WorldState {
  if (hasManualBattle(world)) throw new Error("请先结算当前决战");
  const next = copyWorld(world);
  oneDay(content, next, true);
  return next;
}
