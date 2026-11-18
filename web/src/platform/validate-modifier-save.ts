import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { gameDay } from "../simulation/modifier-clock";

/** Restore instances as state, never by replaying their original action. */
export function validateSavedModifiers(
  raw: unknown,
  content: Content,
  world: WorldState,
): void {
  const invalid = (field = ""): never => {
    throw new Error(`存档字段无效：modifiers${field}`);
  };
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    return value as Record<string, unknown>;
  };
  const text = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;
  const integer = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value);
  const state = object(raw);
  if (
    !Array.isArray(state.instances) ||
    !integer(state.nextId) ||
    state.nextId < 1
  )
    invalid();
  const nextId = state.nextId as number;
  const ids = new Set<string>();
  const targets = new Set<string>();
  const sources = [
    "technology",
    "idea",
    "event",
    "advisor",
    "building",
    "policy",
    "system",
  ];
  for (const rawInstance of state.instances as unknown[]) {
    const instance = object(rawInstance);
    const { id, definitionId, startedAt, expiresAt } = instance;
    const suffix =
      typeof id === "string"
        ? /^modifier-([1-9]\d*)$/.exec(id)?.[1]
        : undefined;
    const serial = Number(suffix);
    if (
      !suffix ||
      !Number.isSafeInteger(serial) ||
      serial >= nextId ||
      ids.has(id as string)
    )
      invalid(".id");
    ids.add(id as string);
    const definition = content.modifierDefinitions.find(
      (item) => item.id === definitionId,
    );
    if (!definition) invalid(".definitionId");
    const target = object(instance.target);
    if (
      target.kind !== definition!.scope ||
      !text(target.id) ||
      !(target.kind === "nation"
        ? world.nations[target.id as string]
        : world.settlements[target.id as string])
    )
      invalid(".target");
    if (
      !integer(startedAt) ||
      !integer(expiresAt) ||
      (expiresAt as number) <= (startedAt as number) ||
      (startedAt as number) > gameDay(world.date)
    )
      invalid(".expiresAt");
    const identity = JSON.stringify([definitionId, target.kind, target.id]);
    if (
      definition!.stacking !== "stack" &&
      (expiresAt as number) > gameDay(world.date)
    ) {
      if (targets.has(identity)) invalid(".duplicateTarget");
      targets.add(identity);
    }
    const source = object(instance.source);
    if (
      !sources.includes(source.kind as string) ||
      !text(source.id) ||
      !text(source.name) ||
      (source.instanceId !== undefined && !text(source.instanceId))
    )
      invalid(".source");
    if (
      instance.showInAdministration !== undefined &&
      typeof instance.showInAdministration !== "boolean"
    )
      invalid(".showInAdministration");
  }
}
