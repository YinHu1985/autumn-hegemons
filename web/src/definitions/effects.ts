import { effectFields, effectObject, effectText } from "./effect-validation";
import {
  validateExpression,
  type Expression,
  type ModifierScope,
} from "./modifier-values";

/** Omitted id means the current action's nation or settlement context. */
export interface EffectTarget {
  kind: ModifierScope;
  id?: string;
}
export type EffectAction =
  | {
      type: "grain" | "manpower" | "governance" | "research";
      amount: Expression;
      targetId?: string;
    }
  | { type: "unlock_idea"; ideaId: string }
  | {
      type: "add_modifier";
      modifierId: string;
      target?: EffectTarget;
      durationDays?: number;
      expiresAt?: number;
    }
  | {
      type: "remove_modifier";
      modifierId: string;
      target?: EffectTarget;
    }
  | { type: "set_flag"; flagId: string; value: boolean; target?: EffectTarget }
  | {
      type: "schedule_event";
      eventId: string;
      delayDays: number;
      retryDays?: number;
      retryUntilDays?: number;
    }
  | { type: "relation"; amount: Expression; nationId?: string };

export function validateEffectTarget(raw: unknown, path: string): EffectTarget {
  const item = effectObject(raw, path);
  effectFields(item, ["kind", "id"], path);
  if (item.kind !== "nation" && item.kind !== "settlement")
    throw new Error(`${path}.kind 仅支持 nation 或 settlement`);
  return {
    kind: item.kind,
    ...(item.id !== undefined && { id: effectText(item.id, `${path}.id`) }),
  };
}

export function validateEffectActions(
  raw: unknown,
  path: string,
  scope: ModifierScope = "nation",
): EffectAction[] {
  if (!Array.isArray(raw)) throw new Error(`${path} 需要动作列表`);
  return raw.map((value, index): EffectAction => {
    const at = `${path}[${index}]`;
    const item = effectObject(value, at);
    if (
      ["grain", "manpower", "governance", "research"].includes(
        String(item.type),
      )
    ) {
      effectFields(item, ["type", "amount", "targetId"], at);
      if (item.targetId !== undefined && item.type !== "research")
        throw new Error(`${at}.targetId 仅用于指定研究课题`);
      const amount = validateExpression(item.amount, `${at}.amount`, scope);
      if (item.type === "research" && typeof amount === "number" && amount < 0)
        throw new Error(`${at}.amount 研究启发不得为负数`);
      return {
        type: item.type as "grain" | "manpower" | "governance" | "research",
        amount,
        ...(item.targetId !== undefined && {
          targetId: effectText(item.targetId, `${at}.targetId`),
        }),
      };
    }
    if (item.type === "unlock_idea") {
      effectFields(item, ["type", "ideaId"], at);
      return {
        type: "unlock_idea",
        ideaId: effectText(item.ideaId, `${at}.ideaId`),
      };
    }
    if (item.type === "add_modifier" || item.type === "remove_modifier") {
      effectFields(
        item,
        item.type === "add_modifier"
          ? ["type", "modifierId", "target", "durationDays", "expiresAt"]
          : ["type", "modifierId", "target"],
        at,
      );
      const common = {
        modifierId: effectText(item.modifierId, `${at}.modifierId`),
        ...(item.target !== undefined && {
          target: validateEffectTarget(item.target, `${at}.target`),
        }),
      };
      if (item.type === "remove_modifier") {
        return {
          type: "remove_modifier",
          ...common,
        };
      }
      if (item.durationDays !== undefined && item.expiresAt !== undefined)
        throw new Error(`${at} durationDays 与 expiresAt 不可同时设置`);
      for (const field of ["durationDays", "expiresAt"])
        if (
          item[field] !== undefined &&
          (typeof item[field] !== "number" ||
            !Number.isSafeInteger(item[field]) ||
            (field === "durationDays" && Number(item[field]) < 1))
        )
          throw new Error(
            `${at}.${field} 应为${field === "durationDays" ? "正" : "安全"}整数日序`,
          );
      return {
        type: "add_modifier",
        ...common,
        ...(item.durationDays !== undefined && {
          durationDays: item.durationDays as number,
        }),
        ...(item.expiresAt !== undefined && {
          expiresAt: item.expiresAt as number,
        }),
      };
    }
    if (item.type === "set_flag") {
      effectFields(item, ["type", "flagId", "value", "target"], at);
      if (typeof item.value !== "boolean")
        throw new Error(`${at}.value 应为布尔值`);
      return {
        type: "set_flag",
        flagId: effectText(item.flagId, `${at}.flagId`),
        value: item.value,
        ...(item.target !== undefined && {
          target: validateEffectTarget(item.target, `${at}.target`),
        }),
      };
    }
    if (item.type === "schedule_event") {
      effectFields(
        item,
        ["type", "eventId", "delayDays", "retryDays", "retryUntilDays"],
        at,
      );
      for (const field of [
        "delayDays",
        "retryDays",
        "retryUntilDays",
      ] as const) {
        if (field !== "delayDays" && item[field] === undefined) continue;
        if (
          typeof item[field] !== "number" ||
          !Number.isSafeInteger(item[field]) ||
          Number(item[field]) < 1
        )
          throw new Error(`${at}.${field} 应为正整数天数`);
      }
      if (
        (item.retryDays === undefined) !==
        (item.retryUntilDays === undefined)
      )
        throw new Error(`${at} retryDays 与 retryUntilDays 必须同时设置`);
      if (
        item.retryDays !== undefined &&
        Number(item.retryUntilDays) < Number(item.retryDays)
      )
        throw new Error(`${at}.retryUntilDays 不得早于首次重试`);
      return {
        type: "schedule_event",
        eventId: effectText(item.eventId, `${at}.eventId`),
        delayDays: item.delayDays as number,
        ...(item.retryDays !== undefined && {
          retryDays: item.retryDays as number,
          retryUntilDays: item.retryUntilDays as number,
        }),
      };
    }
    if (item.type === "relation") {
      effectFields(item, ["type", "amount", "nationId"], at);
      return {
        type: "relation",
        amount: validateExpression(item.amount, `${at}.amount`, scope),
        ...(item.nationId !== undefined && {
          nationId: effectText(item.nationId, `${at}.nationId`),
        }),
      };
    }
    throw new Error(`${at} 未知动作 ${String(item.type)}`);
  });
}
