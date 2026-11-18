import type { EventDefinition } from "../../definitions/events";
import type { Content } from "../../definitions/types";
import { evaluateCondition } from "../conditions";
import { gameDay } from "../modifier-clock";
import type { WorldState } from "../state";
import { candidateContexts, nationExists } from "./context";
import { pickWeighted } from "./random";
export { pickWeighted } from "./random";
import {
  eventContext,
  eventRandom,
  groupCooldownKey,
  occurrenceKey,
  type ActiveEvent,
  type EventContext,
} from "./state";

export function repeatScope(
  definition: EventDefinition,
): "nation" | "settlement" | "world" {
  return (
    definition.repeat?.scope ??
    (definition.target?.kind === "settlement" ? "settlement" : "nation")
  );
}
export function occurrenceReasons(
  world: WorldState,
  definition: EventDefinition,
  context: EventContext,
): string[] {
  const scope = repeatScope(definition);
  if (scope === "settlement" && !context.settlementId)
    return ["事件缺少已绑定的城镇"];
  const key = occurrenceKey(definition.id, scope, context);
  const occurrence = world.civic.occurrences[key];
  const now = gameDay(world.date);
  const reasons: string[] = [];
  if (definition.repeat?.once && occurrence?.count)
    reasons.push("这一对象的事件已经发生过");
  if (
    occurrence &&
    occurrence.lastAt + (definition.repeat?.cooldownDays ?? 0) > now
  )
    reasons.push("事件尚在冷却中");
  if (
    definition.repeat?.group &&
    (world.civic.groupCooldowns[
      groupCooldownKey(definition.repeat.group, scope, context)
    ] ?? -Infinity) > now
  )
    reasons.push("同组事件尚在冷却中");
  if (
    world.civic.events.some(
      (entry) =>
        entry.definitionId === definition.id &&
        (scope !== "settlement" || entry.context.settlementId) &&
        occurrenceKey(definition.id, scope, entry.context) === key,
    )
  )
    reasons.push("同一对象已有待处理事件");
  return reasons;
}
export function eligibleContexts(
  content: Content,
  world: WorldState,
  definition: EventDefinition,
  supplied: EventContext,
  inherited = false,
): EventContext[] {
  return candidateContexts(
    content,
    world,
    definition,
    supplied,
    inherited,
  ).filter((context) => !occurrenceReasons(world, definition, context).length);
}
function recordOccurrence(
  world: WorldState,
  definition: EventDefinition,
  context: EventContext,
): void {
  const now = gameDay(world.date);
  const scopes: ("nation" | "world" | "settlement")[] = context.settlementId
    ? ["nation", "world", "settlement"]
    : ["nation", "world"];
  for (const scope of scopes) {
    const key = occurrenceKey(definition.id, scope, context);
    world.civic.occurrences[key] = {
      count: (world.civic.occurrences[key]?.count ?? 0) + 1,
      lastAt: now,
    };
  }
  if (definition.repeat?.group && definition.repeat.groupCooldownDays)
    world.civic.groupCooldowns[
      groupCooldownKey(
        definition.repeat.group,
        repeatScope(definition),
        context,
      )
    ] = now + definition.repeat.groupCooldownDays;
}
/** Returns undefined without effects when eligibility fails. Used by all trigger paths. */
export function createEventInstance(
  content: Content,
  world: WorldState,
  eventId: string,
  supplied: EventContext,
  inherited = false,
): ActiveEvent | undefined {
  const definition = content.events.find((entry) => entry.id === eventId);
  if (!definition) throw new Error(`事件定义不存在：${eventId}`);
  const contexts = eligibleContexts(
    content,
    world,
    definition,
    supplied,
    inherited,
  );
  if (!contexts.length) return undefined;
  const context =
    contexts.length === 1
      ? contexts[0]
      : contexts[Math.floor(eventRandom(world) * contexts.length)];
  const now = gameDay(world.date);
  const event: ActiveEvent = {
    id: `event-${world.civic.nextEventId++}`,
    definitionId: definition.id,
    nationId: context.nationId,
    context: eventContext(context),
    createdAt: now,
    expiresAt: now + definition.duration,
  };
  world.civic.events.push(event);
  recordOccurrence(world, definition, context);
  return event;
}
export const triggerEvent = createEventInstance;
function eventWeight(
  content: Content,
  world: WorldState,
  definition: EventDefinition,
  context: EventContext,
): number {
  let logWeight = Math.log(definition.weight);
  for (const entry of definition.weightModifiers ?? []) {
    if (!evaluateCondition(content, world, context, entry.condition).passed)
      continue;
    if (!entry.multiplier) return 0;
    logWeight += Math.log(entry.multiplier);
  }
  return Math.exp(Math.min(700, logWeight));
}
export function tickEventsMonth(content: Content, world: WorldState): void {
  for (const nationId of Object.keys(world.nations)) {
    if (!nationExists(world, nationId)) continue;
    for (const pool of content.eventPools) {
      if (eventRandom(world) >= pool.chance) continue;
      const candidates = content.events.flatMap((definition) => {
        if (
          !definition.triggers.some(
            (trigger) =>
              trigger.type === "random" && trigger.poolId === pool.id,
          )
        )
          return [];
        const contexts = eligibleContexts(content, world, definition, {
          nationId,
        });
        if (!contexts.length) return [];
        const weighted = contexts.map((context) => ({
          value: context,
          weight: eventWeight(content, world, definition, context),
        }));
        // A country with more cities gets no extra entries in the event lottery.
        return [
          {
            value: { definition, weighted },
            weight: weighted.reduce(
              (sum, entry) => sum + entry.weight / weighted.length,
              0,
            ),
          },
        ];
      });
      const selected = pickWeighted(world, candidates);
      if (!selected) continue;
      const context = pickWeighted(world, selected.weighted);
      if (context)
        createEventInstance(
          content,
          world,
          selected.definition.id,
          context,
          true,
        );
    }
  }
}
/** Producers enqueue facts only after their state changes have committed. */
export function flushEventFacts(content: Content, world: WorldState): void {
  const facts = world.civic.facts.splice(0);
  for (const fact of facts) {
    for (const definition of content.events) {
      if (
        !definition.triggers.some(
          (trigger) =>
            trigger.type === "fact" &&
            trigger.fact === fact.type &&
            (!trigger.subjectId || trigger.subjectId === fact.subjectId),
        )
      )
        continue;
      createEventInstance(content, world, definition.id, fact);
    }
  }
}
