import type { EventDefinition, EventOption } from "../../definitions/events";
import type { Content } from "../../definitions/types";
import { evaluateCondition } from "../conditions";
import type { EffectResult } from "../effect-results";
import { applyEffects } from "../effects";
import { gameDay } from "../modifier-clock";
import { evaluateExpression } from "../modifier-expression";
import { copyWorld, type WorldState } from "../state";
import {
  boundContextReasons,
  renderEventText,
  requiredTargetReasons,
} from "./context";
import { pickWeighted } from "./random";
import {
  recordEventHistory,
  type ActiveEvent,
  type EventContext,
} from "./state";

export interface EventOptionStatus {
  available: boolean;
  reasons: string[];
  cost: { grain: number; manpower: number };
}
export function getEventOptionStatus(
  content: Content,
  world: WorldState,
  event: ActiveEvent,
  option: EventOption,
): EventOptionStatus {
  const reasons = boundContextReasons(world, event.context);
  const definition = content.events.find(
    (entry) => entry.id === event.definitionId,
  );
  if (!definition) reasons.push("事件定义不存在");
  else {
    reasons.push(...requiredTargetReasons(definition, event.context));
    if (event.context.settlementId && definition.target?.kind !== "settlement")
      reasons.push("此事件未声明城镇目标");
    if (
      event.context.relatedNationId &&
      definition.target?.kind !== "related_nation"
    )
      reasons.push("此事件未声明外交目标");
    if (event.context.talentId && definition.target?.kind !== "talent")
      reasons.push("此事件未声明人才目标");
  }
  if (event.nationId !== event.context.nationId)
    reasons.push("事件所属国家与绑定对象不一致");
  reasons.push(
    ...evaluateCondition(content, world, event.context, option.condition)
      .reasons,
  );
  const cost = { grain: 0, manpower: 0 };
  try {
    cost.grain = evaluateExpression(
      world,
      event.context,
      option.cost?.grain ?? 0,
    );
    cost.manpower = evaluateExpression(
      world,
      event.context,
      option.cost?.manpower ?? 0,
    );
    if (cost.grain < 0 || cost.manpower < 0)
      throw new Error("选项费用不可为负数");
    cost.manpower = Math.ceil(cost.manpower);
    const nation = world.nations[event.nationId];
    if (nation && cost.grain > nation.treasury)
      reasons.push(
        `粮食不足：需要 ${cost.grain}，现有 ${Math.floor(nation.treasury)}`,
      );
    if (nation && cost.manpower > nation.manpower)
      reasons.push(
        `人力不足：需要 ${cost.manpower}，现有 ${Math.floor(nation.manpower)}`,
      );
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }
  return { available: reasons.length === 0, reasons, cost };
}
function chronicle(world: WorldState, nationId: string, text: string): void {
  world.civic.log.unshift({ date: { ...world.date }, nationId, text });
  world.civic.log = world.civic.log.slice(0, 160);
}
/** Cancellation is an explicit, persisted outcome; the bound object is never rerolled. */
export function cancelEvent(
  content: Content,
  world: WorldState,
  event: { id: string; definitionId: string; context: EventContext },
  reason: string,
): void {
  const definition = content.events.find(
    (entry) => entry.id === event.definitionId,
  );
  const title = renderEventText(
    content,
    world,
    event,
    definition?.title ?? event.definitionId,
  );
  world.civic.events = world.civic.events.filter(
    (entry) => entry.id !== event.id,
  );
  world.civic.scheduled = world.civic.scheduled.filter(
    (entry) => entry.id !== event.id,
  );
  recordEventHistory(world, {
    id: event.id,
    definitionId: event.definitionId,
    nationId: event.context.nationId,
    context: { ...event.context },
    at: gameDay(world.date),
    status: "cancelled",
    title,
    reason,
    results: [],
  });
  chronicle(world, event.context.nationId, `${title}：已取消（${reason}）`);
}
function applyDecision(
  content: Content,
  world: WorldState,
  event: ActiveEvent,
  definition: EventDefinition,
  option: EventOption,
): void {
  const status = getEventOptionStatus(content, world, event, option);
  if (!status.available) throw new Error(status.reasons.join("；"));
  const nation = world.nations[event.nationId];
  const results: EffectResult[] = [];
  for (const key of ["grain", "manpower"] as const) {
    if (!status.cost[key]) continue;
    const before = key === "grain" ? nation.treasury : nation.manpower;
    const after = before - status.cost[key];
    if (key === "grain") nation.treasury = after;
    else nation.manpower = after;
    results.push({
      type: `cost_${key}`,
      description: `支付${key === "grain" ? "粮食" : "人力"} ${status.cost[key]}`,
      before,
      after,
      targetId: nation.id,
    });
  }
  const outcomes = option.outcomes ?? [];
  const outcome = pickWeighted(
    world,
    outcomes.map((entry) => ({ value: entry, weight: entry.weight })),
  );
  world.civic.events = world.civic.events.filter(
    (entry) => entry.id !== event.id,
  );
  results.push(
    ...applyEffects(
      content,
      world,
      {
        ...event.context,
        source: {
          kind: "event",
          id: definition.id,
          name: renderEventText(content, world, event, definition.title),
          instanceId: event.id,
        },
      },
      [...option.effects, ...(outcome?.effects ?? [])],
    ),
  );
  const title = renderEventText(content, world, event, definition.title);
  const label = renderEventText(content, world, event, option.label);
  recordEventHistory(world, {
    id: event.id,
    definitionId: definition.id,
    nationId: event.nationId,
    context: { ...event.context },
    at: gameDay(world.date),
    status: "resolved",
    title,
    optionId: option.id,
    optionLabel: label,
    ...(outcome && { outcomeId: outcome.id }),
    results,
  });
  chronicle(world, event.nationId, `${title}：${label}`);
}
/** All spending, RNG, effects and pending removal commit together or not at all. */
export function chooseEvent(
  content: Content,
  world: WorldState,
  eventId: string,
  optionId: string,
  actingNationId = world.playerNationId,
): WorldState {
  const next = copyWorld(world);
  const event = next.civic.events.find((entry) => entry.id === eventId);
  if (!event) throw new Error("事件已处理或过期");
  if (event.nationId !== actingNationId)
    throw new Error("不能处理其他国家的事件");
  if (gameDay(next.date) >= event.expiresAt)
    throw new Error("事件决策期限已到");
  const definition = content.events.find(
    (entry) => entry.id === event.definitionId,
  );
  const option = definition?.options.find((entry) => entry.id === optionId);
  if (!definition || !option) throw new Error("事件选项不存在");
  applyDecision(content, next, event, definition, option);
  return next;
}
/** Timeout uses the authored first option, never an AI re-roll or hidden extra cost. */
export function resolveEventTimeout(
  content: Content,
  world: WorldState,
  eventId: string,
): void {
  const next = copyWorld(world);
  const event = next.civic.events.find((entry) => entry.id === eventId);
  if (!event) return;
  const definition = content.events.find(
    (entry) => entry.id === event.definitionId,
  );
  if (!definition) {
    cancelEvent(content, world, event, "事件定义不存在");
    return;
  }
  try {
    applyDecision(content, next, event, definition, definition.options[0]);
    Object.assign(world, next);
  } catch (error) {
    cancelEvent(
      content,
      world,
      event,
      `默认选项无法结算：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
export function resolveAIEvents(content: Content, world: WorldState): void {
  for (const pending of [...world.civic.events]) {
    if (pending.nationId === world.playerNationId) continue;
    const definition = content.events.find(
      (entry) => entry.id === pending.definitionId,
    );
    if (!definition) continue;
    const options = definition.options.filter(
      (option) =>
        getEventOptionStatus(content, world, pending, option).available &&
        (option.aiWeight ?? 1) > 0,
    );
    if (!options.length) continue;
    const next = copyWorld(world);
    const option = pickWeighted(
      next,
      options.map((entry) => ({ value: entry, weight: entry.aiWeight ?? 1 })),
    )!;
    try {
      Object.assign(
        world,
        chooseEvent(content, next, pending.id, option.id, pending.nationId),
      );
    } catch (error) {
      cancelEvent(
        content,
        world,
        pending,
        `事件无法结算：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
