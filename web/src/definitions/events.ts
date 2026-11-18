import {
  effectFields,
  effectObject,
  effectText,
  optionalEffectBoolean,
} from "./effect-validation";
import { validateCondition, type Condition } from "./conditions";
import { validateEffectActions, type EffectAction } from "./effects";
import {
  validateExpression,
  type Expression,
  type ModifierScope,
} from "./modifier-values";
import type { DateValue } from "./types";

export type EventEffect = EffectAction;
export type EventFactType =
  | "research_completed"
  | "construction_completed"
  | "battle_resolved"
  | "settlement_captured"
  | "diplomacy_completed";
export const EVENT_FACT_TYPES: readonly EventFactType[] = [
  "research_completed",
  "construction_completed",
  "battle_resolved",
  "settlement_captured",
  "diplomacy_completed",
];
export interface EventPoolDefinition {
  id: string;
  name: string;
  chance: number;
}
export const DEFAULT_EVENT_POOLS: EventPoolDefinition[] = [
  { id: "common", name: "民间纪事", chance: 0.22 },
];
export type EventTrigger =
  | { type: "random"; poolId: string }
  | { type: "fact"; fact: EventFactType; subjectId?: string }
  | { type: "date"; date: DateValue };
export interface EventTargetDefinition {
  kind: "settlement" | "related_nation" | "talent";
  condition?: Condition;
}
export interface EventRepeatRule {
  scope: "nation" | "settlement" | "world";
  once?: boolean;
  cooldownDays?: number;
  group?: string;
  groupCooldownDays?: number;
}
export interface EventOutcome {
  id: string;
  weight: number;
  effects: EffectAction[];
}
export interface EventOption {
  id: string;
  label: string;
  description: string;
  effects: EffectAction[];
  condition?: Condition;
  cost?: { grain?: Expression; manpower?: Expression };
  aiWeight?: number;
  outcomes?: EventOutcome[];
}
export interface EventDefinition {
  id: string;
  title: string;
  description: string;
  weight: number;
  duration: number;
  triggers: EventTrigger[];
  condition?: Condition;
  target?: EventTargetDefinition;
  repeat?: EventRepeatRule;
  presentation?: { important?: boolean; image?: string; speaker?: string };
  weightModifiers?: { condition: Condition; multiplier: number }[];
  options: EventOption[];
}

