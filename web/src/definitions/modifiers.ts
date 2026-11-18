import { effectFields, effectObject } from "./effect-validation";
import {
  formatExpression,
  isExplicitModifierValue,
  validateExpression,
  type ModifierOperation,
  type ModifierScope,
  type ModifierTerms,
  type ModifierValue,
} from "./modifier-values";

/**
 * Modifier vocabulary shared by content validation and explanations.
 * A definition names its actual consumer; registering a word never applies an effect by itself.
 * New calculations should register their key here and query the shared modifier engine.
 * Percent-valued terms operate on dimensionless factors (usually base 1) or ratios.
 * Explicit add changes percentage points of that factor/ratio; it is not flat grain/people.
 * Number-valued terms operate on their declared count. Immediate resource changes use actions.
 */
export interface ModifierDefinition {
  name: string;
  unit: "percent" | "number";
  description: string;
  consumer: string;
  scopes: readonly ModifierScope[];
  defaultOperation: ModifierOperation;
}
export const MODIFIERS: Record<
  string,
  Omit<ModifierDefinition, "scopes" | "defaultOperation">
> = {
  fortification: {
    name: "城防强度",
    unit: "number",
    description: "城镇建筑提供的防御强度，受治理及产业维护影响。",
    consumer: "simulation/military-battles.ts: cityFortification",
  },
  income: {
    name: "粮食收入",
    unit: "percent",
    description: "城镇和建筑粮食收入的倍率（基础为 1）；不改变国家基础配额。",
    consumer: "simulation/economy.ts: calculateEconomy",
  },
  production: {
    name: "产业产量",
    unit: "percent",
    description:
      "作坊运行规模的倍率（基础为 1），同时增加产量和加工原料需求；原料短缺仍会限产。",
    consumer: "simulation/economy.ts: calculateEconomy",
  },
  manpower: {
    name: "人力上限与恢复",
    unit: "percent",
    description:
      "城镇人力上限的倍率（基础为 1），汇总为全国池上限；月恢复量随上限变化。",
    consumer: "simulation/civic.ts: manpowerCapacity",
  },
  governance_cap: {
    name: "治理上限",
    unit: "percent",
    description: "提高各城镇能够逐步恢复到的治理效率上限，最高100%。",
    consumer: "simulation/civic.ts: tickCivicDay",
  },
  governance_growth: {
    name: "治理恢复速度",
    unit: "percent",
    description: "新占地区与受损地区每日治理恢复的倍率（基础为 1）。",
    consumer: "simulation/civic.ts: tickCivicDay",
  },
  building_cost: {
    name: "营建费用",
    unit: "percent",
    description:
      "建造、升级与扩城一次性粮食费用的倍率（基础为 1），负数降低费用。",
    consumer: "simulation/settlements.ts: constructionQuote",
  },
  building_speed: {
    name: "营建速度",
    unit: "percent",
    description: "建造、升级与扩城速度的倍率（基础为 1），所需时间除以此倍率。",
    consumer: "simulation/settlements.ts: constructionQuote",
  },
  research_efficiency: {
    name: "研究效率",
    unit: "percent",
    description: "已支付投入转化为研究进度的效率倍率（基础为 1）。",
    consumer: "simulation/research.ts: groupMonthlyProgress",
  },
  research_scale: {
    name: "研究组规模",
    unit: "number",
    description: "增加单个研究组可选择的每月基础投入。",
    consumer: "simulation/research.ts: researchScale",
  },
  "idea.slots": {
    name: "理念槽位",
    unit: "number",
    description: "增加可以同时安排实行的理念数量。",
    consumer: "simulation/research.ts: ideaSlots",
  },
  "army.limit": {
    name: "军团限额",
    unit: "number",
    description: "增加常规军团数量；超出限额会受到组织惩罚。",
    consumer: "simulation/military-strength.ts: armyLimits",
  },
  "army.units": {
    name: "军团编队",
    unit: "number",
    description: "增加一支军团可正常编入的部队数量。",
    consumer: "simulation/military-strength.ts: armyLimits",
  },
  "army.attack": {
    name: "军团攻击",
    unit: "percent",
    description: "军团有效战斗力的倍率（基础为 1）。",
    consumer: "simulation/military-strength.ts: regimentPower",
  },
  "army.defense": {
    name: "部队防御",
    unit: "percent",
    description: "战略战斗力与战术部队防御的倍率（基础为 1）。",
    consumer: "simulation/military-battles.ts: battleStrength",
  },
  "army.speed": {
    name: "行军速度",
    unit: "percent",
    description: "军团行军速度的倍率（基础为 1），行军时间除以此倍率。",
    consumer: "simulation/military-commands.ts: marchArmy",
  },
  "army.cadre_ratio": {
    name: "常备比例上限",
    unit: "percent",
    description:
      "允许混编部队付费转训更多常备人员；纯征召和全常备兵种另按模板。",
    consumer:
      "simulation/military-strength.ts: maximumCadreRatio; military-commands.ts: professionalizeRegiment",
  },
  "army.offense": {
    name: "进攻战力",
    unit: "percent",
    description: "进攻方会战战力的倍率（基础为 1），同时作用于手动和自动决战。",
    consumer:
      "simulation/military-battles.ts: battleStrength; military-tactics.ts: beginTactical",
  },
};
const categories: Record<string, string> = {
  civil: "民生",
  craft: "工匠",
  military: "军事",
  humanities: "百家",
};
export function modifierDefinition(
  key: string,
): ModifierDefinition | undefined {
  if (Object.hasOwn(MODIFIERS, key))
    return {
      ...MODIFIERS[key],
      scopes: modifierScopes(key),
      defaultOperation:
        ["governance_cap", "army.cadre_ratio"].includes(key) ||
        MODIFIERS[key].unit === "number"
          ? "add"
          : "add_percent",
    };
  if (key.startsWith("production.") && key.length > 11)
    return {
      scopes: ["nation", "settlement"],
      defaultOperation: "add_percent",
      name: "本产业产量",
      unit: "percent",
      description: `${key.slice(11)} 路线建筑的产出及原料需求倍率（基础为 1）。`,
      consumer: "simulation/economy.ts: calculateEconomy (building.route)",
    };
  if (
    key.startsWith("research.seats.") &&
    Object.hasOwn(categories, key.slice(15))
  )
    return {
      scopes: ["nation"],
      defaultOperation: "add",
      name: `${categories[key.slice(15)]}科研席位`,
      unit: "number",
      description: "增加该类科研组的常规数量，超编会降低同类全部组的效率。",
      consumer: "simulation/research.ts: categorySeats",
    };
  return undefined;
}
export function formatModifier(key: string, value: ModifierValue): string {
  const definition = modifierDefinition(key);
  const operation = isExplicitModifierValue(value)
    ? value.operation
    : modifierDefaultOperation(key);
  const expression = isExplicitModifierValue(value) ? value.value : value;
  const name = definition?.name ?? key;
  if (typeof expression === "number") {
    if (operation === "multiply")
      return `${name} ×${Number(expression.toFixed(3))}`;
    // Percentage-valued keys are factors/ratios: flat add changes percentage points.
    const percent =
      operation === "add_percent" ||
      (operation === "add" && definition?.unit === "percent");
    const amount = Number(
      (expression * (percent ? 100 : 1)).toFixed(percent ? 1 : 2),
    );
    const suffix = percent ? (operation === "add" ? "个百分点" : "%") : "";
    return `${name} ${expression >= 0 ? "+" : ""}${amount}${suffix}`;
  }
  const symbol = operation === "multiply" ? "×" : "+";
  const ratio =
    operation === "add_percent" ||
    (operation === "add" && definition?.unit === "percent");
  return `${name} ${symbol}${formatExpression(expression)}${ratio ? "（比例值）" : ""}`;
}
export function validateModifiers(
  raw: unknown,
  path: string,
  source: "research" | "building" = "research",
): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(`${path} 需要词条到数值的映射`);
  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (source === "research" && key === "fortification")
      throw new Error(`${path} 的城防词条只能用于建筑`);
    if (
      source === "building" &&
      ![
        "research_efficiency",
        "research_scale",
        "manpower",
        "fortification",
      ].includes(key)
    )
      throw new Error(`${path} 的词条 ${key} 尚不支持建筑来源`);
    if (!modifierDefinition(key))
      throw new Error(`${path} 使用了未注册词条 ${key}`);
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`${path}.${key} 必须为有限数字`);
    normalized[key] = (normalized[key] ?? 0) + value;
  }
  return normalized;
}

