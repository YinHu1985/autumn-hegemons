/** Numeric relationship tuning and timed diplomatic actions are editable content. */
export interface DiplomaticActionDefinition {
  id: string;
  name: string;
  days: number;
  relationChange: number;
  cost: number;
}
export interface DiplomacyRules {
  minRelation: number;
  maxRelation: number;
  center: number;
  yearlyDrift: number;
  actions: DiplomaticActionDefinition[];
}

// Compatibility for content packs created before diplomacy.json was introduced.
export const DEFAULT_DIPLOMACY: DiplomacyRules = {
  minRelation: -200,
  maxRelation: 200,
  center: 20,
  yearlyDrift: 1,
  actions: [
    { id: "gift", name: "赠送礼物", days: 30, relationChange: 50, cost: 30 },
    {
      id: "denounce",
      name: "谴责声讨",
      days: 30,
      relationChange: -50,
      cost: 0,
    },
  ],
};

export function validateDiplomacyRules(raw: unknown): DiplomacyRules {
  if (raw === undefined) return structuredClone(DEFAULT_DIPLOMACY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("diplomacy 应为外交规则对象");
  const values = raw as Record<string, unknown>;
  const number = (value: unknown, path: string, min = -Infinity) => {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < min
    )
      throw new Error(`${path} 应为有效整数`);
    return value;
  };
  for (const key of Object.keys(values))
    if (!(key in DEFAULT_DIPLOMACY))
      throw new Error(`diplomacy 使用了未知规则 ${key}`);
  const minRelation = number(values.minRelation, "diplomacy.minRelation");
  const maxRelation = number(values.maxRelation, "diplomacy.maxRelation");
  const center = number(values.center, "diplomacy.center");
  const yearlyDrift = number(values.yearlyDrift, "diplomacy.yearlyDrift", 0);
  if (
    minRelation >= maxRelation ||
    center < minRelation ||
    center > maxRelation
  )
    throw new Error("diplomacy 关系上下限与中心值无效");
  if (!Array.isArray(values.actions))
    throw new Error("diplomacy.actions 应为数组");
  const ids = new Set<string>();
  const actions = values.actions.map(
    (entry: unknown, index): DiplomaticActionDefinition => {
      const path = `diplomacy.actions[${index}]`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        throw new Error(`${path} 应为行动定义`);
      const action = entry as Record<string, unknown>;
      if (
        typeof action.id !== "string" ||
        !/^[a-z][a-z0-9_]*$/.test(action.id) ||
        ids.has(action.id)
      )
        throw new Error(`${path}.id 无效或重复`);
      if (typeof action.name !== "string" || !action.name.trim())
        throw new Error(`${path}.name 不可为空`);
      for (const key of Object.keys(action))
        if (!["id", "name", "days", "relationChange", "cost"].includes(key))
          throw new Error(`${path} 使用了未知字段 ${key}`);
      ids.add(action.id);
      return {
        id: action.id,
        name: action.name,
        days: number(action.days, `${path}.days`, 1),
        relationChange: number(action.relationChange, `${path}.relationChange`),
        cost: number(action.cost, `${path}.cost`, 0),
      };
    },
  );
  return { minRelation, maxRelation, center, yearlyDrift, actions };
}