function quantity(
  value: unknown,
  path: string,
  min = 0,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new Error(
      `${path} 应为不小于 ${min} 的${integer ? "安全整数" : "有限数字"}`,
    );
  return value;
}
function list(value: unknown, path: string, nonempty = false): unknown[] {
  if (!Array.isArray(value) || (nonempty && !value.length))
    throw new Error(`${path} 需要${nonempty ? "非空" : ""}列表`);
  return value;
}
function uniqueId(value: unknown, path: string, ids: Set<string>): string {
  const id = effectText(value, path);
  if (ids.has(id)) throw new Error(`${path} ID 重复：${id}`);
  ids.add(id);
  return id;
}
export function validateEventPools(raw: unknown): EventPoolDefinition[] {
  const ids = new Set<string>();
  return list(raw, "eventPools").map((value, index) => {
    const at = `eventPools[${index}]`;
    const item = effectObject(value, at);
    effectFields(item, ["id", "name", "chance"], at);
    const chance = quantity(item.chance, `${at}.chance`);
    if (chance > 1) throw new Error(`${at}.chance 应在 0 到 1 之间`);
    return {
      id: uniqueId(item.id, `${at}.id`, ids),
      name: effectText(item.name, `${at}.name`),
      chance,
    };
  });
}
function validateTrigger(raw: unknown, path: string): EventTrigger {
  const item = effectObject(raw, path);
  if (item.type === "random") {
    effectFields(item, ["type", "poolId"], path);
    return {
      type: "random",
      poolId: effectText(item.poolId, `${path}.poolId`),
    };
  }
  if (item.type === "fact") {
    effectFields(item, ["type", "fact", "subjectId"], path);
    if (!EVENT_FACT_TYPES.includes(item.fact as EventFactType))
      throw new Error(`${path}.fact 事实类型无效`);
    return {
      type: "fact",
      fact: item.fact as EventFactType,
      ...(item.subjectId !== undefined && {
        subjectId: effectText(item.subjectId, `${path}.subjectId`),
      }),
    };
  }
  if (item.type === "date") {
    effectFields(item, ["type", "date"], path);
    const value = effectObject(item.date, `${path}.date`);
    effectFields(value, ["year", "month", "day"], `${path}.date`);
    const date = {
      year: quantity(value.year, `${path}.date.year`, -10000, true),
      month: quantity(value.month, `${path}.date.month`, 1, true),
      day: quantity(value.day, `${path}.date.day`, 1, true),
    };
    if (!date.year || date.year > 10000 || date.month > 12 || date.day > 30)
      throw new Error(`${path}.date 游戏日期无效`);
    return { type: "date", date };
  }
  throw new Error(`${path} 未知事件触发方式 ${String(item.type)}`);
}
function validateTarget(raw: unknown, path: string): EventTargetDefinition {
  const item = effectObject(raw, path);
  effectFields(item, ["kind", "condition"], path);
  if (!["settlement", "related_nation", "talent"].includes(String(item.kind)))
    throw new Error(`${path}.kind 对象类型无效`);
  return {
    kind: item.kind as EventTargetDefinition["kind"],
    ...(item.condition !== undefined && {
      condition: validateCondition(
        item.condition,
        `${path}.condition`,
        item.kind === "settlement" ? "settlement" : "nation",
      ),
    }),
  };
}
function validateRepeat(
  raw: unknown,
  path: string,
  scope: ModifierScope,
): EventRepeatRule {
  const item = effectObject(raw, path);
  effectFields(
    item,
    ["scope", "once", "cooldownDays", "group", "groupCooldownDays"],
    path,
  );
  if (!["nation", "settlement", "world"].includes(String(item.scope)))
    throw new Error(`${path}.scope 事件重复范围无效`);
  if (item.scope === "settlement" && scope !== "settlement")
    throw new Error(`${path} 城镇重复范围需要绑定城镇`);
  if (item.groupCooldownDays !== undefined && item.group === undefined)
    throw new Error(`${path}.groupCooldownDays 需要 group`);
  const once = optionalEffectBoolean(item.once, `${path}.once`);
  return {
    scope: item.scope as EventRepeatRule["scope"],
    ...(once !== undefined && { once }),
    ...(item.cooldownDays !== undefined && {
      cooldownDays: quantity(
        item.cooldownDays,
        `${path}.cooldownDays`,
        0,
        true,
      ),
    }),
    ...(item.group !== undefined && {
      group: effectText(item.group, `${path}.group`),
    }),
    ...(item.groupCooldownDays !== undefined && {
      groupCooldownDays: quantity(
        item.groupCooldownDays,
        `${path}.groupCooldownDays`,
        0,
        true,
      ),
    }),
  };
}
function validateOption(
  raw: unknown,
  path: string,
  scope: ModifierScope,
  ids: Set<string>,
  first: boolean,
): EventOption {
  const item = effectObject(raw, path);
  effectFields(
    item,
    [
      "id",
      "label",
      "description",
      "effects",
      "condition",
      "cost",
      "aiWeight",
      "outcomes",
    ],
    path,
  );
  if (first && (item.condition !== undefined || item.cost !== undefined))
    throw new Error(`${path} 首选项必须无条件、无强制费用，供超时自动处理`);
  let cost: EventOption["cost"];
  if (item.cost !== undefined) {
    const value = effectObject(item.cost, `${path}.cost`);
    effectFields(value, ["grain", "manpower"], `${path}.cost`);
    if (!Object.keys(value).length)
      throw new Error(`${path}.cost 费用不得为空`);
    cost = {};
    for (const key of ["grain", "manpower"] as const) {
      if (value[key] === undefined) continue;
      const amount = validateExpression(
        value[key],
        `${path}.cost.${key}`,
        scope,
      );
      if (typeof amount === "number" && amount < 0)
        throw new Error(`${path}.cost.${key} 费用不得为负`);
      cost[key] = amount;
    }
  }
  const outcomeIds = new Set<string>();
  return {
    id: uniqueId(item.id, `${path}.id`, ids),
    label: effectText(item.label, `${path}.label`),
    description: effectText(item.description, `${path}.description`),
    effects: validateEffectActions(item.effects, `${path}.effects`, scope),
    ...(item.condition !== undefined && {
      condition: validateCondition(item.condition, `${path}.condition`, scope),
    }),
    ...(cost !== undefined && { cost }),
    ...(item.aiWeight !== undefined && {
      aiWeight: quantity(item.aiWeight, `${path}.aiWeight`),
    }),
    ...(item.outcomes !== undefined && {
      outcomes: list(item.outcomes, `${path}.outcomes`, true).map(
        (value, index) => {
          const at = `${path}.outcomes[${index}]`;
          const outcome = effectObject(value, at);
          effectFields(outcome, ["id", "weight", "effects"], at);
          return {
            id: uniqueId(outcome.id, `${at}.id`, outcomeIds),
            weight: quantity(outcome.weight, `${at}.weight`, Number.MIN_VALUE),
            effects: validateEffectActions(
              outcome.effects,
              `${at}.effects`,
              scope,
            ),
          };
        },
      ),
    }),
  };
}

