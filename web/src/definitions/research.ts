import { validateModifierTerms } from "./modifiers";
import type { ModifierTerms } from "./modifier-values";
import { validateEffectActions, type EffectAction } from "./effects";
import { effectFields, optionalEffectBoolean } from "./effect-validation";

export type ResearchCategory = "civil" | "craft" | "military" | "humanities";
export const RESEARCH_ATTRIBUTES = [
  "administration",
  "scholarship",
  "command",
] as const;
export type ResearchAttribute = (typeof RESEARCH_ATTRIBUTES)[number];
export type ResearchAttributeWeights = Partial<
  Record<ResearchAttribute, number>
>;
export const RESEARCH_ATTRIBUTE_NAMES: Record<ResearchAttribute, string> = {
  administration: "治政",
  scholarship: "学识",
  command: "统率",
};

/** One-time actions are separate from permanent numeric modifiers. */
export type CompletionEffect = EffectAction;

export interface TechnologyDefinition {
  id: string;
  name: string;
  description: string;
  category: ResearchCategory;
  tier: 1 | 2 | 3;
  route: string;
  routeName?: string;
  cost: number;
  prerequisite?: string;
  inspiration: number;
  inspirationCap: number;
  upkeep: number;
  attributeWeights: ResearchAttributeWeights;
  effects: ModifierTerms;
  showInAdministration?: boolean;
  completionEffects?: CompletionEffect[];
  image?: string;
}

/** Ideas have no research dependency; any supported action can unlock them. */
export interface IdeaDefinition {
  id: string;
  name: string;
  description: string;
  school: string;
  enactEffects?: EffectAction[];
  repealEffects?: EffectAction[];
  effects: ModifierTerms;
  showInAdministration?: boolean;
  image?: string;
}

export const CATEGORY_NAMES: Record<ResearchCategory, string> = {
  civil: "民生",
  craft: "工匠",
  military: "军事",
  humanities: "百家",
};

function entries(value: unknown, label: string): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label}需要列表`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error(`${label} ${index} 格式不正确`);
    for (const key of ["id", "name", "description"])
      if (typeof item[key] !== "string" || !item[key].trim())
        throw new Error(`${label} ${index}.${key} 需要文字`);
    if (item.image !== undefined && typeof item.image !== "string")
      throw new Error(`${item.id}.image 需要图片路径`);
    return item;
  });
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${path} 需要文字`);
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${path} 应为非负数字`);
  return value;
}

function attributeWeights(
  value: unknown,
  path: string,
): ResearchAttributeWeights {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} 需要能力权重映射`);
  const result: ResearchAttributeWeights = {};
  for (const [key, weight] of Object.entries(value)) {
    if (!RESEARCH_ATTRIBUTES.includes(key as ResearchAttribute))
      throw new Error(`${path} 包含未知能力 ${key}`);
    result[key as ResearchAttribute] = number(weight, `${path}.${key}`);
  }
  if (!Object.values(result).some((weight) => weight > 0))
    throw new Error(`${path} 至少需要一项正能力权重`);
  return result;
}

function visibility(item: Record<string, unknown>): {
  showInAdministration?: boolean;
} {
  const value = optionalEffectBoolean(
    item.showInAdministration,
    `${item.id}.showInAdministration`,
  );
  return value === undefined ? {} : { showInAdministration: value };
}

