import { validateModifiers } from "./modifiers";
export type ResearchCategory = "civil" | "craft" | "military" | "humanities";
export interface TechnologyDefinition {
  id: string;
  name: string;
  description: string;
  category: ResearchCategory;
  tier: 1 | 2 | 3;
  route: string;
  cost: number;
  prerequisite?: string;
  inspiration: number;
  inspirationCap: number;
  upkeep: number;
  effects: Record<string, number>;
  image?: string;
}
export interface IdeaDefinition extends Omit<
  TechnologyDefinition,
  "prerequisite"
> {
  school: string;
}
export const CATEGORY_NAMES: Record<ResearchCategory, string> = {
  civil: "民生",
  craft: "工匠",
  military: "军事",
  humanities: "人文",
};
export function validateResearch(raw: {
  technologies?: unknown;
  ideas?: unknown;
}) {
  const read = (value: unknown, ideas: boolean): TechnologyDefinition[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error("科技与理念需要列表");
    return value.map((item, index) => {
      if (!item || typeof item !== "object")
        throw new Error(`课题 ${index} 格式不正确`);
      for (const key of ["id", "name", "description", "route"])
        if (typeof item[key] !== "string" || !item[key])
          throw new Error(`课题 ${index}.${key} 需要文字`);
      if (!Object.hasOwn(CATEGORY_NAMES, item.category))
        throw new Error(`${item.id} 的科研类别无效`);
      if (![1, 2, 3].includes(item.tier))
        throw new Error(`${item.id} 成本档应为1至3`);
      for (const key of ["cost", "inspiration", "inspirationCap", "upkeep"])
        if (
          typeof item[key] !== "number" ||
          !Number.isFinite(item[key]) ||
          item[key] < 0
        )
          throw new Error(`${item.id}.${key} 应为非负数字`);
      if (item.cost <= 0 || item.inspirationCap >= 1)
        throw new Error(`${item.id} 需要正成本且启发上限小于100%`);
      if (
        !item.effects ||
        typeof item.effects !== "object" ||
        Array.isArray(item.effects) ||
        Object.values(item.effects).some(
          (v) => typeof v !== "number" || !Number.isFinite(v),
        )
      )
        throw new Error(`${item.id} 的效果应为名称到数值的映射`);
      if (
        ideas &&
        (typeof item.school !== "string" ||
          !item.school ||
          item.prerequisite !== undefined)
      )
        throw new Error(`${item.id} 理念需要学派且不允许前置`);
      if (
        item.prerequisite !== undefined &&
        typeof item.prerequisite !== "string"
      )
        throw new Error(`${item.id} 的前置应为科技ID`);
      return {
        ...item,
        effects: validateModifiers(item.effects, `${item.id}.effects`),
      };
    });
  };
  const technologies = read(raw.technologies, false);
  const ideas = read(raw.ideas, true) as IdeaDefinition[];
  const all = [...technologies, ...ideas];
  if (new Set(all.map((t) => t.id)).size !== all.length)
    throw new Error("科技和理念 ID 不可重复");
  const byId = new Map(technologies.map((t) => [t.id, t]));
  for (const t of technologies)
    if (t.prerequisite) {
      const prior = byId.get(t.prerequisite);
      if (!prior || prior.tier >= t.tier || prior.route !== t.route)
        throw new Error(`${t.id} 前置必须为同路线的较低档科技`);
    }
  return { technologies, ideas };
}
