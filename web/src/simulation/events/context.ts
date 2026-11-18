import type { EventDefinition } from "../../definitions/events";
import type { Content } from "../../definitions/types";
import { evaluateCondition } from "../conditions";
import { gameDay } from "../modifier-clock";
import type { WorldState } from "../state";
import { eventContext, type ActiveEvent, type EventContext } from "./state";

export function nationExists(world: WorldState, nationId: string): boolean {
  return (
    !!world.nations[nationId] &&
    Object.values(world.settlements).some((city) => city.owner === nationId)
  );
}
export function boundContextReasons(
  world: WorldState,
  context: EventContext,
): string[] {
  const reasons: string[] = [];
  if (!nationExists(world, context.nationId)) reasons.push("所属国家已经灭亡");
  if (context.settlementId) {
    const city = world.settlements[context.settlementId];
    if (!city) reasons.push("绑定城镇已经不存在");
    else if (city.owner !== context.nationId)
      reasons.push("绑定城镇已不属于本国");
  }
  if (context.relatedNationId && !nationExists(world, context.relatedNationId))
    reasons.push("相关国家已经灭亡");
  if (context.talentId) {
    const talent = world.research.talents[context.talentId];
    if (
      !talent ||
      talent.nationId !== context.nationId ||
      talent.recruitedMonth === null
    )
      reasons.push("绑定人才已离开本国");
  }
  return reasons;
}

/** Project supplied fact/parent context onto the objects this event actually binds. */
export function boundEventContext(
  definition: EventDefinition,
  supplied: EventContext,
): EventContext {
  const context = eventContext(supplied);
  if (definition.target?.kind !== "settlement") delete context.settlementId;
  if (definition.target?.kind !== "related_nation")
    delete context.relatedNationId;
  if (definition.target?.kind !== "talent") delete context.talentId;
  return context;
}

export function requiredTargetReasons(
  definition: EventDefinition,
  context: EventContext,
): string[] {
  if (definition.target?.kind === "settlement" && !context.settlementId)
    return ["此事件必须绑定一个城镇"];
  if (definition.target?.kind === "related_nation" && !context.relatedNationId)
    return ["此事件必须绑定另一国家"];
  if (definition.target?.kind === "talent" && !context.talentId)
    return ["此事件必须绑定一名人才"];
  return [];
}

/** Selectors only run at creation. Inherited delayed context must be used as-is. */
export function candidateContexts(
  content: Content,
  world: WorldState,
  definition: EventDefinition,
  supplied: EventContext,
  inherited = false,
): EventContext[] {
  const base = boundEventContext(definition, supplied);
  if (!nationExists(world, base.nationId)) return [];
  const target = definition.target;
  // Fact metadata is not automatically a lifetime dependency or an action target.
  // Only authored selectors establish a binding (and delayed events reuse it).
  let candidates = [base];
  if (target?.kind === "settlement") {
    if (!base.settlementId && !inherited)
      candidates = Object.values(world.settlements)
        .filter((city) => city.owner === base.nationId)
        .map((city) => ({ ...base, settlementId: city.id }));
    else if (!base.settlementId) return [];
  } else if (target?.kind === "related_nation") {
    if (!base.relatedNationId && !inherited)
      candidates = Object.keys(world.nations)
        .filter((id) => id !== base.nationId && nationExists(world, id))
        .map((id) => ({ ...base, relatedNationId: id }));
    else if (!base.relatedNationId) return [];
  } else if (target?.kind === "talent") {
    if (!base.talentId && !inherited)
      candidates = Object.values(world.research.talents)
        .filter(
          (talent) =>
            talent.nationId === base.nationId && talent.recruitedMonth !== null,
        )
        .map((talent) => ({ ...base, talentId: talent.id }));
    else if (!base.talentId) return [];
  }
  return candidates.filter(
    (context) =>
      !boundContextReasons(world, context).length &&
      evaluateCondition(content, world, context, target?.condition).passed &&
      evaluateCondition(content, world, context, definition.condition).passed,
  );
}
export function eventDaysLeft(world: WorldState, event: ActiveEvent): number {
  return Math.max(0, event.expiresAt - gameDay(world.date));
}
export function renderEventText(
  content: Content,
  world: WorldState,
  event: Pick<ActiveEvent, "context">,
  text: string,
): string {
  const context = event.context;
  const names: Record<string, string> = {
    nation:
      content.scenario.nations.find((entry) => entry.id === context.nationId)
        ?.name ?? context.nationId,
    settlement:
      content.scenario.settlements.find(
        (entry) => entry.id === context.settlementId,
      )?.name ?? "当地",
    relatedNation:
      content.scenario.nations.find(
        (entry) => entry.id === context.relatedNationId,
      )?.name ?? "对方",
    talent: world.research.talents[context.talentId ?? ""]?.name ?? "故人",
  };
  return text.replace(
    /\{\{(nation|settlement|relatedNation|talent)\}\}/g,
    (_, key: string) => names[key],
  );
}
