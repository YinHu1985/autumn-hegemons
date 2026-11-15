import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";

/** Validate pair completeness and envoy ownership together, beyond field-level checks. */
export function validateSavedDiplomacy(
  raw: unknown,
  content: Content,
  world: WorldState,
): void {
  const invalid = (field = ""): never => {
    throw new Error(`存档字段无效：diplomacy${field}`);
  };
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    return value as Record<string, unknown>;
  };
  const integer = (
    value: unknown,
    min: number,
    max = Number.MAX_SAFE_INTEGER,
  ) =>
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max;
  const d = record(raw);
  if (
    !Array.isArray(d.relations) ||
    !Array.isArray(d.missions) ||
    !integer(d.nextId, 1)
  )
    invalid();
  const nationIds = new Set(
    content.scenario.nations.map((nation) => nation.id),
  );
  const pairs = new Set<string>();
  for (const item of d.relations as unknown[]) {
    const relation = record(item);
    const ids = relation.nations;
    if (
      !Array.isArray(ids) ||
      ids.length !== 2 ||
      ids[0] === ids[1] ||
      ids.some((id) => typeof id !== "string" || !nationIds.has(id)) ||
      !integer(
        relation.value,
        content.diplomacy.minRelation,
        content.diplomacy.maxRelation,
      )
    )
      invalid(".relations");
    const key = JSON.stringify([...(ids as string[])].sort());
    if (pairs.has(key)) invalid(".relations");
    pairs.add(key);
  }
  if (pairs.size !== (nationIds.size * (nationIds.size - 1)) / 2)
    invalid(".relations");
  const ids = new Set<string>(),
    envoys = new Set<string>(),
    targets = new Set<string>();
  for (const item of d.missions as unknown[]) {
    const mission = record(item);
    const {
      id,
      nationId,
      targetNationId,
      envoyId,
      actionId,
      totalDays,
      remainingDays,
    } = mission;
    const suffix =
      typeof id === "string"
        ? /^diplomacy-([1-9]\d*)$/.exec(id)?.[1]
        : undefined;
    if (
      !suffix ||
      !integer(Number(suffix), 1, (d.nextId as number) - 1) ||
      ids.has(id as string) ||
      typeof nationId !== "string" ||
      !nationIds.has(nationId) ||
      typeof targetNationId !== "string" ||
      !nationIds.has(targetNationId) ||
      nationId === targetNationId ||
      typeof envoyId !== "string" ||
      envoys.has(envoyId) ||
      !content.diplomacy.actions.some((action) => action.id === actionId) ||
      !integer(totalDays, 1) ||
      !integer(remainingDays, 1, totalDays as number)
    )
      invalid(".missions");
    const envoy = world.research.talents[envoyId as string];
    if (
      !envoy ||
      envoy.nationId !== nationId ||
      envoy.role !== "envoy" ||
      envoy.recruitedMonth === null ||
      !envoy.busy
    )
      invalid(".missions.envoyId");
    const targetKey = JSON.stringify([nationId, targetNationId]);
    if (targets.has(targetKey)) invalid(".missions");
    targets.add(targetKey);
    envoys.add(envoyId as string);
    ids.add(id as string);
  }
  for (const talent of Object.values(world.research.talents))
    if (talent.role === "envoy" && talent.busy && !envoys.has(talent.id))
      invalid(".missions.envoyId");
}
