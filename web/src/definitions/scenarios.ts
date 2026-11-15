import type { Content, Scenario } from "./types";

export interface ScenarioCatalogue {
  version: 1;
  defaultScenario: string;
  entries: { id: string; file: string }[];
}

/** A catalogue selects start conditions; economies and rules stay in the content pack. */
export function parseScenarioCatalogue(value: unknown): ScenarioCatalogue {
  const data = value as Partial<ScenarioCatalogue> | null;
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.entries) ||
    !data.entries.length
  )
    throw new Error("剧本目录格式无效");
  const ids = new Set<string>();
  for (const entry of data.entries) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !entry.id.trim() ||
      ids.has(entry.id) ||
      typeof entry.file !== "string" ||
      !/^[a-z0-9_-]+\.json$/i.test(entry.file)
    )
      throw new Error("剧本目录的 ID 或文件名无效");
    ids.add(entry.id);
  }
  if (
    typeof data.defaultScenario !== "string" ||
    !ids.has(data.defaultScenario)
  )
    throw new Error("剧本目录的默认剧本不存在");
  return data as ScenarioCatalogue;
}

export function scenarioMetadata(
  raw: Record<string, unknown>,
  nationIds: Set<string>,
): Pick<Scenario, "id" | "name" | "description" | "recommendedNations"> {
  const result: Pick<
    Scenario,
    "id" | "name" | "description" | "recommendedNations"
  > = {};
  for (const key of ["id", "name", "description"] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim())
      throw new Error(`scenario.${key} 应为非空文字`);
    result[key] = value;
  }
  if (raw.recommendedNations !== undefined) {
    const values = raw.recommendedNations;
    if (
      !Array.isArray(values) ||
      values.some((id) => typeof id !== "string" || !nationIds.has(id)) ||
      new Set(values).size !== values.length
    )
      throw new Error("推荐国家必须引用当前剧本中的国家且不能重复");
    result.recommendedNations = [...values];
  }
  return result;
}

/** Keep a modified/imported pack available beside the two shipped starts. */
export function setupScenarios(
  base: Content,
  builtins: Scenario[],
  current: Content,
): Scenario[] {
  const sharedRules = (content: Content) =>
    JSON.stringify({ ...content, scenario: null });
  const original = builtins.some(
    (scenario) => JSON.stringify(scenario) === JSON.stringify(current.scenario),
  );
  if (original && sharedRules(base) === sharedRules(current)) return builtins;
  return [
    ...builtins,
    {
      ...current.scenario,
      id: "custom-current",
      name: `当前内容 · ${current.scenario.name ?? "自定义剧本"}`,
    },
  ];
}
