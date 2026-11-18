import type { ModifierTerms } from "../definitions/modifier-values";
import { isExplicitModifierValue } from "../definitions/modifier-values";
import {
  modifierDefaultOperation,
  modifierDefinition,
} from "../definitions/modifiers";
import type { Content } from "../definitions/types";
import { gameDay } from "./modifier-clock";
import { evaluateExpression } from "./modifier-expression";
import type {
  ModifierContext,
  ModifierContribution,
  ModifierSource,
  ModifierTarget,
} from "./modifier-state";
import type { WorldState } from "./state";

export type { ModifierContext, ModifierContribution } from "./modifier-state";
export interface ActiveModifierView {
  id: string;
  name: string;
  description: string;
  icon?: string;
  source: ModifierSource;
  target: ModifierTarget;
  startedAt?: number;
  expiresAt?: number;
  contributions: ModifierContribution[];
}
export interface StatOptions {
  min?: number;
  max?: number;
  round?: "floor" | "ceil" | "round";
  additional?: readonly ModifierContribution[];
}
export interface StatResult {
  key: string;
  base: number;
  value: number;
  rawValue: number;
  clampedValue: number;
  flat: number;
  percent: number;
  multiplier: number;
  min?: number;
  max?: number;
  round?: StatOptions["round"];
  contributions: ModifierContribution[];
}

function appliesTo(
  target: ModifierTarget | undefined,
  context: ModifierContext,
): boolean {
  if (!target) return true;
  return target.kind === "nation"
    ? target.id === context.nationId
    : target.id === context.settlementId;
}

function evaluateTerms(
  world: WorldState,
  context: ModifierContext,
  terms: ModifierTerms,
  source: ModifierSource,
  target: ModifierTarget,
  metadata: Pick<
    ModifierContribution,
    "modifierId" | "modifierName" | "expiresAt"
  > = {},
  key?: string,
): ModifierContribution[] {
  return Object.entries(terms)
    .filter(([term]) => key === undefined || term === key)
    .map(([term, authored]) => {
      const explicit = isExplicitModifierValue(authored);
      return {
        key: term,
        operation: explicit
          ? authored.operation
          : modifierDefaultOperation(term),
        value: evaluateExpression(
          world,
          context,
          explicit ? authored.value : authored,
        ),
        source,
        target,
        ...metadata,
      };
    });
}

/** Stable sources are derived; they are never copied into the persisted instance list. */
function derivedViews(
  content: Content,
  world: WorldState,
  context: ModifierContext,
  administrationOnly: boolean,
  key?: string,
): ActiveModifierView[] {
  const research = world.research.nations[context.nationId];
  if (!research) return [];
  const target: ModifierTarget = { kind: "nation", id: context.nationId };
  const result: ActiveModifierView[] = [];
  for (const [kind, definitions, active] of [
    ["technology", content.technologies, research.unlocked],
    ["idea", content.ideas, research.enacted],
  ] as const) {
    for (const definition of definitions) {
      if (
        !active.includes(definition.id) ||
        (administrationOnly && !definition.showInAdministration) ||
        (key !== undefined && !Object.hasOwn(definition.effects, key))
      )
        continue;
      const source: ModifierSource = {
        kind,
        id: definition.id,
        name: definition.name,
      };
      result.push({
        id: `${kind}:${context.nationId}:${definition.id}`,
        name: definition.name,
        description: definition.description,
        icon: definition.image,
        source,
        target,
        contributions: evaluateTerms(
          world,
          context,
          definition.effects,
          source,
          target,
          {},
          key,
        ),
      });
    }
  }
  if (
    !administrationOnly &&
    (key === undefined ||
      ["income", "research_efficiency", "governance_cap"].includes(key))
  ) {
    const advisors = Object.values(world.research.talents).filter(
      (talent) =>
        talent.nationId === context.nationId &&
        talent.role === "advisor" &&
        talent.recruitedMonth !== null,
    );
    const penalty = advisors.length > 2 ? (2 / advisors.length) ** 2 : 1;
    for (const advisor of advisors) {
      const source: ModifierSource = {
        kind: "advisor",
        id: advisor.id,
        name: advisor.name,
      };
      result.push({
        id: `advisor:${advisor.id}`,
        name: advisor.name,
        description: "顾问内政加成，超出常规顾问数量会降低效能。",
        icon: advisor.portrait,
        source,
        target,
        contributions: evaluateTerms(
          world,
          context,
          {
            income: (advisor.administration / 1000) * penalty,
            research_efficiency: (advisor.scholarship / 1500) * penalty,
            governance_cap: (advisor.administration / 3000) * penalty,
          },
          source,
          target,
          {},
          key,
        ),
      });
    }
  }
  return result;
}

