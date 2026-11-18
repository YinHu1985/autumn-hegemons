import {
  effectFields,
  effectObject,
  effectText,
  optionalEffectBoolean,
} from "./effect-validation";
import { validateEffectTarget, type EffectTarget } from "./effects";
import {
  EXPRESSION_METRICS,
  validateExpression,
  type Expression,
  type ModifierScope,
} from "./modifier-values";

export type Comparison = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { type: "metric"; metric: string; compare: Comparison; value: Expression }
  | { type: "technology"; technologyId: string }
  | { type: "idea_unlocked" | "idea_enacted"; ideaId: string }
  | { type: "building"; buildingId: string; compare: Comparison; value: number }
  | { type: "terrain"; terrainId: string }
  | { type: "specialty"; specialtyId: string }
  | { type: "relation"; nationId?: string; compare: Comparison; value: number }
  | { type: "flag"; flagId: string; value?: boolean; target?: EffectTarget }
  | {
      type: "event_count";
      eventId: string;
      scope: "nation" | "settlement" | "world";
      compare: Comparison;
      value: number;
    }
  | { type: "modifier"; modifierId: string; target?: EffectTarget };

export const COMPARISONS: readonly Comparison[] = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
];

/** Closed, serializable grammar: content can test registered facts, never arbitrary world paths. */
export function validateCondition(
  raw: unknown,
  path: string,
  scope: ModifierScope = "nation",
): Condition {
  let nodes = 0;
  function visit(value: unknown, at: string, depth: number): Condition {
    if (++nodes > 128 || depth > 12)
      throw new Error(`${path} 条件超过深度或节点限制`);
    const item = effectObject(value, at);
    for (const branch of ["all", "any"] as const) {
      if (!Object.hasOwn(item, branch)) continue;
      effectFields(item, [branch], at);
      if (!Array.isArray(item[branch]) || !item[branch].length)
        throw new Error(`${at}.${branch} 需要非空条件列表`);
      return {
        [branch]: item[branch].map((child, index) =>
          visit(child, `${at}.${branch}[${index}]`, depth + 1),
        ),
      } as Condition;
    }
    if (Object.hasOwn(item, "not")) {
      effectFields(item, ["not"], at);
      return { not: visit(item.not, `${at}.not`, depth + 1) };
    }
    const compare = (): Comparison => {
      if (!COMPARISONS.includes(item.compare as Comparison))
        throw new Error(`${at}.compare 比较方式无效`);
      return item.compare as Comparison;
    };
    const quantity = (integer = false): number => {
      if (
        typeof item.value !== "number" ||
        !Number.isFinite(item.value) ||
        (integer && (!Number.isInteger(item.value) || item.value < 0))
      )
        throw new Error(`${at}.value 数值无效`);
      return item.value;
    };
    const text = (field: string) => effectText(item[field], `${at}.${field}`);
    switch (item.type) {
      case "metric": {
        effectFields(item, ["type", "metric", "compare", "value"], at);
        const metric = text("metric");
        if (!Object.hasOwn(EXPRESSION_METRICS, metric))
          throw new Error(`${at} 引用未知基础指标 ${metric}`);
        if (
          scope === "nation" &&
          EXPRESSION_METRICS[metric].scope === "settlement"
        )
          throw new Error(`${at} 国家条件没有城镇指标上下文`);
        return {
          type: "metric",
          metric,
          compare: compare(),
          value: validateExpression(item.value, `${at}.value`, scope),
        };
      }
      case "technology":
        effectFields(item, ["type", "technologyId"], at);
        return { type: "technology", technologyId: text("technologyId") };
      case "idea_unlocked":
      case "idea_enacted":
        effectFields(item, ["type", "ideaId"], at);
        return { type: item.type, ideaId: text("ideaId") };
      case "building":
        effectFields(item, ["type", "buildingId", "compare", "value"], at);
        if (scope !== "settlement")
          throw new Error(`${at} 建筑条件需要城镇上下文`);
        return {
          type: "building",
          buildingId: text("buildingId"),
          compare: compare(),
          value: quantity(true),
        };
      case "terrain":
        effectFields(item, ["type", "terrainId"], at);
        if (scope !== "settlement")
          throw new Error(`${at} 地形条件需要城镇上下文`);
        return { type: "terrain", terrainId: text("terrainId") };
      case "specialty":
        effectFields(item, ["type", "specialtyId"], at);
        if (scope !== "settlement")
          throw new Error(`${at} 特产条件需要城镇上下文`);
        return { type: "specialty", specialtyId: text("specialtyId") };
      case "relation":
        effectFields(item, ["type", "nationId", "compare", "value"], at);
        return {
          type: "relation",
          ...(item.nationId !== undefined && { nationId: text("nationId") }),
          compare: compare(),
          value: quantity(),
        };
      case "event_count":
        effectFields(
          item,
          ["type", "eventId", "scope", "compare", "value"],
          at,
        );
        if (!["nation", "settlement", "world"].includes(String(item.scope)))
          throw new Error(`${at}.scope 作用域无效`);
        if (item.scope === "settlement" && scope !== "settlement")
          throw new Error(`${at} 城镇事件计数需要城镇上下文`);
        return {
          type: "event_count",
          eventId: text("eventId"),
          scope: item.scope as "nation" | "settlement" | "world",
          compare: compare(),
          value: quantity(true),
        };
      case "flag": {
        effectFields(item, ["type", "flagId", "value", "target"], at);
        const flagValue = optionalEffectBoolean(item.value, `${at}.value`);
        return {
          type: "flag",
          flagId: text("flagId"),
          ...(flagValue !== undefined && { value: flagValue }),
          ...(item.target !== undefined && {
            target: validateEffectTarget(item.target, `${at}.target`),
          }),
        };
      }
      case "modifier":
        effectFields(item, ["type", "modifierId", "target"], at);
        return {
          type: "modifier",
          modifierId: text("modifierId"),
          ...(item.target !== undefined && {
            target: validateEffectTarget(item.target, `${at}.target`),
          }),
        };
      default:
        throw new Error(`${at} 未知条件 ${String(item.type)}`);
    }
  }
  return visit(raw, path, 0);
}
