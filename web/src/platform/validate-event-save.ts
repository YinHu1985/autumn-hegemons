import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { gameDay } from "../simulation/modifier-clock";

type RecordValue = Record<string, unknown>;
const fail = (path: string): never => {
  throw new Error(`存档字段无效：civic.${path}`);
};
function object(raw: unknown, path: string): RecordValue {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(path);
  return raw as RecordValue;
}
function list(raw: unknown, path: string): unknown[] {
  if (!Array.isArray(raw)) fail(path);
  return raw as unknown[];
}
function text(raw: unknown, path: string): string {
  if (typeof raw !== "string" || !raw.trim()) fail(path);
  return raw as string;
}
function integer(
  raw: unknown,
  path: string,
  min = -Infinity,
  max = Infinity,
): number {
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < min ||
    raw > max
  )
    fail(path);
  return raw as number;
}

/** Validate saved decisions and clocks as state. Never reconstruct them by triggering events. */
export function validateSavedEvents(
  raw: unknown,
  content: Content,
  world: WorldState,
): void {
  const state = object(raw, "state");
  const now = gameDay(world.date);
  integer(state.seed, "seed", 0, 4294967295);
  const nextId = integer(state.nextEventId, "nextEventId", 1);
  const eventIds = new Set(content.events.map((event) => event.id));
  const groupIds = new Set(
    content.events.map((event) => event.repeat?.group).filter(Boolean),
  );
  const nation = (raw: unknown, path: string) => {
    const id = text(raw, path);
    if (!Object.hasOwn(world.nations, id)) fail(path);
    return id;
  };
  const context = (raw: unknown, path: string): RecordValue => {
    const value = object(raw, path);
    nation(value.nationId, `${path}.nationId`);
    if (value.relatedNationId !== undefined) {
      nation(value.relatedNationId, `${path}.relatedNationId`);
      if (value.relatedNationId === value.nationId)
        fail(`${path}.relatedNationId`);
    }
    if (
      value.settlementId !== undefined &&
      !Object.hasOwn(world.settlements, text(value.settlementId, path))
    )
      fail(`${path}.settlementId`);
    // A bound talent may have died since creation; the next event tick cancels the decision.
    if (value.talentId !== undefined) text(value.talentId, `${path}.talentId`);
    return value;
  };
  const ids = new Set<string>();
  const pendingIdentities = new Set<string>();
  const requiredContext = (event: RecordValue, path: string): void => {
    const definition = content.events.find(
      (value) => value.id === event.definitionId,
    )!;
    const bound = object(event.context, `${path}.context`);
    const field =
      definition.target?.kind === "settlement"
        ? "settlementId"
        : definition.target?.kind === "related_nation"
          ? "relatedNationId"
          : definition.target?.kind === "talent"
            ? "talentId"
            : undefined;
    if (field && !bound[field]) fail(`${path}.context.${field}`);
    for (const key of ["settlementId", "relatedNationId", "talentId"])
      if (key !== field && bound[key] !== undefined)
        fail(`${path}.context.${key}`);
  };
  const countedIdentity = (event: RecordValue, path: string): string => {
    const definition = content.events.find(
      (value) => value.id === event.definitionId,
    )!;
    const bound = object(event.context, `${path}.context`);
    const scope =
      definition.repeat?.scope ??
      (definition.target?.kind === "settlement" ? "settlement" : "nation");
    const id =
      scope === "world"
        ? "world"
        : scope === "settlement"
          ? bound.settlementId
          : bound.nationId;
    const key = JSON.stringify([scope, id, definition.id]);
    const occurrence = object(
      object(state.occurrences, "occurrences")[key],
      `${path}.occurrence`,
    );
    integer(occurrence.count, `${path}.occurrence.count`, 1);
    return key;
  };
  const entry = (raw: unknown, path: string, prefix: string[]): RecordValue => {
    const value = object(raw, path);
    const id = text(value.id, `${path}.id`);
    const match = /^(event|scheduled|date)-([1-9]\d*)$/.exec(id);
    if (
      !match ||
      !prefix.includes(match[1]) ||
      !Number.isSafeInteger(Number(match[2])) ||
      Number(match[2]) >= nextId ||
      ids.has(id)
    )
      fail(`${path}.id`);
    ids.add(id);
    if (!eventIds.has(text(value.definitionId, path)))
      fail(`${path}.definitionId`);
    const bound = context(value.context, `${path}.context`);
    if (value.nationId !== undefined && value.nationId !== bound.nationId)
      fail(`${path}.nationId`);
    return value;
  };
  for (const rawEvent of list(state.events, "events")) {
    const event = entry(rawEvent, "events", ["event"]);
    requiredContext(event, "events");
    const identity = countedIdentity(event, "events");
    if (pendingIdentities.has(identity)) fail("events.duplicateTarget");
    pendingIdentities.add(identity);
    nation(event.nationId, "events.nationId");
    const start = integer(event.createdAt, "events.createdAt", -Infinity, now);
    integer(event.expiresAt, "events.expiresAt", start + 1);
  }
  for (const rawEvent of list(state.scheduled, "scheduled")) {
    const event = entry(rawEvent, "scheduled", ["scheduled"]);
    requiredContext(event, "scheduled");
    const start = integer(
      event.createdAt,
      "scheduled.createdAt",
      -Infinity,
      now,
    );
    const due = integer(event.dueAt, "scheduled.dueAt", start + 1);
    if ((event.retryDays === undefined) !== (event.retryUntil === undefined))
      fail("scheduled.retryDays");
    if (event.retryDays !== undefined) {
      integer(event.retryDays, "scheduled.retryDays", 1);
      integer(event.retryUntil, "scheduled.retryUntil", due);
    }
  }
  for (const rawEvent of list(state.history, "history")) {
    const event = entry(rawEvent, "history", ["event", "scheduled", "date"]);
    nation(event.nationId, "history.nationId");
    integer(event.at, "history.at", -Infinity, now);
    text(event.title, "history.title");
    if (!["resolved", "cancelled"].includes(String(event.status)))
      fail("history.status");
    const definition = content.events.find(
      (value) => value.id === event.definitionId,
    )!;
    if (event.status === "resolved") {
      countedIdentity(event, "history");
      const option = definition.options.find(
        (value) => value.id === event.optionId,
      );
      if (!option) fail("history.optionId");
      text(event.optionLabel, "history.optionLabel");
      if (
        event.outcomeId !== undefined &&
        !option!.outcomes?.some((value) => value.id === event.outcomeId)
      )
        fail("history.outcomeId");
    } else text(event.reason, "history.reason");
    for (const rawResult of list(event.results, "history.results")) {
      const result = object(rawResult, "history.result");
      text(result.type, "history.result.type");
      text(result.description, "history.result.description");
      if (result.targetId !== undefined)
        text(result.targetId, "history.result.targetId");
      for (const key of ["before", "after"])
        if (
          result[key] !== undefined &&
          (typeof result[key] !== "number" || !Number.isFinite(result[key]))
        )
          fail(`history.result.${key}`);
    }
  }
  const tuple = (key: string, path: string): [string, string, string] => {
    let value: unknown;
    try {
      value = JSON.parse(key);
    } catch {
      fail(path);
    }
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      value.some((part) => typeof part !== "string" || !part)
    )
      fail(path);
    const [scope, id] = value as string[];
    if (scope === "nation") nation(id, path);
    else if (scope === "settlement") {
      if (!Object.hasOwn(world.settlements, id)) fail(path);
    } else if (scope !== "world" || id !== "world") fail(path);
    return value as [string, string, string];
  };
  for (const [key, rawCount] of Object.entries(
    object(state.occurrences, "occurrences"),
  )) {
    const [, , id] = tuple(key, "occurrences.key");
    if (!eventIds.has(id)) fail("occurrences.eventId");
    const count = object(rawCount, "occurrences.value");
    integer(count.count, "occurrences.count", 1);
    integer(count.lastAt, "occurrences.lastAt", -Infinity, now);
  }
  for (const [key, until] of Object.entries(
    object(state.groupCooldowns, "groupCooldowns"),
  )) {
    const [, , id] = tuple(key, "groupCooldowns.key");
    if (!groupIds.has(id)) fail("groupCooldowns.group");
    integer(until, "groupCooldowns.until");
  }
  for (const [key, value] of Object.entries(object(state.flags, "flags"))) {
    const [scope] = tuple(key, "flags.key");
    if (scope === "world" || typeof value !== "boolean") fail("flags.value");
  }
  const checked = new Set<string>();
  for (const rawKey of list(state.checkedDates, "checkedDates")) {
    const key = text(rawKey, "checkedDates.key");
    let value: unknown;
    try {
      value = JSON.parse(key);
    } catch {
      fail("checkedDates.key");
    }
    if (!Array.isArray(value) || value.length !== 3 || !eventIds.has(value[0]))
      fail("checkedDates.key");
    nation((value as unknown[])[1], "checkedDates.nationId");
    integer((value as unknown[])[2], "checkedDates.date", -Infinity, now);
    if (checked.has(key)) fail("checkedDates.duplicate");
    checked.add(key);
  }
  for (const rawFact of list(state.facts, "facts")) {
    const fact = context(rawFact, "facts.context");
    if (
      ![
        "research_completed",
        "construction_completed",
        "battle_resolved",
        "settlement_captured",
        "diplomacy_completed",
      ].includes(String(fact.type))
    )
      fail("facts.type");
    for (const key of ["subjectId", "outcome"])
      if (fact[key] !== undefined) text(fact[key], `facts.${key}`);
  }
}
