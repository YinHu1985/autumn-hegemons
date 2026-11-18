import type { EffectTarget } from "../definitions/effects";
import type { Content } from "../definitions/types";
import { gameDay, PERMANENT_MODIFIER_EXPIRY } from "./modifier-clock";
import type {
  ModifierContext,
  ModifierInstance,
  ModifierSource,
  ModifierTarget,
} from "./modifier-state";
import type { WorldState } from "./state";

export interface EffectContext extends ModifierContext {
  source: ModifierSource;
  relatedNationId?: string;
  talentId?: string;
}

function resolveTarget(
  content: Content,
  world: WorldState,
  context: EffectContext,
  modifierId: string,
  target?: EffectTarget,
): ModifierTarget {
  const definition = content.modifierDefinitions.find(
    (item) => item.id === modifierId,
  );
  if (!definition) throw new Error(`持续效果不存在：${modifierId}`);
  const kind = target?.kind ?? definition.scope;
  const id =
    target?.id ?? (kind === "nation" ? context.nationId : context.settlementId);
  if (kind !== definition.scope)
    throw new Error(`持续效果 ${modifierId} 的目标类型不符`);
  if (!id || !(kind === "nation" ? world.nations[id] : world.settlements[id]))
    throw new Error(`持续效果 ${modifierId} 缺少有效目标`);
  return { kind, id };
}
function sameTarget(left: ModifierTarget, right: ModifierTarget): boolean {
  return left.kind === right.kind && left.id === right.id;
}

/** Mutates only the active state. Retaining the technology never reruns this action. */
export function addModifier(
  content: Content,
  world: WorldState,
  context: EffectContext,
  action: {
    modifierId: string;
    target?: EffectTarget;
    durationDays?: number;
    expiresAt?: number;
  },
): ModifierInstance | undefined {
  const target = resolveTarget(
    content,
    world,
    context,
    action.modifierId,
    action.target,
  );
  const definition = content.modifierDefinitions.find(
    (item) => item.id === action.modifierId,
  )!;
  const now = gameDay(world.date);
  const expiresAt =
    action.expiresAt ??
    (action.durationDays === undefined
      ? PERMANENT_MODIFIER_EXPIRY
      : now + action.durationDays);
  if (
    !Number.isSafeInteger(expiresAt) ||
    (action.durationDays !== undefined &&
      (!Number.isSafeInteger(action.durationDays) || action.durationDays <= 0))
  )
    throw new Error("持续效果期限必须为有效游戏日序");
  if (action.expiresAt !== undefined && action.durationDays !== undefined)
    throw new Error("持续效果不能同时指定到期日和持续天数");
  if (expiresAt <= now) return undefined;
  pruneExpiredModifiers(world);
  const matches = (item: ModifierInstance) =>
    item.definitionId === definition.id && sameTarget(item.target, target);
  if (definition.stacking === "replace")
    world.modifiers.instances = world.modifiers.instances.filter(
      (item) => !matches(item),
    );
  if (definition.stacking === "refresh") {
    const existing = world.modifiers.instances.find(matches);
    if (existing) {
      existing.startedAt = now;
      existing.expiresAt = expiresAt;
      existing.source = { ...context.source };
      return existing;
    }
  }
  const instance: ModifierInstance = {
    id: `modifier-${world.modifiers.nextId++}`,
    definitionId: definition.id,
    source: { ...context.source },
    target,
    startedAt: now,
    expiresAt,
  };
  world.modifiers.instances.push(instance);
  return instance;
}

export function removeModifier(
  content: Content,
  world: WorldState,
  context: EffectContext,
  action: { modifierId: string; target?: EffectTarget },
): void {
  const target = resolveTarget(
    content,
    world,
    context,
    action.modifierId,
    action.target,
  );
  world.modifiers.instances = world.modifiers.instances.filter(
    (item) =>
      !(
        item.definitionId === action.modifierId &&
        sameTarget(item.target, target)
      ),
  );
}
export function pruneExpiredModifiers(world: WorldState): void {
  const now = gameDay(world.date);
  world.modifiers.instances = world.modifiers.instances.filter(
    (instance) => instance.expiresAt > now,
  );
}
