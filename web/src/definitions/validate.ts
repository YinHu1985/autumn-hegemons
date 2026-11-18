import { validateModifierDefinitions } from "./modifier-definitions";
import { validateEffectReferences } from "./effect-references";
import { validateEventReferences } from "./event-references";
import { validateDiplomacyRules } from "./diplomacy";
import { validateModifiers } from "./modifiers";
import { validateGeography } from "./geography";
import { validateResearch } from "./research";
import { validateUnits } from "./military";
import {
  validateEvents,
  validateEventPools,
  DEFAULT_EVENT_POOLS,
} from "./events";
import { validateWarfare } from "./warfare";
import { validateTactics } from "./tactics";
import { scenarioMetadata } from "./scenarios";
import { validateRoads } from "./roads";
import type { Building, Content, Good, Scenario } from "./types";

type ObjectValue = Record<string, unknown>;
function object(value: unknown, path: string): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} 应为对象`);
  return value as ObjectValue;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} 应为数组`);
  return value;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${path} 应为非空文字`);
  return value;
}
function number(value: unknown, path: string, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min)
    throw new Error(`${path} 应为不小于 ${min} 的有限数字`);
  return value;
}
function integer(value: unknown, path: string, min = 0): number {
  const result = number(value, path, min);
  if (!Number.isInteger(result)) throw new Error(`${path} 应为整数`);
  return result;
}
function quantities(
  value: unknown,
  path: string,
  goods: Map<string, Good>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [id, quantity] of Object.entries(object(value, path))) {
    if (!goods.has(id)) throw new Error(`${path} 引用了不存在的资源 ${id}`);
    result[id] = number(quantity, `${path}.${id}`);
  }
  return result;
}
function unique<T extends { id: string }>(items: T[], path: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${path} 中 ID 重复：${item.id}`);
    ids.add(item.id);
  }
}

