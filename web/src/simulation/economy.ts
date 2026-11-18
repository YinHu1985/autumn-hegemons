import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { resolveStat } from "./modifier-query";
import type { ModifierContribution } from "./modifier-state";
import {
  buildingContributions,
  resourceCalculation,
  type ResourceCalculation,
} from "./economy-calculation";
import { buildingCrowding } from "./settlements";

export interface ResourceLine {
  source: string;
  resourceId: string;
  amount: number;
  calculation?: ResourceCalculation;
}
export interface Economy {
  income: number;
  gross: Record<string, number>;
  available: Record<string, number>;
  used: Record<string, number>;
  lines: ResourceLine[];
  fullBuildingUpkeep: number;
  modifiers: Record<string, number>;
  modifierContributions: ModifierContribution[];
}

function add(table: Record<string, number>, id: string, amount: number): void {
  table[id] = (table[id] ?? 0) + amount;
}

export function calculateEconomy(
  content: Content,
  world: WorldState,
  nationId: string,
): Economy {
  const nationStart = content.scenario.nations.find(
    (item) => item.id === nationId,
  );
  const nation = world.nations[nationId];
  if (!nationStart || !nation) throw new Error(`未知国家：${nationId}`);
  const goods = new Map(content.goods.map((item) => [item.id, item]));
  const buildings = new Map(content.buildings.map((item) => [item.id, item]));
  const cityStarts = new Map(
    content.scenario.settlements.map((item) => [item.id, item]),
  );
  const gross: Record<string, number> = {};
  const used: Record<string, number> = {};
  const lines: ResourceLine[] = [];
  const modifiers: Record<string, number> = {};
  const modifierContributions: ModifierContribution[] = [];
  let upkeep = 0;
  const contribute = (
    source: string,
    resourceId: string,
    amount: number,
    calculation?: ResourceCalculation,
  ) => {
    if (amount <= 0) return;
    add(gross, resourceId, amount);
    lines.push({ source, resourceId, amount, calculation });
  };
  for (const [id, amount] of Object.entries(nationStart.baseResources))
    contribute(`国家基础 · ${nationStart.name}`, id, amount);
  const processing: {
    source: string;
    inputs: Record<string, number>;
    outputs: Record<string, number>;
    factor: number;
    contributions: ModifierContribution[];
    steps: ResourceCalculation["steps"];
    income: ReturnType<typeof resolveStat>;
  }[] = [];
  for (const city of Object.values(world.settlements).filter(
    (item) => item.owner === nationId,
  )) {
    const start = cityStarts.get(city.id)!;
    const context = { nationId, settlementId: city.id };
    const income = resolveStat(content, world, context, "income", 1, {
      min: 0,
    });
    const production = resolveStat(content, world, context, "production", 1, {
      min: 0,
    });
    const cityIncome = resourceCalculation(city.scale * 8, [
      { label: "治理效率", factor: city.governance },
      { label: "粮食收入", factor: income.value, stat: income },
    ]);
    contribute(
      `城镇规模 · ${start.name}`,
      "grain",
      cityIncome.value,
      cityIncome,
    );
    for (const [id, state] of Object.entries(city.buildings)) {
      const building = buildings.get(id)!;
      upkeep += building.levels[state.level - 1].upkeep;
      if (state.effectiveLevel === 0) continue;
      const level = building.levels[state.effectiveLevel - 1];
      const route = building.route
        ? resolveStat(
            content,
            world,
            context,
            `production.${building.route}`,
            1,
            { min: 0 },
          )
        : undefined;
      const steps: ResourceCalculation["steps"] = [
        { label: "实际产业维护", factor: nation.operatingCoverage.buildings },
        { label: "治理效率", factor: city.governance },
        { label: "建筑容量", factor: buildingCrowding(city) },
        { label: "产业产量", factor: production.value, stat: production },
        ...(route
          ? [{ label: "本产业产量", factor: route.value, stat: route }]
          : []),
      ];
      const factor = resourceCalculation(1, steps).value;
      const source = `${start.name} · ${building.name}`;
      const contributions = buildingContributions(
        nationId,
        city.id,
        id,
        source,
        level.modifiers ?? {},
        factor,
      );
      if (building.stage === 0) {
        for (const [resourceId, amount] of Object.entries(level.outputs)) {
          const calculation = resourceCalculation(amount, [
            ...steps,
            ...(resourceId === "grain"
              ? [{ label: "粮食收入", factor: income.value, stat: income }]
              : []),
          ]);
          contribute(source, resourceId, calculation.value, calculation);
        }
        modifierContributions.push(...contributions);
      } else
        processing.push({
          source,
          inputs: level.inputs,
          outputs: level.outputs,
          factor,
          contributions,
          steps,
          income,
        });
    }
  }
  // 同级作坊等比例分配原料，结果不依赖城镇或 JSON 的遍历顺序。
  const demand: Record<string, number> = {};
  for (const process of processing)
    for (const [id, amount] of Object.entries(process.inputs))
      add(demand, id, amount * process.factor);
  const shares: Record<string, number> = {};
  for (const [id, amount] of Object.entries(demand))
    shares[id] = amount ? Math.min(1, (gross[id] ?? 0) / amount) : 1;
  for (const process of processing) {
    const ratio = Math.min(
      1,
      ...Object.keys(process.inputs).map((id) => shares[id] ?? 0),
    );
    for (const [id, amount] of Object.entries(process.inputs))
      add(used, id, amount * process.factor * ratio);
    for (const [id, amount] of Object.entries(process.outputs)) {
      const calculation = resourceCalculation(amount, [
        ...process.steps,
        { label: "原料供给", factor: ratio },
        ...(id === "grain"
          ? [
              {
                label: "粮食收入",
                factor: process.income.value,
                stat: process.income,
              },
            ]
          : []),
      ]);
      contribute(process.source, id, calculation.value, calculation);
    }
    modifierContributions.push(
      ...process.contributions.map((entry) => ({
        ...entry,
        value: entry.value * ratio,
      })),
    );
  }
  for (const contribution of modifierContributions)
    add(modifiers, contribution.key, contribution.value);
  const available: Record<string, number> = {};
  for (const good of content.goods)
    available[good.id] = Math.max(
      0,
      (gross[good.id] ?? 0) - (used[good.id] ?? 0),
    );
  return {
    income: available.grain ?? 0,
    gross,
    available,
    used,
    lines,
    fullBuildingUpkeep: upkeep,
    modifiers,
    modifierContributions,
  };
}

export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
