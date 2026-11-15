/** Campaign tuning lives in warfare.json; the simulation owns the meaning of each rule. */
export interface WarfareRules {
  preparationDays: number;
  queuedProgressCap: number;
  returnDays: number;
  expeditionUpkeepMultiplier: number;
  recentCombatDays: number;
  offensiveFatiguePerAttack: number;
  maximumOffensiveFatigue: number;
  fatigueRecoveryDays: number;
}

// Compatibility defaults for content packs saved before warfare.json existed.
// The bundled game always loads its editable JSON definition.
export const LEGACY_WARFARE_DEFAULTS: WarfareRules = {
  preparationDays: 90,
  queuedProgressCap: 0.5,
  returnDays: 30,
  expeditionUpkeepMultiplier: 1.5,
  recentCombatDays: 90,
  offensiveFatiguePerAttack: 0.2,
  maximumOffensiveFatigue: 0.6,
  fatigueRecoveryDays: 60,
};

export function validateWarfare(raw: unknown): WarfareRules {
  if (raw === undefined) return { ...LEGACY_WARFARE_DEFAULTS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("warfare 应为战争规则对象");
  const values = raw as Record<string, unknown>;
  const result = {} as WarfareRules;
  for (const key of Object.keys(
    LEGACY_WARFARE_DEFAULTS,
  ) as (keyof WarfareRules)[]) {
    const value = values[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      throw new Error(`warfare.${key} 应为非负有限数字`);
    result[key] = value;
  }
  for (const key of [
    "preparationDays",
    "returnDays",
    "recentCombatDays",
    "fatigueRecoveryDays",
  ] as const)
    if (!Number.isInteger(result[key]) || result[key] < 1)
      throw new Error(`warfare.${key} 应为正整数天数`);
  if (result.queuedProgressCap >= 1)
    throw new Error(
      "warfare.queuedProgressCap 必须小于 1，后续进攻不能同时决战",
    );
  if (result.expeditionUpkeepMultiplier < 1)
    throw new Error("warfare.expeditionUpkeepMultiplier 不能小于 1");
  if (
    result.maximumOffensiveFatigue >= 1 ||
    result.offensiveFatiguePerAttack > result.maximumOffensiveFatigue
  )
    throw new Error("warfare 疲劳单次增量不能超过上限，上限必须小于 1");
  for (const key of Object.keys(values))
    if (!(key in LEGACY_WARFARE_DEFAULTS))
      throw new Error(`warfare 使用了未知规则 ${key}`);
  return result;
}
