/**
 * Modifier vocabulary shared by content validation and explanations.
 * A definition names its actual consumer; registering a word never applies an effect by itself.
 * New calculations should register their key here and call researchModifier at the named consumer.
 */
export interface ModifierDefinition {
  name: string;
  unit: "percent" | "number";
  description: string;
  consumer: string;
}
export const MODIFIERS: Record<string, ModifierDefinition> = {
  fortification: {
    name: "城防强度",
    unit: "number",
    description: "城镇建筑提供的防御强度，受治理及产业维护影响。",
    consumer: "simulation/military-battles.ts: cityFortification",
  },
  income: {
    name: "粮食收入",
    unit: "percent",
    description: "提高城镇和建筑的粮食收入；不改变国家基础配额。",
    consumer: "simulation/economy.ts: calculateEconomy",
  },
  production: {
    name: "产业产量",
    unit: "percent",
    description: "提高作坊运行规模，同时增加加工原料需求；原料短缺仍会限产。",
    consumer: "simulation/economy.ts: calculateEconomy",
  },
  manpower: {
    name: "人力上限与恢复",
    unit: "percent",
    description: "调整全国统一人力池上限，月恢复量也随上限变化。",
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
    description: "调整新占地区与受损地区每日治理恢复。",
    consumer: "simulation/civic.ts: tickCivicDay",
  },
  building_cost: {
    name: "营建费用",
    unit: "percent",
    description: "调整建造、升级与扩城的一次性粮食费用，负数降低费用。",
    consumer: "simulation/settlements.ts: constructionQuote",
  },
  building_speed: {
    name: "营建速度",
    unit: "percent",
    description: "缩短建造、升级与扩城所需时间。",
    consumer: "simulation/settlements.ts: constructionQuote",
  },
  research_efficiency: {
    name: "研究效率",
    unit: "percent",
    description: "调整已支付投入转化为研究进度的效率。",
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
    description: "提高军团有效战斗力。",
    consumer: "simulation/military-strength.ts: regimentPower",
  },
  "army.defense": {
    name: "部队防御",
    unit: "percent",
    description: "提高战略防守战斗力与战术部队防御。",
    consumer: "simulation/military-battles.ts: battleStrength",
  },
  "army.speed": {
    name: "行军速度",
    unit: "percent",
    description: "缩短军团在城镇间的行军时间。",
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
    description: "作为进攻方参加会战时提高战力，同时作用于手动和自动决战。",
    consumer:
      "simulation/military-battles.ts: battleStrength; military-tactics.ts: beginTactical",
  },
};
const categories: Record<string, string> = {
  civil: "民生",
  craft: "工匠",
  military: "军事",
  humanities: "人文",
};
export function modifierDefinition(
  key: string,
): ModifierDefinition | undefined {
  if (MODIFIERS[key]) return MODIFIERS[key];
  if (key.startsWith("production.") && key.length > 11)
    return {
      name: "本产业产量",
      unit: "percent",
      description: `调整 ${key.slice(11)} 路线建筑的产出及原料需求。`,
      consumer: "simulation/economy.ts: calculateEconomy (building.route)",
    };
  if (key.startsWith("research.seats.") && categories[key.slice(15)])
    return {
      name: `${categories[key.slice(15)]}科研席位`,
      unit: "number",
      description: "增加该类科研组的常规数量，超编会降低同类全部组的效率。",
      consumer: "simulation/research.ts: categorySeats",
    };
  return undefined;
}
export function formatModifier(key: string, value: number): string {
  const definition = modifierDefinition(key);
  const number =
    definition?.unit === "number"
      ? Number(value.toFixed(2))
      : Number((value * 100).toFixed(1));
  return `${definition?.name ?? key} ${value >= 0 ? "+" : ""}${number}${definition?.unit === "number" ? "" : "%"}`;
}
export function validateModifiers(
  raw: unknown,
  path: string,
  source: "research" | "building" = "research",
): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(`${path} 需要词条到数值的映射`);
  const normalized: Record<string, number> = {};
  for (const [originalKey, value] of Object.entries(raw)) {
    // Migrate old content packs alongside the removal of the siege subsystem.
    const key = originalKey === "siege.progress" ? "army.offense" : originalKey;
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
