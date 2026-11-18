import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import {
  eventNotificationReducer,
  initialEventNotifications,
  pendingReports,
} from "./event-notifications";

/** Event presentation stays independent of the currently open government page. */
export function useEventNotifications(
  content: Content,
  world: WorldState,
  blocked: boolean,
  onWorld: (world: WorldState) => void,
) {
  const [state, dispatch] = useReducer(
    eventNotificationReducer,
    initialEventNotifications,
  );
  const pending = useMemo(
    () => pendingReports(content, world),
    [content, world.civic.events, world.playerNationId],
  );
  const selected = pending.find((entry) => entry.event.id === state.selectedId);
  useEffect(() => {
    dispatch({ type: "sync", pending, blocked });
  }, [pending, blocked, state.selectedId]);
  const open = useCallback(
    (id?: string) => {
      if (!blocked) dispatch({ type: "open", pending, id });
    },
    [pending, blocked],
  );
  const close = useCallback(
    () => dispatch({ type: "close", pending }),
    [pending],
  );
  const step = useCallback(
    (direction: -1 | 1) => {
      dispatch({ type: "step", pending, direction });
    },
    [pending],
  );
  const resolve = useCallback(
    (next: WorldState) => {
      onWorld(next);
      dispatch({
        type: "resolved",
        pending,
        nextPending: pendingReports(content, next),
      });
    },
    [content, pending, onWorld],
  );
  return {
    event: selected?.event,
    visible: !!selected && !blocked,
    count: pending.length,
    index: pending.findIndex((entry) => entry.event.id === state.selectedId),
    open,
    close,
    step,
    resolve,
  };
}
