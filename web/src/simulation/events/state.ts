import type { EffectTarget } from "../../definitions/effects";
import type { EventFactType } from "../../definitions/events";
import type { DateValue } from "../../definitions/types";
import type { EffectResult } from "../effect-results";
import { gameDay } from "../modifier-clock";
import type { WorldState } from "../state";

/** Bound once at creation. These are saved object IDs, never fresh selectors. */
export interface EventContext {
  nationId: string;
  settlementId?: string;
  relatedNationId?: string;
  talentId?: string;
}
export interface ActiveEvent {
  id: string;
  definitionId: string;
  nationId: string;
  context: EventContext;
  createdAt: number;
  expiresAt: number;
}
export interface ScheduledEvent {
  id: string;
  definitionId: string;
  context: EventContext;
  createdAt: number;
  dueAt: number;
  retryDays?: number;
  retryUntil?: number;
}
export interface EventFact extends EventContext {
  type: EventFactType;
  subjectId?: string;
  outcome?: string;
}
export interface EventHistoryEntry {
  id: string;
  definitionId: string;
  nationId: string;
  context: EventContext;
  at: number;
  status: "resolved" | "cancelled";
  title: string;
  optionId?: string;
  optionLabel?: string;
  outcomeId?: string;
  reason?: string;
  results: EffectResult[];
}
export interface ChronicleEntry {
  date: DateValue;
  nationId: string;
  text: string;
}
export interface CivicState {
  events: ActiveEvent[];
  scheduled: ScheduledEvent[];
  history: EventHistoryEntry[];
  occurrences: Record<string, { count: number; lastAt: number }>;
  groupCooldowns: Record<string, number>;
  flags: Record<string, boolean>;
  facts: EventFact[];
  checkedDates: string[];
  log: ChronicleEntry[];
  seed: number;
  nextEventId: number;
}
export function createEventState(): CivicState {
  return {
    events: [],
    scheduled: [],
    history: [],
    occurrences: {},
    groupCooldowns: {},
    flags: {},
    facts: [],
    checkedDates: [],
    log: [],
    seed: 450,
    nextEventId: 1,
  };
}
export function eventRandom(world: WorldState): number {
  world.civic.seed = (Math.imul(world.civic.seed, 1664525) + 1013904223) >>> 0;
  return world.civic.seed / 4294967296;
}
export function eventContext(context: EventContext): EventContext {
  return {
    nationId: context.nationId,
    ...(context.settlementId && { settlementId: context.settlementId }),
    ...(context.relatedNationId && {
      relatedNationId: context.relatedNationId,
    }),
    ...(context.talentId && { talentId: context.talentId }),
  };
}
export function occurrenceKey(
  eventId: string,
  scope: "nation" | "settlement" | "world",
  context: EventContext,
): string {
  const id =
    scope === "world"
      ? "world"
      : scope === "nation"
        ? context.nationId
        : context.settlementId;
  if (!id) throw new Error("城镇事件缺少绑定城镇");
  return JSON.stringify([scope, id, eventId]);
}
/** Group counters and event counters intentionally use the same readable tuple. */
export const groupCooldownKey = occurrenceKey;
export function flagKey(
  context: EventContext,
  flagId: string,
  target?: EffectTarget,
): string {
  const kind = target?.kind ?? "nation";
  const id =
    target?.id ?? (kind === "nation" ? context.nationId : context.settlementId);
  if (!id) throw new Error("事件标记缺少作用对象");
  return JSON.stringify([kind, id, flagId]);
}
export function setEventFlag(
  world: WorldState,
  context: EventContext,
  flagId: string,
  value: boolean,
  target?: EffectTarget,
): void {
  const key = flagKey(context, flagId, target);
  const [kind, id] = JSON.parse(key) as [string, string, string];
  if (!(kind === "nation" ? world.nations[id] : world.settlements[id]))
    throw new Error("事件标记的作用对象不存在");
  if (value) world.civic.flags[key] = true;
  else delete world.civic.flags[key];
}
export function getEventFlag(
  world: WorldState,
  context: EventContext,
  flagId: string,
  target?: EffectTarget,
): boolean {
  return world.civic.flags[flagKey(context, flagId, target)] === true;
}
export function scheduleEvent(
  world: WorldState,
  context: EventContext,
  eventId: string,
  delayDays: number,
  retryDays?: number,
  retryUntilDays?: number,
): ScheduledEvent {
  if (!Number.isSafeInteger(delayDays) || delayDays < 1)
    throw new Error("后续事件延迟必须是正整数日数");
  if (
    (retryDays === undefined) !== (retryUntilDays === undefined) ||
    (retryDays !== undefined &&
      (!Number.isSafeInteger(retryDays) ||
        retryDays < 1 ||
        !Number.isSafeInteger(retryUntilDays) ||
        retryUntilDays! < retryDays))
  )
    throw new Error("后续事件重试需要有效间隔和期限");
  const now = gameDay(world.date);
  const entry: ScheduledEvent = {
    id: `scheduled-${world.civic.nextEventId++}`,
    definitionId: eventId,
    context: eventContext(context),
    createdAt: now,
    dueAt: now + delayDays,
    ...(retryDays !== undefined && {
      retryDays,
      retryUntil: now + delayDays + retryUntilDays!,
    }),
  };
  world.civic.scheduled.push(entry);
  return entry;
}
export function emitEventFact(world: WorldState, fact: EventFact): void {
  world.civic.facts.push({
    ...eventContext(fact),
    type: fact.type,
    ...(fact.subjectId && { subjectId: fact.subjectId }),
    ...(fact.outcome && { outcome: fact.outcome }),
  });
}
export function recordEventHistory(
  world: WorldState,
  entry: EventHistoryEntry,
): void {
  world.civic.history.unshift(entry);
  world.civic.history = world.civic.history.slice(0, 160);
}