export function listActiveModifiers(
  content: Content,
  world: WorldState,
  context: ModifierContext,
  options: { administrationOnly?: boolean; includeSettlements?: boolean } = {},
  key?: string,
): ActiveModifierView[] {
  const result = derivedViews(
    content,
    world,
    context,
    !!options.administrationOnly,
    key,
  );
  const now = gameDay(world.date);
  for (const instance of world.modifiers.instances) {
    if (now < instance.startedAt || now >= instance.expiresAt) continue;
    const city =
      instance.target.kind === "settlement"
        ? world.settlements[instance.target.id]
        : undefined;
    const includeLocal =
      options.includeSettlements && city?.owner === context.nationId;
    if (!appliesTo(instance.target, context) && !includeLocal) continue;
    const definition = content.modifierDefinitions.find(
      (entry) => entry.id === instance.definitionId,
    );
    if (!definition) continue;
    if (key !== undefined && !Object.hasOwn(definition.effects, key)) continue;
    if (
      options.administrationOnly &&
      !(
        instance.showInAdministration ??
        definition.showInAdministration ??
        true
      )
    )
      continue;
    const localContext = city
      ? { nationId: city.owner, settlementId: city.id }
      : context;
    result.push({
      id: instance.id,
      name: definition.name,
      description: definition.description,
      icon: definition.icon,
      source: instance.source,
      target: instance.target,
      startedAt: instance.startedAt,
      expiresAt: instance.expiresAt,
      contributions: evaluateTerms(
        world,
        localContext,
        definition.effects,
        instance.source,
        instance.target,
        {
          modifierId: instance.id,
          modifierName: definition.name,
          expiresAt: instance.expiresAt,
        },
        key,
      ),
    });
  }
  return result;
}

/** One formula for every source. Display filtering never enters this calculation. */
export function resolveStat(
  content: Content,
  world: WorldState,
  context: ModifierContext,
  key: string,
  base: number,
  options: StatOptions = {},
): StatResult {
  if (!modifierDefinition(key)) throw new Error(`查询了未注册词条：${key}`);
  if (
    context.settlementId &&
    world.settlements[context.settlementId]?.owner !== context.nationId
  )
    throw new Error("数值查询的城镇不属于指定国家");
  const contributions = [
    ...listActiveModifiers(content, world, context, {}, key).flatMap(
      (view) => view.contributions,
    ),
    ...(options.additional ?? []).filter(
      (entry) => entry.key === key && appliesTo(entry.target, context),
    ),
  ];
  let flat = 0;
  let percent = 0;
  let multiplier = 1;
  for (const contribution of contributions) {
    if (contribution.operation === "add") flat += contribution.value;
    else if (contribution.operation === "add_percent")
      percent += contribution.value;
    else multiplier *= contribution.value;
  }
  const rawValue = (base + flat) * (1 + percent) * multiplier;
  if (!Number.isFinite(rawValue))
    throw new Error(`词条 ${key} 计算结果不是有限数字`);
  const clampedValue = Math.max(
    options.min ?? -Infinity,
    Math.min(options.max ?? Infinity, rawValue),
  );
  const value = options.round
    ? Math[options.round](clampedValue)
    : clampedValue;
  return {
    key,
    base,
    value,
    rawValue,
    clampedValue,
    flat,
    percent,
    multiplier,
    min: options.min,
    max: options.max,
    round: options.round,
    contributions,
  };
}