export function validateContent(raw: unknown): Content {
  const root = object(raw, "内容包");
  const goods: Good[] = array(root.goods, "goods").map((value, index) => {
    const item = object(value, `goods[${index}]`);
    const kind = string(item.kind, `goods[${index}].kind`);
    if (kind !== "treasury" && kind !== "capacity")
      throw new Error(`资源种类 ${kind} 不受支持`);
    return {
      id: string(item.id, "资源 ID"),
      name: string(item.name, "资源名称"),
      kind,
    };
  });
  unique(goods, "goods");
  const geography = validateGeography(root, goods);
  const goodById = new Map(goods.map((item) => [item.id, item]));
  if (goodById.get("grain")?.kind !== "treasury")
    throw new Error("当前原型需要 grain 作为财政资源");

  const buildings: Building[] = array(root.buildings, "buildings").map(
    (value, index) => {
      const path = `buildings[${index}]`;
      const item = object(value, path);
      const stage = integer(item.stage, `${path}.stage`);
      if (stage !== 0 && stage !== 1)
        throw new Error(`${path}.stage 只支持 0 或 1`);
      const levels = array(item.levels, `${path}.levels`).map(
        (levelValue, levelIndex) => {
          const levelPath = `${path}.levels[${levelIndex}]`;
          const level = object(levelValue, levelPath);
          const inputs = quantities(
            level.inputs,
            `${levelPath}.inputs`,
            goodById,
          );
          const outputs = quantities(
            level.outputs,
            `${levelPath}.outputs`,
            goodById,
          );
          for (const id of Object.keys(inputs)) {
            if (goodById.get(id)?.kind !== "capacity")
              throw new Error(`${levelPath} 不能把财政资源 ${id} 当作普通原料`);
          }
          if (stage === 0 && Object.keys(inputs).length)
            throw new Error(`${levelPath}：初级建筑不能消耗原料`);
          if (!Object.keys(outputs).length && !level.modifiers)
            throw new Error(`${levelPath} 需要产出或修正效果`);
          return {
            technology:
              level.technology === undefined
                ? undefined
                : string(level.technology, `${levelPath}.technology`),
            modifiers:
              level.modifiers === undefined
                ? undefined
                : validateModifiers(
                    level.modifiers,
                    `${levelPath}.modifiers`,
                    "building",
                  ),
            cost: number(level.cost, `${levelPath}.cost`),
            days: integer(level.days, `${levelPath}.days`, 1),
            upkeep: number(level.upkeep, `${levelPath}.upkeep`),
            inputs,
            outputs,
          };
        },
      );
      if (!levels.length) throw new Error(`${path} 需要至少一个等级`);
      return {
        id: string(item.id, `${path}.id`),
        name: string(item.name, `${path}.name`),
        route:
          item.route === undefined
            ? undefined
            : string(item.route, `${path}.route`),
        description:
          item.description === undefined
            ? undefined
            : string(item.description, `${path}.description`),
        specialty:
          item.specialty === undefined
            ? undefined
            : string(item.specialty, `${path}.specialty`),
        specialties:
          item.specialties === undefined
            ? undefined
            : array(item.specialties, `${path}.specialties`).map((v) =>
                string(v, `${path}.specialties`),
              ),
        stage,
        levels,
      };
    },
  );
  unique(buildings, "buildings");
  const buildingById = new Map(buildings.map((item) => [item.id, item]));

  const rawScenario = object(root.scenario, "scenario");
  const rawStart = object(rawScenario.start, "scenario.start");
  const start = {
    year: integer(rawStart.year, "scenario.start.year", -10000),
    month: integer(rawStart.month, "scenario.start.month", 1),
    day: integer(rawStart.day, "scenario.start.day", 1),
  };
  if (start.month > 12 || start.day > 30)
    throw new Error("当前原型使用每年 12 月、每月 30 日的暂定日历");
  const nations = array(rawScenario.nations, "scenario.nations").map(
    (value, index) => {
      const path = `scenario.nations[${index}]`;
      const item = object(value, path);
      const budget = object(item.budget, `${path}.budget`);
      const buildingBudget = number(
        budget.buildings,
        `${path}.budget.buildings`,
      );
      if (buildingBudget > 1)
        throw new Error(`${path}.budget.buildings 应在 0 到 1 之间`);
      const baseResources = quantities(
        item.baseResources,
        `${path}.baseResources`,
        goodById,
      );
      return {
        id: string(item.id, `${path}.id`),
        name: string(item.name, `${path}.name`),
        color:
          item.color === undefined
            ? undefined
            : string(item.color, `${path}.color`),
        description:
          item.description === undefined
            ? undefined
            : string(item.description, `${path}.description`),
        treasury: number(item.treasury, `${path}.treasury`),
        baseResources,
        budget: {
          buildings: buildingBudget,
          army:
            budget.army === undefined
              ? 1
              : number(budget.army, `${path}.budget.army`),
          research:
            budget.research === undefined
              ? 1
              : number(budget.research, `${path}.budget.research`),
        },
        manpower: number(item.manpower, `${path}.manpower`),
      };
    },
  );
  for (const n of nations)
    if (n.budget.army > 1 || n.budget.research > 1)
      throw new Error(`国家 ${n.id} 的维护比例须在0到1之间`);
  unique(nations, "scenario.nations");
  if (!nations.length) throw new Error("剧本至少需要一个国家");
  const nationIds = new Set(nations.map((item) => item.id));
  const settlements = array(
    rawScenario.settlements,
    "scenario.settlements",
  ).map((value, index) => {
    const path = `scenario.settlements[${index}]`;
    const item = object(value, path);
    const owner = string(item.owner, `${path}.owner`);
    if (!nationIds.has(owner))
      throw new Error(`${path} 的国家 ${owner} 不存在`);
    const specialty = string(item.specialty, `${path}.specialty`);
    if (!geography.specialties.some((s) => s.id === specialty))
      throw new Error(`${path} 引用未知特产 ${specialty}`);
    if (!geography.terrains.some((t) => t.id === item.terrain))
      throw new Error(`${path} 引用未知地形 ${String(item.terrain)}`);
    const initialBuildings: Record<string, number> = {};
    for (const [id, levelValue] of Object.entries(
      object(item.buildings, `${path}.buildings`),
    )) {
      const building = buildingById.get(id);
      if (!building) throw new Error(`${path} 的建筑 ${id} 不存在`);
      if (
        (building.specialty && building.specialty !== specialty) ||
        (building.specialties && !building.specialties.includes(specialty))
      )
        throw new Error(`${path} 的特产不允许建造 ${id}`);
      const level = integer(levelValue, `${path}.buildings.${id}`, 1);
      if (level > building.levels.length)
        throw new Error(`${path} 的 ${id} 超过定义等级`);
      initialBuildings[id] = level;
    }
    const scale = integer(item.scale, `${path}.scale`, 1);
    if (Object.keys(initialBuildings).length > scale + 1)
      throw new Error(`${path} 超过建筑容量`);
    const governance = number(item.governance, `${path}.governance`);
    if (governance > 1) throw new Error(`${path}.governance 应在 0 到 1 之间`);
    const map = object(item.map, `${path}.map`);
    const x = number(map.x, `${path}.map.x`);
    const y = number(map.y, `${path}.map.y`);
    if (x > 1800 || y > 1500) throw new Error(`${path}.map 坐标超出当前底图`);
    return {
      id: string(item.id, `${path}.id`),
      name: string(item.name, `${path}.name`),
      owner,
      map: { x, y },
      terrain: string(item.terrain, `${path}.terrain`),
      specialty,
      scale,
      governance,
      buildings: initialBuildings,
    };
  });
  unique(settlements, "scenario.settlements");
  if (!settlements.length) throw new Error("剧本至少需要一座城镇");
  for (const nation of nations)
    if (!settlements.some((city) => city.owner === nation.id))
      throw new Error(`剧本国家 ${nation.id} 至少需要一座初始城镇`);
  // 避免二级作坊引用只能由其他二级作坊生产的资源；当前原型没有三级生产链。
  const firstStageOutputs = new Set<string>();
  for (const nation of nations)
    for (const id of Object.keys(nation.baseResources))
      firstStageOutputs.add(id);
  for (const building of buildings.filter((item) => item.stage === 0))
    for (const level of building.levels)
      for (const id of Object.keys(level.outputs)) firstStageOutputs.add(id);
  for (const building of buildings.filter((item) => item.stage === 1))
    for (const level of building.levels)
      for (const id of Object.keys(level.inputs))
        if (!firstStageOutputs.has(id))
          throw new Error(`${building.id} 的原料 ${id} 没有初级来源`);
  const research = validateResearch(root);
  const technologyIds = new Set(research.technologies.map((t) => t.id));
  for (const building of buildings)
    for (const level of building.levels)
      if (level.technology && !technologyIds.has(level.technology))
        throw new Error(`建筑 ${building.id} 引用未知科技 ${level.technology}`);
  const units = validateUnits(
    root.units ?? [],
    new Set(goods.map((g) => g.id)),
  );
  const unlockIds = new Set(
    [...research.technologies, ...research.ideas].map((t) => t.id),
  );
  for (const unit of units)
    if (unit.requires && !unlockIds.has(unit.requires))
      throw new Error(`兵种 ${unit.id} 解锁引用不存在 ${unit.requires}`);
  const content: Content = {
    modifierDefinitions: validateModifierDefinitions(
      root.modifierDefinitions ?? [],
    ),
    ...research,
    ...geography,
    warfare: validateWarfare(root.warfare),
    diplomacy: validateDiplomacyRules(root.diplomacy),
    tactics: validateTactics(root.tactics, unlockIds),
    units,
    events: validateEvents(root.events ?? []),
    eventPools: validateEventPools(root.eventPools ?? DEFAULT_EVENT_POOLS),
    goods,
    buildings,
    scenario: {
      ...scenarioMetadata(rawScenario, nationIds),
      start,
      nations,
      settlements,
      roads: validateRoads(
        rawScenario.roads,
        new Set(settlements.map((city) => city.id)),
      ),
    } as Scenario,
  };
  validateEffectReferences(content);
  validateEventReferences(content);
  return content;
}
