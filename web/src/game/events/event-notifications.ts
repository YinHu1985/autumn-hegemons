import type { Content } from "../../definitions/types";
import type { ActiveEvent } from "../../simulation/events/state";
import type { WorldState } from "../../simulation/state";

export interface PendingReport {
  event: ActiveEvent;
  important: boolean;
}
export interface EventNotificationState {
  selectedId: string | null;
  announcedIds: readonly string[];
}
export const initialEventNotifications: EventNotificationState = {
  selectedId: null,
  announcedIds: [],
};

/** Missing definitions and another nation's reports must never reach this UI. */
export function pendingReports(
  content: Content,
  world: WorldState,
): PendingReport[] {
  return world.civic.events.flatMap((event) => {
    if (event.nationId !== world.playerNationId) return [];
    const definition = content.events.find(
      (item) => item.id === event.definitionId,
    );
    return definition
      ? [{ event, important: !!definition.presentation?.important }]
      : [];
  });
}

export type EventNotificationAction =
  | { type: "sync"; pending: PendingReport[]; blocked: boolean }
  | { type: "open"; pending: PendingReport[]; id?: string }
  | { type: "close"; pending: PendingReport[] }
  | { type: "step"; pending: PendingReport[]; direction: -1 | 1 }
  | {
      type: "resolved";
      pending: PendingReport[];
      nextPending: PendingReport[];
    };

function select(
  state: EventNotificationState,
  report?: PendingReport,
  announced = report ? [report.event.id] : [],
): EventNotificationState {
  const selectedId = report?.event.id ?? null;
  const added = announced.filter((id) => !state.announcedIds.includes(id));
  if (selectedId === state.selectedId && !added.length) return state;
  return { selectedId, announcedIds: [...state.announcedIds, ...added] };
}

/** Transient presentation only: closing never mutates or resolves a game event. */
export function eventNotificationReducer(
  state: EventNotificationState,
  action: EventNotificationAction,
): EventNotificationState {
  const { pending } = action;
  const selected = pending.find((entry) => entry.event.id === state.selectedId);
  const importantIds = pending
    .filter((entry) => entry.important)
    .map((entry) => entry.event.id);
  switch (action.type) {
    case "sync": {
      if (selected) return state;
      if (action.blocked) return select(state);
      const next = pending.find(
        (entry) =>
          entry.important && !state.announcedIds.includes(entry.event.id),
      );
      // One notification announces the current batch; its counter exposes the rest.
      return select(state, next, next ? importantIds : []);
    }
    case "open": {
      const report = action.id
        ? pending.find((entry) => entry.event.id === action.id)
        : (selected ?? pending.find((entry) => entry.important) ?? pending[0]);
      return report ? select(state, report) : state;
    }
    case "close":
      // Deferring this batch must actually close it, not reopen a sibling report.
      return select(state, undefined, importantIds);
    case "step": {
      if (!pending.length) return select(state);
      const index = pending.findIndex(
        (entry) => entry.event.id === state.selectedId,
      );
      const next =
        (Math.max(0, index) + action.direction + pending.length) %
        pending.length;
      return select(state, pending[next]);
    }
    case "resolved": {
      const index = pending.findIndex(
        (entry) => entry.event.id === state.selectedId,
      );
      const remainingIds = new Set(
        action.nextPending.map((entry) => entry.event.id),
      );
      const ordered = [
        ...pending.slice(index + 1),
        ...pending.slice(0, index + 1),
      ];
      const next =
        ordered.find((entry) => remainingIds.has(entry.event.id)) ??
        action.nextPending[0];
      return select(state, next);
    }
  }
}
