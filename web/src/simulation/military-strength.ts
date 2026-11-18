import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import type { Army, Regiment } from "./military-state";
import { calculateEconomy } from "./economy";
import { hasTechnology } from "./research";
import { resolveStat } from "./modifier-query";
import { fatigueMultiplier } from "./military-fatigue";
export const armySize = (army: Army) =>
  army.units.reduce((sum, u) => sum + u.cadre + u.levy, 0);
export function militaryUpkeepBreakdown(
  content: Content,
  world: WorldState,
  nationId: string,
) {
  let base = 0;
  let expedition = 0;
  for (const army of Object.values(world.military.armies).filter(
    (item) => item.nationId === nationId,
  )) {
    const upkeep = army.units.reduce((sum, unit) => {
      const type = content.units.find((item) => item.id === unit.typeId);
      return (
        sum +
        (type
          ? (type.upkeep * (unit.cadre * 6 + unit.levy)) /
            Math.max(1, type.cadre * 6 + type.levy)
          : 0)
      );
    }, 0);
    base += upkeep;
    if (army.expedition)
      expedition += upkeep * (content.warfare.expeditionUpkeepMultiplier - 1);
  }
  return { base, expedition, total: base + expedition };
}
export function militaryUpkeep(
  content: Content,
  world: WorldState,
  nationId: string,
) {
  return militaryUpkeepBreakdown(content, world, nationId).total;
}
export function equipmentDemand(
  content: Content,
  world: WorldState,
  nationId: string,
) {
  const demand: Record<string, number> = {};
  for (const a of Object.values(world.military.armies).filter(
    (a) => a.nationId === nationId,
  ))
    for (const u of a.units) {
      const d = content.units.find((t) => t.id === u.typeId);
      if (!d) continue;
      for (const [id, n] of Object.entries(d.equipment))
        demand[id] = (demand[id] ?? 0) + n * (d.cadre ? u.cadre / d.cadre : 1);
    }
  return demand;
}
export function armyLimits(
  content: Content,
  world: WorldState,
  nationId: string,
) {
  return {
    armies: resolveStat(content, world, { nationId }, "army.limit", 2, {
      min: 1,
    }).value,
    units: resolveStat(content, world, { nationId }, "army.units", 4, {
      min: 1,
    }).value,
  };
}
export function armyEfficiency(
  content: Content,
  world: WorldState,
  army: Army,
) {
  const limits = armyLimits(content, world, army.nationId);
  const count = Object.values(world.military.armies).filter(
    (a) => a.nationId === army.nationId && a.units.length,
  ).length;
  const formation = Math.min(
    1,
    limits.armies / Math.max(1, count),
    limits.units / Math.max(1, army.units.length),
  );
  const demand = equipmentDemand(content, world, army.nationId);
  const supply = calculateEconomy(content, world, army.nationId).available;
  let equipment = 1;
  for (const u of army.units) {
    const d = content.units.find((t) => t.id === u.typeId);
    if (!d) continue;
    for (const id of Object.keys(d.equipment))
      equipment = Math.min(
        equipment,
        (supply[id] ?? 0) / Math.max(0.01, demand[id] ?? 0),
      );
  }
  return formation ** 2.2 * Math.max(0.005, Math.min(1, equipment) ** 1.5);
}
export function regimentPower(
  content: Content,
  world: WorldState,
  nationId: string,
  u: Regiment,
) {
  const type = content.units.find((t) => t.id === u.typeId);
  if (!type) return 0;
  const unlocked = unitUnlocked(content, world, nationId, type.id);
  const core = u.cadre * type.attack;
  const levy = u.levy * 0.35;
  const readiness = (0.25 + u.morale / 133) * (0.55 + u.training / 200);
  const ratio = u.cadre / Math.max(1, u.cadre + u.levy);
  const allowance = maximumCadreRatio(content, world, nationId, u.typeId);
  const staffing =
    type.cadre && ratio > allowance
      ? Math.min(1, (allowance / ratio) ** 1.2)
      : 1;
  return (
    (core + levy) *
    readiness *
    staffing *
    Math.max(0.05, world.nations[nationId].operatingCoverage.army) *
    fatigueMultiplier(content, u) *
    (unlocked ? 1 : 0.015) *
    resolveStat(content, world, { nationId }, "army.attack", 1, { min: 0 })
      .value
  );
}
export function militaryStrength(
  content: Content,
  world: WorldState,
  army: Army,
) {
  const general = army.generalId
    ? world.research.talents[army.generalId]
    : null;
  const command = general?.role === "general" ? 1 + general.command / 180 : 0.8;
  return (
    army.units.reduce(
      (s, u) => s + regimentPower(content, world, army.nationId, u),
      0,
    ) *
    armyEfficiency(content, world, army) *
    command
  );
}
// 征召优先承伤；失去护卫后常备承担越来越多的伤亡。
export function applyCasualties(unit: Regiment, amount: number) {
  const loss = Math.min(
    Math.max(0, Math.round(amount)),
    unit.cadre + unit.levy,
  );
  if (!loss) return;
  const protection = unit.levy > unit.cadre ? 0.92 : unit.levy > 0 ? 0.65 : 0;
  const levyLoss = Math.min(unit.levy, Math.round(loss * protection));
  const coreLoss = Math.min(unit.cadre, loss - levyLoss);
  unit.levy = Math.max(0, unit.levy - levyLoss - (loss - levyLoss - coreLoss));
  unit.cadre -= coreLoss;
  unit.morale = Math.max(
    0,
    unit.morale - (loss / Math.max(1, unit.cadre + unit.levy + loss)) * 95,
  );
}

export function unitUnlocked(
  content: Content,
  world: WorldState,
  nationId: string,
  typeId: string,
) {
  const type = content.units.find((u) => u.id === typeId);
  if (!type) return false;
  if (!type.requires) return true;
  return content.ideas.some((i) => i.id === type.requires)
    ? world.research.nations[nationId].enacted.includes(type.requires)
    : hasTechnology(world, nationId, type.requires);
}
export function maximumCadreRatio(
  content: Content,
  world: WorldState,
  nationId: string,
  typeId: string,
) {
  const type = content.units.find((u) => u.id === typeId);
  if (!type || !type.cadre) return 0;
  if (!type.levy) return 1;
  return resolveStat(
    content,
    world,
    { nationId },
    "army.cadre_ratio",
    type.cadre / (type.cadre + type.levy),
    { min: 0, max: 0.8 },
  ).value;
}
