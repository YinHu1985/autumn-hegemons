import type { EffectAction } from "../../definitions/effects";
import { formatExpression } from "../../definitions/modifier-values";
import { formatModifier } from "../../definitions/modifiers";
import type { Content, DateValue } from "../../definitions/types";
import {
  dateFromGameDay,
  PERMANENT_MODIFIER_EXPIRY,
} from "../../simulation/modifier-clock";

export interface EffectLabelContext {
  nationId?: string;
  settlementId?: string;
  relatedNationId?: string;
}

export function effectDateLabel(date: DateValue): string {
  return `${date.year < 0 ? `前${-date.year}` : date.year}年${date.month}月${date.day}日`;
}

export function effectExpiryLabel(expiresAt?: number, now?: number): string {
  if (expiresAt === undefined || expiresAt >= PERMANENT_MODIFIER_EXPIRY)
    return "长期有效";
  if (now !== undefined) return `剩余 ${Math.max(0, expiresAt - now)} 日`;
  return `至${effectDateLabel(dateFromGameDay(expiresAt))}`;
}

/** Descriptions follow the action schema used by research, ideas and events. */
export function describeEffectAction(
  content: Content,
  action: EffectAction,
  context: EffectLabelContext = {},
): string {
  switch (action.type) {
    case "grain":
    case "manpower":
    case "governance":
    case "research": {
      const names = {
        grain: "国库粮食",
        manpower: "可征人力",
        governance: context.settlementId
          ? `${content.scenario.settlements.find((entry) => entry.id === context.settlementId)?.name ?? "当地"}治理`
          : "各城镇治理",
        research: "研究启发",
      };
      const amount =
        typeof action.amount === "number"
          ? `${action.amount >= 0 ? "+" : ""}${Number((action.amount * (action.type === "governance" ? 100 : 1)).toFixed(2))}${action.type === "governance" ? " 个百分点" : ""}`
          : `变动 ${formatExpression(action.amount)}`;
      const target =
        action.type === "research"
          ? action.targetId
            ? ` · ${content.technologies.find((entry) => entry.id === action.targetId)?.name ?? action.targetId}`
            : " · 当前各课题"
          : "";
      return `${names[action.type]} ${amount}${target}${action.type === "research" ? "（受启发上限限制）" : ""}`;
    }
    case "unlock_idea":
      return `解锁理念「${content.ideas.find((entry) => entry.id === action.ideaId)?.name ?? action.ideaId}」`;
    case "add_modifier":
    case "remove_modifier": {
      const definition = content.modifierDefinitions.find(
        (entry) => entry.id === action.modifierId,
      );
      const targetKind = action.target?.kind ?? definition?.scope ?? "nation";
      const targetId =
        action.target?.id ??
        (targetKind === "settlement" ? context.settlementId : undefined);
      const target = targetId
        ? ((targetKind === "settlement"
            ? content.scenario.settlements
            : content.scenario.nations
          ).find((entry) => entry.id === targetId)?.name ?? targetId)
        : targetKind === "settlement"
          ? "当地"
          : "";
      const title = `${target ? `${target} · ` : ""}${action.type === "add_modifier" ? "获得" : "移除"}「${definition?.name ?? action.modifierId}」`;
      if (action.type === "remove_modifier") return title;
      const duration =
        action.durationDays !== undefined
          ? `${action.durationDays} 日`
          : effectExpiryLabel(action.expiresAt);
      const effects = Object.entries(definition?.effects ?? {})
        .map(([key, value]) => formatModifier(key, value))
        .join("；");
      return `${title}（${duration}）${effects ? `：${effects}` : ""}`;
    }
    case "set_flag":
      return action.value ? "记下此事，供后续奏报参照" : "了结此事的后续记载";
    case "schedule_event": {
      const event = content.events.find((entry) => entry.id === action.eventId);
      return `预计 ${action.delayDays} 日后呈上后续奏报${event ? `「${event.title}」` : ""}${action.retryDays ? "（若时机未到，将等待条件满足）" : ""}`;
    }
    case "relation": {
      const nationId = action.nationId ?? context.relatedNationId;
      const nation =
        content.scenario.nations.find((entry) => entry.id === nationId)?.name ??
        "对方";
      const amount =
        typeof action.amount === "number"
          ? `${action.amount >= 0 ? "+" : ""}${Number(action.amount.toFixed(2))}`
          : `变动 ${formatExpression(action.amount)}`;
      return `与${nation}关系 ${amount}`;
    }
  }
}
