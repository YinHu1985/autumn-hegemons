import { effectFields, effectObject } from "./effect-validation";

export type ModifierScope = "nation" | "settlement";
export type Expression =
  | number
  | { metric: string }
  | {
      op: "add" | "subtract" | "multiply" | "divide" | "min" | "max" | "clamp";
      args: Expression[];
    };
export type ModifierOperation = "add" | "add_percent" | "multiply";
export type ModifierValue =
  Expression | { operation: ModifierOperation; value: Expression };
export type ModifierTerms = Record<string, ModifierValue>;

export const EXPRESSION_LIMITS = { depth: 12, nodes: 128 } as const;
export const EXPRESSION_METRICS: Record<
  string,
  { name: string; scope: ModifierScope }
> = {
  "nation.treasury": { name: "国家现有粮食", scope: "nation" },
  "nation.manpower": { name: "国家可征人力", scope: "nation" },
  "nation.budget.buildings": { name: "产业维护设定", scope: "nation" },
  "nation.budget.army": { name: "军队维护设定", scope: "nation" },
  "nation.budget.research": { name: "科研维护设定", scope: "nation" },
  "nation.operatingCoverage.buildings": {
    name: "本期产业维护覆盖",
    scope: "nation",
  },
  "nation.operatingCoverage.army": {
    name: "本期军队维护覆盖",
    scope: "nation",
  },
  "nation.operatingCoverage.research": {
    name: "本期科研维护覆盖",
    scope: "nation",
  },
  "settlement.scale": { name: "城镇规模", scope: "settlement" },
  "settlement.governance": { name: "城镇治理效率", scope: "settlement" },
};

/** Expressions may read base facts only; they cannot recursively request another calculated stat. */
export function validateExpression(
  raw: unknown,
  path: string,
  scope: ModifierScope = "nation",
): Expression {
  let nodes = 0;
  function visit(value: unknown, at: string, depth: number): Expression {
    if (++nodes > EXPRESSION_LIMITS.nodes || depth > EXPRESSION_LIMITS.depth)
      throw new Error(`${path} 表达式超过深度或节点限制`);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`${at} 应为有限数字`);
      return value;
    }
    const item = effectObject(value, at);
    if (Object.hasOwn(item, "metric")) {
      effectFields(item, ["metric"], at);
      if (
        typeof item.metric !== "string" ||
        !Object.hasOwn(EXPRESSION_METRICS, item.metric)
      )
        throw new Error(`${at} 引用未知基础指标 ${String(item.metric)}`);
      if (
        scope === "nation" &&
        EXPRESSION_METRICS[item.metric].scope === "settlement"
      )
        throw new Error(`${at} 国家作用域没有城镇指标上下文`);
      return { metric: item.metric };
    }
    effectFields(item, ["op", "args"], at);
    const operations = [
      "add",
      "subtract",
      "multiply",
      "divide",
      "min",
      "max",
      "clamp",
    ];
    if (typeof item.op !== "string" || !operations.includes(item.op))
      throw new Error(`${at} 未知表达式运算 ${String(item.op)}`);
    if (!Array.isArray(item.args)) throw new Error(`${at}.args 应为表达式列表`);
    const required =
      item.op === "clamp"
        ? 3
        : ["subtract", "divide"].includes(item.op)
          ? 2
          : undefined;
    if (required ? item.args.length !== required : item.args.length < 2)
      throw new Error(`${at}.${item.op} 参数数量无效`);
    const args = item.args.map((arg, index) =>
      visit(arg, `${at}.args[${index}]`, depth + 1),
    );
    if (item.op === "divide" && args[1] === 0)
      throw new Error(`${at} 除数不得为零`);
    if (
      item.op === "clamp" &&
      typeof args[1] === "number" &&
      typeof args[2] === "number" &&
      args[1] > args[2]
    )
      throw new Error(`${at} clamp 下限不得大于上限`);
    return {
      op: item.op as Exclude<Expression, number | { metric: string }>["op"],
      args,
    };
  }
  const expression = visit(raw, path, 0);
  validateConstantArithmetic(expression, path);
  return expression;
}

export function isExplicitModifierValue(
  value: ModifierValue,
): value is { operation: ModifierOperation; value: Expression } {
  return typeof value === "object" && "operation" in value;
}

export function formatExpression(value: Expression): string {
  if (typeof value === "number") return String(Number(value.toFixed(3)));
  if ("metric" in value)
    return EXPRESSION_METRICS[value.metric]?.name ?? value.metric;
  const args = value.args.map(formatExpression);
  const signs = { add: "+", subtract: "−", multiply: "×", divide: "÷" };
  if (value.op in signs)
    return `(${args.join(` ${signs[value.op as keyof typeof signs]} `)})`;
  return `${value.op}(${args.join(", ")})`;
}

/** Reject known-invalid arithmetic at import time, leaving variable evaluation to the simulation. */
function validateConstantArithmetic(
  expression: Expression,
  path: string,
): number | undefined {
  if (typeof expression === "number") return expression;
  if ("metric" in expression) return undefined;
  const args = expression.args.map((arg) =>
    validateConstantArithmetic(arg, path),
  );
  if (expression.op === "divide" && args[1] === 0)
    throw new Error(`${path} 除数不得为零`);
  if (
    expression.op === "clamp" &&
    args[1] !== undefined &&
    args[2] !== undefined &&
    args[1] > args[2]
  )
    throw new Error(`${path} clamp 下限不得大于上限`);
  if (args.some((arg) => arg === undefined)) return undefined;
  const values = args as number[];
  const result =
    expression.op === "add"
      ? values.reduce((sum, value) => sum + value, 0)
      : expression.op === "subtract"
        ? values[0] - values[1]
        : expression.op === "multiply"
          ? values.reduce((product, value) => product * value, 1)
          : expression.op === "divide"
            ? values[0] / values[1]
            : expression.op === "min"
              ? Math.min(...values)
              : expression.op === "max"
                ? Math.max(...values)
                : Math.min(values[2], Math.max(values[1], values[0]));
  if (!Number.isFinite(result))
    throw new Error(`${path} 表达式计算结果必须为有限数字`);
  return result;
}