export function validateEvents(raw: unknown): EventDefinition[] {
  const ids = new Set<string>();
  return list(raw, "events").map((value, index) => {
    const path = `events[${index}]`;
    const item = effectObject(value, path);
    effectFields(
      item,
      [
        "id",
        "title",
        "description",
        "weight",
        "duration",
        "options",
        "triggers",
        "condition",
        "target",
        "repeat",
        "presentation",
        "weightModifiers",
      ],
      path,
    );
    const target =
      item.target === undefined
        ? undefined
        : validateTarget(item.target, `${path}.target`);
    const scope: ModifierScope =
      target?.kind === "settlement" ? "settlement" : "nation";
    const optionIds = new Set<string>();
    let presentation: EventDefinition["presentation"];
    if (item.presentation !== undefined) {
      const value = effectObject(item.presentation, `${path}.presentation`);
      effectFields(
        value,
        ["important", "image", "speaker"],
        `${path}.presentation`,
      );
      const important = optionalEffectBoolean(
        value.important,
        `${path}.presentation.important`,
      );
      presentation = {
        ...(important !== undefined && { important }),
        ...(value.image !== undefined && {
          image: effectText(value.image, `${path}.presentation.image`),
        }),
        ...(value.speaker !== undefined && {
          speaker: effectText(value.speaker, `${path}.presentation.speaker`),
        }),
      };
    }
    return {
      id: uniqueId(item.id, `${path}.id`, ids),
      title: effectText(item.title, `${path}.title`),
      description: effectText(item.description, `${path}.description`),
      weight: quantity(item.weight, `${path}.weight`, Number.MIN_VALUE),
      duration: quantity(item.duration, `${path}.duration`, 1, true),
      triggers: list(item.triggers, `${path}.triggers`).map((trigger, i) =>
        validateTrigger(trigger, `${path}.triggers[${i}]`),
      ),
      ...(target && { target }),
      ...(item.condition !== undefined && {
        condition: validateCondition(
          item.condition,
          `${path}.condition`,
          scope,
        ),
      }),
      ...(item.repeat !== undefined && {
        repeat: validateRepeat(item.repeat, `${path}.repeat`, scope),
      }),
      ...(presentation !== undefined && { presentation }),
      ...(item.weightModifiers !== undefined && {
        weightModifiers: list(
          item.weightModifiers,
          `${path}.weightModifiers`,
        ).map((value, i) => {
          const at = `${path}.weightModifiers[${i}]`;
          const modifier = effectObject(value, at);
          effectFields(modifier, ["condition", "multiplier"], at);
          return {
            condition: validateCondition(
              modifier.condition,
              `${at}.condition`,
              scope,
            ),
            multiplier: quantity(modifier.multiplier, `${at}.multiplier`),
          };
        }),
      }),
      options: list(item.options, `${path}.options`, true).map((option, i) =>
        validateOption(
          option,
          `${path}.options[${i}]`,
          scope,
          optionIds,
          i === 0,
        ),
      ),
    };
  });
}
