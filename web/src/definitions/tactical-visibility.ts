/** Terrain stays public; these rules control current, shared troop sight. */
export interface TacticalVisibilityRules {
  enabled: boolean;
  baseRange: number;
  cavalryRange: number;
  concealmentRange: number;
  concealmentTerrains: string[];
  blockingTerrains: string[];
}

export const DEFAULT_TACTICAL_VISIBILITY: TacticalVisibilityRules = {
  enabled: true,
  baseRange: 4,
  cavalryRange: 5,
  concealmentRange: 1,
  concealmentTerrains: ["forest", "hill"],
  blockingTerrains: ["forest", "hill"],
};

/** Missing rules are supported for older content packs and saves. */
export function validateTacticalVisibility(
  raw: unknown,
): TacticalVisibilityRules {
  if (raw === undefined) return structuredClone(DEFAULT_TACTICAL_VISIBILITY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("tactics.visibility 应为对象");
  const value = raw as Record<string, unknown>;
  for (const key of Object.keys(value))
    if (!Object.hasOwn(DEFAULT_TACTICAL_VISIBILITY, key))
      throw new Error(`tactics.visibility 使用了未知规则 ${key}`);
  if (typeof value.enabled !== "boolean")
    throw new Error("tactics.visibility.enabled 应为布尔值");
  const range = (key: string): number => {
    const n = value[key];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 100)
      throw new Error(`tactics.visibility.${key} 应为 1 到 100 的整数`);
    return n;
  };
  const terrains = (key: string): string[] => {
    const list = value[key];
    if (
      !Array.isArray(list) ||
      list.some((terrain) => !["plain", "forest", "hill"].includes(terrain)) ||
      new Set(list).size !== list.length
    )
      throw new Error(`tactics.visibility.${key} 应为不重复的战场地形列表`);
    return [...list] as string[];
  };
  return {
    enabled: value.enabled,
    baseRange: range("baseRange"),
    cavalryRange: range("cavalryRange"),
    concealmentRange: range("concealmentRange"),
    concealmentTerrains: terrains("concealmentTerrains"),
    blockingTerrains: terrains("blockingTerrains"),
  };
}
