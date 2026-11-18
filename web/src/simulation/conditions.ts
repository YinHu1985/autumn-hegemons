import type { Condition } from "../definitions/conditions";
import type { Content } from "../definitions/types";
import { relationValue } from "./diplomacy";
import { getEventFlag, occurrenceKey, type EventContext } from "./events/state";
import { gameDay } from "./modifier-clock";
import { evaluateExpression } from "./modifier-expression";
import type { WorldState } from "./state";

export interface ConditionResult {
  passed: boolean;
  reasons: string[];
  /** Invalid/missing context stays invalid even under `not`. */
  valid: boolean;
}
function compare(
  a: number,
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte",
  b: number,
): boolean {
  switch (operator) {
    case "eq":
      return a === b;
    case "ne":
      return a !== b;
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
  }
}
const signs = { eq: "=", ne: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤" };
const metricNames: Record<string, string> = {
  "nation.treasury": "国库粮食",
  "nation.manpower": "可用人力",
  "nation.budget.buildings": "建筑维护比例",
  "nation.budget.army": "军队维护比例",
  "nation.budget.research": "科研维护比例",
  "nation.operatingCoverage.buildings": "建筑实际维护",
  "nation.operatingCoverage.army": "军队实际维护",
  "nation.operatingCoverage.research": "科研实际维护",
  "settlement.scale": "城镇规模",
  "settlement.governance": "治理效率",
};
function result(passed: boolean, reason: string): ConditionResult {
  return { passed, valid: true, reasons: passed ? [] : [reason] };
}

/** Pure queries over registered state. Content never supplies executable code or paths. */
export function evaluateCondition(
  content: Content,
  world: WorldState,
  context: EventContext,
  condition?: Condition,
): ConditionResult {
  if (!condition) return { passed: true, valid: true, reasons: [] };
  try {
    if ("all" in condition || "any" in condition) {
      const children = ("all" in condition ? condition.all : condition.any).map(
        (child) => evaluateCondition(content, world, context, child),
      );
      const valid = children.every((child) => child.valid);
      const passed =
        valid &&
        ("all" in condition
          ? children.every((child) => child.passed)
          : children.some((child) => child.passed));
      return {
        passed,
        valid,
        reasons: passed ? [] : children.flatMap((child) => child.reasons),
      };
    }
    if ("not" in condition) {
      const inner = evaluateCondition(content, world, context, condition.not);
      if (!inner.valid) return inner;
      return result(!inner.passed, "不满足排除条件");
    }
    const research = world.research.nations[context.nationId];
    const city = context.settlementId
      ? world.settlements[context.settlementId]
      : undefined;
    const cityDefinition = content.scenario.settlements.find(
      (entry) => entry.id === context.settlementId,
    );
    switch (condition.type) {
      case "metric": {
        const current = evaluateExpression(world, context, {
          metric: condition.metric,
        });
        const wanted = evaluateExpression(world, context, condition.value);
        return result(
          compare(current, condition.compare, wanted),
          `${metricNames[condition.metric] ?? condition.metric}需 ${signs[condition.compare]} ${wanted}（当前 ${Math.round(current * 100) / 100}）`,
        );
      }
      case "technology":
        return result(
          research.unlocked.includes(condition.technologyId),
          `需要科技：${content.technologies.find((entry) => entry.id === condition.technologyId)?.name ?? condition.technologyId}`,
        );
      case "idea_unlocked":
        return result(
          research.unlockedIdeas.includes(condition.ideaId),
          `需要解锁理念：${content.ideas.find((entry) => entry.id === condition.ideaId)?.name ?? condition.ideaId}`,
        );
      case "idea_enacted":
        return result(
          research.enacted.includes(condition.ideaId),
          `需要启用理念：${content.ideas.find((entry) => entry.id === condition.ideaId)?.name ?? condition.ideaId}`,
        );
      case "building": {
        if (!city) throw new Error("条件需要绑定城镇");
        const current = city.buildings[condition.buildingId]?.level ?? 0;
        return result(
          compare(current, condition.compare, condition.value),
          `${content.buildings.find((entry) => entry.id === condition.buildingId)?.name ?? condition.buildingId}等级需 ${signs[condition.compare]} ${condition.value}`,
        );
      }
      case "terrain": {
        if (!cityDefinition) throw new Error("地形条件需要绑定城镇");
        return result(
          cityDefinition.terrain === condition.terrainId,
          `需要地形：${content.terrains.find((entry) => entry.id === condition.terrainId)?.name ?? condition.terrainId}`,
        );
      }
      case "specialty": {
        if (!cityDefinition) throw new Error("特产条件需要绑定城镇");
        return result(
          cityDefinition.specialty === condition.specialtyId,
          `需要特产：${content.specialties.find((entry) => entry.id === condition.specialtyId)?.name ?? condition.specialtyId}`,
        );
      }
      case "relation": {
        const other = condition.nationId ?? context.relatedNationId;
        if (!other || !world.nations[other] || other === context.nationId)
          throw new Error("关系条件需要另一国家");
        const current = relationValue(content, world, context.nationId, other);
        return result(
          compare(current, condition.compare, condition.value),
          `两国关系需 ${signs[condition.compare]} ${condition.value}（当前 ${current}）`,
        );
      }
      case "flag":
        return result(
          getEventFlag(world, context, condition.flagId, condition.target) ===
            (condition.value ?? true),
          `事件标记「${condition.flagId}」需为${condition.value === false ? "未设置" : "已设置"}`,
        );
      case "event_count": {
        const current =
          world.civic.occurrences[
            occurrenceKey(condition.eventId, condition.scope, context)
          ]?.count ?? 0;
        return result(
          compare(current, condition.compare, condition.value),
          `事件「${content.events.find((entry) => entry.id === condition.eventId)?.title ?? condition.eventId}」发生次数需 ${signs[condition.compare]} ${condition.value}`,
        );
      }
      case "modifier": {
        const definition = content.modifierDefinitions.find(
          (entry) => entry.id === condition.modifierId,
        );
        const kind = condition.target?.kind ?? definition?.scope ?? "nation";
        const id =
          condition.target?.id ??
          (kind === "nation" ? context.nationId : context.settlementId);
        if (!id) throw new Error("效果条件缺少作用对象");
        const now = gameDay(world.date);
        const present = world.modifiers.instances.some(
          (entry) =>
            entry.definitionId === condition.modifierId &&
            entry.target.kind === kind &&
            entry.target.id === id &&
            entry.startedAt <= now &&
            entry.expiresAt > now,
        );
        return result(
          present,
          `需要效果：${definition?.name ?? condition.modifierId}`,
        );
      }
    }
  } catch (error) {
    return {
      passed: false,
      valid: false,
      reasons: [error instanceof Error ? error.message : String(error)],
    };
  }
}
