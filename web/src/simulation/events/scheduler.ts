import type { Content } from "../../definitions/types";
import { evaluateCondition } from "../conditions";
import { gameDay } from "../modifier-clock";
import type { WorldState } from "../state";
import { cancelEvent, resolveEventTimeout } from "./commands";
import {
  boundContextReasons,
  boundEventContext,
  nationExists,
} from "./context";
import { createEventInstance, occurrenceReasons } from "./triggers";

export function tickEventsDay(content: Content, world: WorldState): void {
  const now = gameDay(world.date);
  for (const event of [...world.civic.events]) {
    const invalid = boundContextReasons(world, event.context);
    if (invalid.length) cancelEvent(content, world, event, invalid.join("；"));
    else if (event.expiresAt <= now)
      resolveEventTimeout(content, world, event.id);
  }
  for (const scheduled of [...world.civic.scheduled]) {
    if (scheduled.dueAt > now) continue;
    const definition = content.events.find(
      (entry) => entry.id === scheduled.definitionId,
    );
    if (!definition) {
      cancelEvent(content, world, scheduled, "后续事件定义不存在");
      continue;
    }
    scheduled.context = boundEventContext(definition, scheduled.context);
    const invalid = boundContextReasons(world, scheduled.context);
    if (invalid.length) {
      cancelEvent(content, world, scheduled, invalid.join("；"));
      continue;
    }
    const created = createEventInstance(
      content,
      world,
      scheduled.definitionId,
      scheduled.context,
      true,
    );
    if (created) {
      world.civic.scheduled = world.civic.scheduled.filter(
        (entry) => entry.id !== scheduled.id,
      );
      continue;
    }
    if (
      scheduled.retryDays &&
      scheduled.retryUntil !== undefined &&
      now < scheduled.retryUntil
    ) {
      const stored = world.civic.scheduled.find(
        (entry) => entry.id === scheduled.id,
      );
      if (stored)
        stored.dueAt = Math.min(
          scheduled.retryUntil,
          now + scheduled.retryDays,
        );
      continue;
    }
    const reasons = [
      ...evaluateCondition(
        content,
        world,
        scheduled.context,
        definition.condition,
      ).reasons,
      ...evaluateCondition(
        content,
        world,
        scheduled.context,
        definition.target?.condition,
      ).reasons,
      ...occurrenceReasons(world, definition, scheduled.context),
    ];
    cancelEvent(
      content,
      world,
      scheduled,
      reasons.join("；") || "后续事件绑定对象或触发条件不再满足",
    );
  }
  const start = gameDay(content.scenario.start);
  for (const definition of content.events) {
    for (const trigger of definition.triggers) {
      if (trigger.type !== "date") continue;
      const dueAt = gameDay(trigger.date);
      if (dueAt < start || dueAt > now) continue;
      for (const nationId of Object.keys(world.nations)) {
        const key = JSON.stringify([definition.id, nationId, dueAt]);
        if (world.civic.checkedDates.includes(key)) continue;
        world.civic.checkedDates.push(key);
        if (!nationExists(world, nationId)) continue;
        if (!createEventInstance(content, world, definition.id, { nationId })) {
          cancelEvent(
            content,
            world,
            {
              id: `date-${world.civic.nextEventId++}`,
              definitionId: definition.id,
              context: { nationId },
            },
            "预定日期已到，但触发条件、对象或冷却不满足",
          );
        }
      }
    }
  }
}
