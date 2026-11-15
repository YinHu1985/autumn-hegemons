import type { Good } from "./types";
export interface TerrainDefinition {
  id: string;
  name: string;
  constructionCost: number;
  constructionTime: number;
}
export interface SpecialtyDefinition {
  id: string;
  name: string;
  resourceId?: string;
}
// Compatibility defaults for old content packages. Published content uses its JSON definitions.
const DEFAULT_TERRAINS: TerrainDefinition[] = [
  { id: "plain", name: "平原", constructionCost: 1, constructionTime: 1 },
  { id: "forest", name: "森林", constructionCost: 1.15, constructionTime: 1.2 },
  { id: "jungle", name: "丛林", constructionCost: 1.4, constructionTime: 1.5 },
  { id: "hill", name: "丘陵", constructionCost: 1.2, constructionTime: 1.15 },
  {
    id: "mountain",
    name: "高山",
    constructionCost: 1.55,
    constructionTime: 1.6,
  },
  { id: "marsh", name: "沼泽", constructionCost: 1.45, constructionTime: 1.5 },
  { id: "desert", name: "沙漠", constructionCost: 1.5, constructionTime: 1.4 },
  { id: "tundra", name: "冻土", constructionCost: 1.6, constructionTime: 1.7 },
];
const DEFAULT_SPECIALTIES: SpecialtyDefinition[] = [
  { id: "gold", name: "黄金", resourceId: "gold" },
  { id: "copper", name: "铜", resourceId: "copper" },
  { id: "iron", name: "铁", resourceId: "iron" },
  { id: "wood", name: "木材", resourceId: "wood" },
  { id: "cattle", name: "牛", resourceId: "leather" },
  { id: "hemp", name: "麻", resourceId: "cloth" },
  { id: "silk", name: "丝绸", resourceId: "silk" },
  { id: "jade", name: "玉", resourceId: "jade" },
  { id: "pottery", name: "陶器", resourceId: "pottery" },
  { id: "grain", name: "粮食", resourceId: "grain" },
  { id: "fish", name: "鱼", resourceId: "grain" },
  { id: "horse", name: "马", resourceId: "horses" },
  { id: "salt", name: "盐", resourceId: "salt" },
];
function rows(raw: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(raw)) throw new Error(`${label} 应为列表`);
  const ids = new Set<string>();
  return raw.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof item.id !== "string" ||
      !item.id.trim() ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      ids.has(item.id)
    )
      throw new Error(`${label} 的 ID、名称无效或 ID 重复`);
    ids.add(item.id);
    return item;
  });
}
export function validateGeography(
  raw: { terrains?: unknown; specialties?: unknown },
  goods: Good[],
) {
  const terrains: TerrainDefinition[] = rows(
    raw.terrains ?? DEFAULT_TERRAINS,
    "terrains",
  ).map((item) => {
    for (const key of ["constructionCost", "constructionTime"] as const)
      if (
        typeof item[key] !== "number" ||
        !Number.isFinite(item[key]) ||
        item[key] <= 0
      )
        throw new Error(`地形 ${item.id} 的 ${key} 必须大于零`);
    return {
      id: item.id as string,
      name: item.name as string,
      constructionCost: item.constructionCost as number,
      constructionTime: item.constructionTime as number,
    };
  });
  // An old reduced fixture may not define every resource; its default specialties remain descriptive.
  const fallback = DEFAULT_SPECIALTIES.map((item) => ({
    ...item,
    resourceId: goods.some((good) => good.id === item.resourceId)
      ? item.resourceId
      : undefined,
  }));
  const specialties: SpecialtyDefinition[] = rows(
    raw.specialties ?? fallback,
    "specialties",
  ).map((item) => {
    if (
      item.resourceId !== undefined &&
      (typeof item.resourceId !== "string" ||
        !goods.some((good) => good.id === item.resourceId))
    )
      throw new Error(`特产 ${item.id} 引用了不存在的资源 ${item.resourceId}`);
    return {
      id: item.id as string,
      name: item.name as string,
      resourceId: item.resourceId as string | undefined,
    };
  });
  return { terrains, specialties };
}
