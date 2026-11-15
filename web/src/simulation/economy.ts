import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { researchModifier } from "./research";
import { buildingCrowding } from "./settlements";

export interface ResourceLine {
  source: string;
  resourceId: string;
  amount: number;
}
export interface Economy {
  income: number;
  gross: Record<string, number>;
  available: Record<string, number>;
  used: Record<string, number>;
  lines: ResourceLine[];
  fullBuildingUpkeep: number;
  modifiers: Record<string, number>;
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
  const incomeModifier = Math.max(
    0,
    1 + researchModifier(content, world, nationId, "income"),
  );
  const productionModifier = Math.max(
    0,
    1 + researchModifier(content, world, nationId, "production"),
  );
  let upkeep = 0;
  const contribute = (source: string, resourceId: string, amount: number) => {
    if (amount <= 0) return;
    add(gross, resourceId, amount);
    lines.push({ source, resourceId, amount });
  };
  for (const [id, amount] of Object.entries(nationStart.baseResources))
    contribute(`国家基础 · ${nationStart.name}`, id, amount);
  const processing: {
    source: string;
    inputs: Record<string, number>;
    outputs: Record<string, number>;
    factor: number;
    modifiers: Record<string, number>;
  }[] = [];
  for (const city of Object.values(world.settlements).filter(
    (item) => item.owner === nationId,
  )) {
    const start = cityStarts.get(city.id)!;
    contribute(
      `城镇规模 · ${start.name}`,
      "grain",
      city.scale * 8 * city.governance * incomeModifier,
    );
    for (const [id, state] of Object.entries(city.buildings)) {
      const building = buildings.get(id)!;
      upkeep += building.levels[state.level - 1].upkeep;
      if (state.effectiveLevel === 0) continue;
      const level = building.levels[state.effectiveLevel - 1];
      const routeModifier = building.route
        ? Math.max(
            0,
            1 +
              researchModifier(
                content,
                world,
                nationId,
                `production.${building.route}`,
              ),
          )
        : 1;
      const factor =
        nation.operatingCoverage.buildings *
        city.governance *
        buildingCrowding(city) *
        productionModifier *
        routeModifier;
      const source = `${start.name} · ${building.name}`;
      if (building.stage === 0) {
        for (const [resourceId, amount] of Object.entries(level.outputs))
          contribute(
            source,
            resourceId,
            amount * factor * (resourceId === "grain" ? incomeModifier : 1),
          );
        for (const [key, value] of Object.entries(level.modifiers ?? {}))
          add(modifiers, key, value * factor);
      } else
        processing.push({
          source,
          inputs: level.inputs,
          outputs: level.outputs,
          factor,
          modifiers: level.modifiers ?? {},
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
    for (const [id, amount] of Object.entries(process.outputs))
      contribute(
        process.source,
        id,
        amount * process.factor * ratio * (id === "grain" ? incomeModifier : 1),
      );
    for (const [key, value] of Object.entries(process.modifiers))
      add(modifiers, key, value * process.factor * ratio);
  }
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
  };
}

export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