/** Scope is part of the vocabulary: local-only terms cannot silently affect a nation. */
export function modifierScopes(key: string): readonly ModifierScope[] {
  if (key === "fortification") return ["settlement"];
  if (
    [
      "income",
      "production",
      "manpower",
      "governance_cap",
      "governance_growth",
      "building_cost",
      "building_speed",
    ].includes(key) ||
    key.startsWith("production.")
  )
    return ["nation", "settlement"];
  return ["nation"];
}
export function modifierDefaultOperation(key: string): ModifierOperation {
  return modifierDefinition(key)?.defaultOperation ?? "add";
}
export function validateModifierTerms(
  raw: unknown,
  path: string,
  scope: ModifierScope = "nation",
): ModifierTerms {
  const item = effectObject(raw, path);
  const result: ModifierTerms = {};
  for (const [key, value] of Object.entries(item)) {
    if (!modifierDefinition(key))
      throw new Error(`${path} 使用了未注册词条 ${key}`);
    if (!modifierScopes(key).includes(scope))
      throw new Error(`${path}.${key} 不支持 ${scope} 作用域`);
    const at = `${path}.${key}`;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.hasOwn(value, "operation")
    ) {
      const term = effectObject(value, at);
      effectFields(term, ["operation", "value"], at);
      if (!["add", "add_percent", "multiply"].includes(String(term.operation)))
        throw new Error(`${at} 未知修正运算 ${String(term.operation)}`);
      result[key] = {
        operation: term.operation as ModifierOperation,
        value: validateExpression(term.value, `${at}.value`, scope),
      };
    } else result[key] = validateExpression(value, at, scope);
  }
  return result;
}
