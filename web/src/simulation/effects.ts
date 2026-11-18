import type { EffectAction } from "../definitions/effects";
import type { Content } from "../definitions/types";
import { manpowerCapacity } from "./civic";
import { unlockIdea } from "./ideas";
import { evaluateExpression } from "./modifier-expression";
import {
  addModifier,
  removeModifier,
  type EffectContext,
} from "./modifier-instances";
import { addResearchInspiration } from "./research";
import { changeRelation, relationValue } from "./diplomacy";
import { scheduleEvent, setEventFlag } from "./events/state";
import { boundEventContext } from "./events/context";
import { quantityResult, type EffectResult } from "./effect-results";
import type { WorldState } from "./state";

export type { EffectContext } from "./modifier-instances";
export type { EffectResult } from "./effect-results";

/** Explicit trigger entry. Reading stats and restoring saves never execute actions. */
export function applyEffects(
  content: Content,
  world: WorldState,
  context: EffectContext,
  actions: readonly EffectAction[],
): EffectResult[] {
  const nation = world.nations[context.nationId];
  if (!nation) throw new Error(`效果所属国家不存在：${context.nationId}`);
  const results: EffectResult[] = [];
  for (const action of actions) {
    switch (action.type) {
      case "add_modifier": {
        const instance = addModifier(content, world, context, action);
        const name = content.modifierDefinitions.find(
          (item) => item.id === action.modifierId,
        )!.name;
        results.push({
          type: action.type,
          description: instance ? `施加效果：${name}` : `效果期限已过：${name}`,
          ...(instance && { targetId: instance.target.id }),
        });
        break;
      }
      case "remove_modifier": {
        const before = world.modifiers.instances.length;
        removeModifier(content, world, context, action);
        const removed = before - world.modifiers.instances.length;
        const definition = content.modifierDefinitions.find(
          (item) => item.id === action.modifierId,
        )!;
        results.push({
          type: action.type,
          description: `移除效果：${definition.name}（${removed} 项）`,
          targetId:
            action.target?.id ??
            (definition.scope === "settlement"
              ? context.settlementId
              : context.nationId),
        });
        break;
      }
      case "unlock_idea": {
        const had = world.research.nations[nation.id].unlockedIdeas.includes(
          action.ideaId,
        );
        unlockIdea(content, world, nation.id, action.ideaId);
        const name = content.ideas.find(
          (idea) => idea.id === action.ideaId,
        )!.name;
        results.push({
          type: action.type,
          description: `${had ? "已解锁" : "解锁理念"}：${name}`,
          targetId: action.ideaId,
        });
        break;
      }
      case "grain": {
        const amount = evaluateExpression(world, context, action.amount);
        const before = nation.treasury;
        nation.treasury = Math.max(0, nation.treasury + amount);
        results.push(
          quantityResult(
            action.type,
            "国库粮食",
            before,
            nation.treasury,
            nation.id,
          ),
        );
        break;
      }
      case "manpower": {
        const amount = evaluateExpression(world, context, action.amount);
        const before = nation.manpower;
        nation.manpower = Math.max(
          0,
          Math.min(
            manpowerCapacity(content, world, nation.id),
            nation.manpower + amount,
          ),
        );
        results.push(
          quantityResult(
            action.type,
            "人力",
            before,
            nation.manpower,
            nation.id,
          ),
        );
        break;
      }
      case "governance": {
        const amount = evaluateExpression(world, context, action.amount);
        const cities = Object.values(world.settlements).filter(
          (city) =>
            city.owner === nation.id &&
            (!context.settlementId || city.id === context.settlementId),
        );
        const before = manpowerCapacity(content, world, nation.id);
        for (const city of cities) {
          const old = city.governance;
          city.governance = Math.max(
            0.05,
            Math.min(1, city.governance + amount),
          );
          const name =
            content.scenario.settlements.find((item) => item.id === city.id)
              ?.name ?? city.id;
          results.push(
            quantityResult(
              action.type,
              `${name}治理效率`,
              old,
              city.governance,
              city.id,
              true,
            ),
          );
        }
        const after = manpowerCapacity(content, world, nation.id);
        if (after < before)
          nation.manpower = before
            ? Math.floor((nation.manpower * after) / before)
            : 0;
        break;
      }
      case "research": {
        const amount = evaluateExpression(world, context, action.amount);
        const targets = action.targetId
          ? [action.targetId]
          : world.research.nations[nation.id].groups.map(
              (group) => group.targetId,
            );
        for (const targetId of new Set(targets)) {
          const before =
            world.research.nations[nation.id].bonuses[targetId] ?? 0;
          addResearchInspiration(content, world, nation.id, targetId, amount);
          const after =
            world.research.nations[nation.id].bonuses[targetId] ?? 0;
          const name =
            content.technologies.find((item) => item.id === targetId)?.name ??
            targetId;
          results.push(
            quantityResult(
              action.type,
              `${name}研究启发`,
              before,
              after,
              targetId,
            ),
          );
        }
        if (!targets.length)
          results.push({
            type: action.type,
            description: "没有进行中的课题，未增加研究启发",
          });
        break;
      }
      case "relation": {
        const other = action.nationId ?? context.relatedNationId;
        if (!other) throw new Error("外交效果缺少相关国家");
        const before = relationValue(content, world, nation.id, other);
        const after = changeRelation(
          content,
          world,
          nation.id,
          other,
          Math.round(evaluateExpression(world, context, action.amount)),
        );
        const name =
          content.scenario.nations.find((item) => item.id === other)?.name ??
          other;
        results.push(
          quantityResult(action.type, `与${name}关系`, before, after, other),
        );
        break;
      }
      case "set_flag": {
        setEventFlag(
          world,
          context,
          action.flagId,
          action.value,
          action.target,
        );
        results.push({
          type: action.type,
          description: action.value
            ? "已记下此事，供后续奏报参照"
            : "此事已了结",
        });
        break;
      }
      case "schedule_event": {
        const event = content.events.find((item) => item.id === action.eventId);
        if (!event) throw new Error(`后续事件不存在：${action.eventId}`);
        scheduleEvent(
          world,
          boundEventContext(event, context),
          action.eventId,
          action.delayDays,
          action.retryDays,
          action.retryUntilDays,
        );
        results.push({
          type: action.type,
          description: `${action.delayDays} 日后跟进：${event.title}`,
        });
        break;
      }
      default: {
        const exhaustive: never = action;
        throw new Error(`未支持的效果动作：${String(exhaustive)}`);
      }
    }
  }
  return results;
}
