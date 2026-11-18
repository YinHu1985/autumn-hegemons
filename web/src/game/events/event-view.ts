import type { Content } from "../../definitions/types";
import type { EventContext } from "../../simulation/events/state";
import type { WorldState } from "../../simulation/state";

export function eventContextLabel(
  content: Content,
  world: WorldState,
  context: EventContext,
): string {
  const names = [
    context.settlementId &&
      content.scenario.settlements.find(
        (entry) => entry.id === context.settlementId,
      )?.name,
    context.relatedNationId &&
      content.scenario.nations.find(
        (entry) => entry.id === context.relatedNationId,
      )?.name,
    context.talentId && world.research.talents[context.talentId]?.name,
  ].filter(Boolean);
  return names.length
    ? names.join(" · ")
    : (content.scenario.nations.find((entry) => entry.id === context.nationId)
        ?.name ?? "本国");
}

export function eventImageUrl(path?: string): string {
  return `${import.meta.env.BASE_URL}${(path ?? "assets/central-city.webp").replace(/^\/+/, "")}`;
}

export function eventCostLabel(cost: {
  grain: number;
  manpower: number;
}): string {
  return [
    cost.grain > 0 && `粮食 ${Number(cost.grain.toFixed(2)).toLocaleString()}`,
    cost.manpower > 0 &&
      `人力 ${Number(cost.manpower.toFixed(2)).toLocaleString()}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