export function validateResearch(raw: {
  technologies?: unknown;
  ideas?: unknown;
}) {
  const technologies: TechnologyDefinition[] = entries(
    raw.technologies,
    "科技",
  ).map((item) => {
    effectFields(
      item,
      [
        "id",
        "name",
        "description",
        "category",
        "tier",
        "route",
        "routeName",
        "cost",
        "prerequisite",
        "inspiration",
        "inspirationCap",
        "upkeep",
        "attributeWeights",
        "effects",
        "completionEffects",
        "image",
        "showInAdministration",
      ],
      String(item.id),
    );
    if (
      typeof item.category !== "string" ||
      !Object.hasOwn(CATEGORY_NAMES, item.category)
    )
      throw new Error(`${item.id} 的科研类别无效`);
    if (![1, 2, 3].includes(item.tier as number))
      throw new Error(`${item.id} 成本档应为1至3`);
    const cost = number(item.cost, `${item.id}.cost`);
    const inspirationCap = number(
      item.inspirationCap,
      `${item.id}.inspirationCap`,
    );
    if (cost <= 0 || inspirationCap >= 1)
      throw new Error(`${item.id} 需要正成本且启发上限小于100%`);
    return {
      id: item.id as string,
      name: item.name as string,
      description: item.description as string,
      category: item.category as ResearchCategory,
      tier: item.tier as 1 | 2 | 3,
      route: text(item.route, `${item.id}.route`),
      ...(item.routeName !== undefined && {
        routeName: text(item.routeName, `${item.id}.routeName`),
      }),
      ...(item.prerequisite !== undefined && {
        prerequisite: text(item.prerequisite, `${item.id}.prerequisite`),
      }),
      cost,
      inspiration: number(item.inspiration, `${item.id}.inspiration`),
      inspirationCap,
      upkeep: number(item.upkeep, `${item.id}.upkeep`),
      attributeWeights: attributeWeights(
        item.attributeWeights,
        `${item.id}.attributeWeights`,
      ),
      effects: validateModifierTerms(item.effects, `${item.id}.effects`),
      ...visibility(item),
      ...(item.completionEffects !== undefined && {
        completionEffects: validateEffectActions(
          item.completionEffects,
          `${item.id}.completionEffects`,
        ),
      }),
      ...(item.image !== undefined && { image: item.image as string }),
    };
  });
  const ideas: IdeaDefinition[] = entries(raw.ideas, "理念").map((item) => {
    for (const field of [
      "category",
      "route",
      "routeName",
      "tier",
      "cost",
      "prerequisite",
      "inspiration",
      "inspirationCap",
      "upkeep",
      "attributeWeights",
      "technology",
      "completionEffects",
    ])
      if (Object.hasOwn(item, field))
        throw new Error(`${item.id}.${field} 是科研字段，理念不得依赖科技定义`);
    effectFields(
      item,
      [
        "id",
        "name",
        "description",
        "school",
        "effects",
        "enactEffects",
        "repealEffects",
        "image",
        "showInAdministration",
      ],
      String(item.id),
    );
    return {
      ...(item.enactEffects !== undefined && {
        enactEffects: validateEffectActions(
          item.enactEffects,
          `${item.id}.enactEffects`,
        ),
      }),
      ...(item.repealEffects !== undefined && {
        repealEffects: validateEffectActions(
          item.repealEffects,
          `${item.id}.repealEffects`,
        ),
      }),
      id: item.id as string,
      name: item.name as string,
      description: item.description as string,
      school: text(item.school, `${item.id}.school`),
      effects: validateModifierTerms(item.effects, `${item.id}.effects`),
      ...visibility(item),
      ...(item.image !== undefined && { image: item.image as string }),
    };
  });
  const all = [...technologies, ...ideas];
  if (new Set(all.map((item) => item.id)).size !== all.length)
    throw new Error("科技和理念 ID 不可重复");
  const byId = new Map(technologies.map((item) => [item.id, item]));
  for (const technology of technologies)
    if (technology.prerequisite) {
      const prior = byId.get(technology.prerequisite);
      if (
        !prior ||
        prior.tier >= technology.tier ||
        prior.route !== technology.route
      )
        throw new Error(`${technology.id} 前置必须为同路线的较低档科技`);
    }
  const ideaIds = new Set(ideas.map((idea) => idea.id));
  for (const technology of technologies)
    for (const effect of technology.completionEffects ?? [])
      if (effect.type === "unlock_idea" && !ideaIds.has(effect.ideaId))
        throw new Error(
          `${technology.id} 完成动作引用未知理念 ${effect.ideaId}`,
        );
  return { technologies, ideas };
}
