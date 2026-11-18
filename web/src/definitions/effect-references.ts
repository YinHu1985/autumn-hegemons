import type { EffectAction, EffectTarget } from "./effects";
import type { ModifierTerms } from "./modifier-values";
import type { Content } from "./types";

export interface EffectReferenceContext {
  settlement?: boolean;
  relatedNation?: boolean;
  talent?: boolean;
}
export function validateTargetReference(
  content: Content,
  target: EffectTarget | undefined,
  path: string,
  context: EffectReferenceContext,
): void {
  if (!target) return;
  if (target.id) {
    const entries =
      target.kind === "nation"
        ? content.scenario.nations
        : content.scenario.settlements;
    if (!entries.some((entry) => entry.id === target.id))
      throw new Error(`${path} 引用未知目标 ${target.id}`);
  } else if (target.kind === "settlement" && !context.settlement)
    throw new Error(`${path} 城镇目标需要明确目标城镇或事件绑定城镇`);
}

/** Actions are shared by research, ideas and events; only the available context differs. */
export function validateActionReferences(
  content: Content,
  values: readonly EffectAction[],
  path: string,
  context: EffectReferenceContext = {},
): void {
  values.forEach((action, index) => {
    const at = `${path}[${index}]`;
    if (
      action.type === "unlock_idea" &&
      !content.ideas.some((entry) => entry.id === action.ideaId)
    )
      throw new Error(`${at} 引用未知理念 ${action.ideaId}`);
    if (
      action.type === "research" &&
      action.targetId &&
      !content.technologies.some((entry) => entry.id === action.targetId)
    )
      throw new Error(`${at} 引用未知研究课题 ${action.targetId}`);
    if (action.type === "set_flag")
      validateTargetReference(content, action.target, `${at}.target`, context);
    if (action.type === "relation") {
      if (
        action.nationId &&
        !content.scenario.nations.some((entry) => entry.id === action.nationId)
      )
        throw new Error(`${at} 引用未知国家 ${action.nationId}`);
      if (!action.nationId && !context.relatedNation)
        throw new Error(`${at} 外交关系动作需要明确国家或绑定相关国家`);
    }
    if (action.type === "schedule_event") {
      const next = content.events.find((entry) => entry.id === action.eventId);
      if (!next) throw new Error(`${at} 引用未知后续事件 ${action.eventId}`);
      const kind = next.target?.kind;
      if (
        (kind === "settlement" && !context.settlement) ||
        (kind === "related_nation" && !context.relatedNation) ||
        (kind === "talent" && !context.talent)
      )
        throw new Error(
          `${at} 后续事件 ${action.eventId} 需要继承已绑定对象，不能重新抽取`,
        );
    }
    if (action.type !== "add_modifier" && action.type !== "remove_modifier")
      return;
    const definition = content.modifierDefinitions.find(
      (entry) => entry.id === action.modifierId,
    );
    if (!definition)
      throw new Error(`${at} 引用未知 modifier ${action.modifierId}`);
    if (action.target && action.target.kind !== definition.scope)
      throw new Error(`${at} 目标与 modifier 作用域不符`);
    validateTargetReference(
      content,
      action.target ?? { kind: definition.scope },
      `${at}.target`,
      context,
    );
  });
}

/** Syntax is checked by individual readers; cross-file references are checked once the pack is assembled. */
export function validateEffectReferences(content: Content): void {
  const routes = new Set(
    content.buildings.map((entry) => entry.route).filter(Boolean),
  );
  function terms(values: ModifierTerms, path: string): void {
    for (const key of Object.keys(values))
      if (key.startsWith("production.") && !routes.has(key.slice(11)))
        throw new Error(`${path} 引用了不存在的生产路线 ${key.slice(11)}`);
  }
  for (const technology of content.technologies) {
    terms(technology.effects, `${technology.id}.effects`);
    validateActionReferences(
      content,
      technology.completionEffects ?? [],
      `${technology.id}.completionEffects`,
    );
  }
  for (const idea of content.ideas) {
    terms(idea.effects, `${idea.id}.effects`);
    validateActionReferences(
      content,
      idea.enactEffects ?? [],
      `${idea.id}.enactEffects`,
    );
    validateActionReferences(
      content,
      idea.repealEffects ?? [],
      `${idea.id}.repealEffects`,
    );
  }
  for (const definition of content.modifierDefinitions)
    terms(definition.effects, `${definition.id}.effects`);
  for (const building of content.buildings)
    building.levels.forEach((level, index) =>
      terms(level.modifiers ?? {}, `${building.id}.levels[${index}].modifiers`),
    );
}
