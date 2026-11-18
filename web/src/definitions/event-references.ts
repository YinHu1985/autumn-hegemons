import type { Condition } from "./conditions";
import {
  validateActionReferences,
  validateTargetReference,
  type EffectReferenceContext,
} from "./effect-references";
import type { Content } from "./types";

export function validateEventReferences(content: Content): void {
  const exists = (
    entries: { id: string }[],
    id: string,
    path: string,
    kind: string,
  ) => {
    if (!entries.some((entry) => entry.id === id))
      throw new Error(`${path} 引用未知${kind} ${id}`);
  };
  function condition(
    value: Condition | undefined,
    path: string,
    context: EffectReferenceContext,
  ): void {
    if (!value) return;
    if ("all" in value || "any" in value) {
      const key = "all" in value ? "all" : "any";
      const children = "all" in value ? value.all : value.any;
      children.forEach((child, index) =>
        condition(child, `${path}.${key}[${index}]`, context),
      );
      return;
    }
    if ("not" in value) return condition(value.not, `${path}.not`, context);
    switch (value.type) {
      case "technology":
        exists(content.technologies, value.technologyId, path, "科技");
        break;
      case "idea_unlocked":
      case "idea_enacted":
        exists(content.ideas, value.ideaId, path, "理念");
        break;
      case "building":
        exists(content.buildings, value.buildingId, path, "建筑");
        break;
      case "terrain":
        exists(content.terrains, value.terrainId, path, "地形");
        break;
      case "specialty":
        exists(content.specialties, value.specialtyId, path, "特产");
        break;
      case "relation":
        if (value.nationId)
          exists(content.scenario.nations, value.nationId, path, "国家");
        else if (!context.relatedNation)
          throw new Error(`${path} 关系条件需要明确国家或绑定相关国家`);
        break;
      case "event_count":
        exists(content.events, value.eventId, path, "事件");
        break;
      case "flag":
        validateTargetReference(
          content,
          value.target,
          `${path}.target`,
          context,
        );
        break;
      case "modifier": {
        const definition = content.modifierDefinitions.find(
          (entry) => entry.id === value.modifierId,
        );
        if (!definition)
          throw new Error(`${path} 引用未知 modifier ${value.modifierId}`);
        if (value.target && value.target.kind !== definition.scope)
          throw new Error(`${path} 目标与 modifier 作用域不符`);
        validateTargetReference(
          content,
          value.target ?? { kind: definition.scope },
          `${path}.target`,
          context,
        );
        break;
      }
    }
  }
  for (const event of content.events) {
    const context: EffectReferenceContext = {
      settlement: event.target?.kind === "settlement",
      relatedNation: event.target?.kind === "related_nation",
      talent: event.target?.kind === "talent",
    };
    for (const trigger of event.triggers) {
      if (trigger.type === "random")
        exists(content.eventPools, trigger.poolId, event.id, "事件池");
      if (trigger.type === "fact" && trigger.subjectId) {
        if (trigger.fact === "research_completed")
          exists(content.technologies, trigger.subjectId, event.id, "科技");
        if (
          trigger.fact === "construction_completed" &&
          trigger.subjectId !== "__expand"
        )
          exists(content.buildings, trigger.subjectId, event.id, "建筑");
        if (trigger.fact === "settlement_captured")
          exists(
            content.scenario.settlements,
            trigger.subjectId,
            event.id,
            "城镇",
          );
        if (
          trigger.fact === "diplomacy_completed" &&
          !content.diplomacy.actions.some(
            (action) => action.id === trigger.subjectId,
          )
        )
          throw new Error(`${event.id} 引用未知外交行动 ${trigger.subjectId}`);
      }
    }
    condition(event.condition, `${event.id}.condition`, context);
    condition(event.target?.condition, `${event.id}.target.condition`, context);
    event.weightModifiers?.forEach((modifier, index) =>
      condition(
        modifier.condition,
        `${event.id}.weightModifiers[${index}].condition`,
        context,
      ),
    );
    event.options.forEach((option, index) => {
      const path = `${event.id}.options[${index}]`;
      condition(option.condition, `${path}.condition`, context);
      validateActionReferences(
        content,
        option.effects,
        `${path}.effects`,
        context,
      );
      option.outcomes?.forEach((outcome, i) =>
        validateActionReferences(
          content,
          outcome.effects,
          `${path}.outcomes[${i}].effects`,
          context,
        ),
      );
    });
  }
}
