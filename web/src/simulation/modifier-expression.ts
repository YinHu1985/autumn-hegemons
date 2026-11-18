import type { Expression } from "../definitions/modifier-values";
import type { ModifierContext } from "./modifier-state";
import type { WorldState } from "./state";

function metricValue(
  world: WorldState,
  context: ModifierContext,
  metric: string,
): number {
  const nation = world.nations[context.nationId];
  if (!nation) throw new Error(`效果所属国家不存在：${context.nationId}`);
  if (metric === "nation.treasury") return nation.treasury;
  if (metric === "nation.manpower") return nation.manpower;
  for (const category of ["buildings", "army", "research"] as const) {
    if (metric === `nation.budget.${category}`) return nation.budget[category];
    if (metric === `nation.operatingCoverage.${category}`)
      return nation.operatingCoverage[category];
  }
  if (metric === "settlement.scale" || metric === "settlement.governance") {
    const city = context.settlementId
      ? world.settlements[context.settlementId]
      : undefined;
    if (!city || city.owner !== context.nationId)
      throw new Error(`表达式 ${metric} 缺少有效城镇上下文`);
    return metric === "settlement.scale" ? city.scale : city.governance;
  }
  throw new Error(`未登记的效果变量：${metric}`);
}

/** Pure, deterministic arithmetic over registered basic state; no stat recursion. */
export function evaluateExpression(
  world: WorldState,
  context: ModifierContext,
  expression: Expression,
): number {
  let result: number;
  if (typeof expression === "number") result = expression;
  else if ("metric" in expression)
    result = metricValue(world, context, expression.metric);
  else {
    const values = expression.args.map((arg) =>
      evaluateExpression(world, context, arg),
    );
    switch (expression.op) {
      case "add":
        result = values.reduce((sum, value) => sum + value, 0);
        break;
      case "subtract":
        result = values[0] - values[1];
        break;
      case "multiply":
        result = values.reduce((product, value) => product * value, 1);
        break;
      case "divide":
        if (values[1] === 0)
          throw new Error("效果表达式的除数不能为零；请用 max 设置下限");
        result = values[0] / values[1];
        break;
      case "min":
        result = Math.min(...values);
        break;
      case "max":
        result = Math.max(...values);
        break;
      case "clamp":
        if (values[1] > values[2])
          throw new Error("效果表达式 clamp 下限不能大于上限");
        result = Math.max(values[1], Math.min(values[2], values[0]));
        break;
    }
  }
  if (!Number.isFinite(result)) throw new Error("效果表达式产生了非有限结果");
  return result;
}
