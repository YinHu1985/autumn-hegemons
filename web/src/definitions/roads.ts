import type { Scenario } from "./types";

/** Undirected links between city IDs. Geometry is presentation, this is gameplay data. */
export interface RoadDefinition {
  from: string;
  to: string;
  /** Optional bends in atlas coordinates, to route around water or mountains. */
  via?: Array<{ x: number; y: number }>;
}

export function validateRoads(
  value: unknown,
  cityIds: ReadonlySet<string>,
): RoadDefinition[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("scenario.roads 应为数组");
  const seen = new Set<string>();
  return value.map((entry: unknown, index) => {
    const path = `scenario.roads[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error(`${path} 应为道路对象`);
    const { from, to, via } = entry as Record<string, unknown>;
    if (typeof from !== "string" || !cityIds.has(from))
      throw new Error(`${path}.from 引用了未知城邑`);
    if (typeof to !== "string" || !cityIds.has(to))
      throw new Error(`${path}.to 引用了未知城邑`);
    if (from === to) throw new Error(`${path} 不能连接城邑自身`);
    const key = JSON.stringify([from, to].sort());
    if (seen.has(key)) throw new Error(`${path} 与已有道路重复`);
    seen.add(key);
    let points: RoadDefinition["via"];
    if (via !== undefined) {
      if (!Array.isArray(via)) throw new Error(`${path}.via 应为坐标数组`);
      points = via.map((point: unknown) => {
        if (!point || typeof point !== "object" || Array.isArray(point))
          throw new Error(`${path}.via 包含无效坐标`);
        const { x, y } = point as Record<string, unknown>;
        if (
          typeof x !== "number" ||
          typeof y !== "number" ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          x < 0 ||
          x > 1800 ||
          y < 0 ||
          y > 1500
        )
          throw new Error(`${path}.via 坐标超出底图范围`);
        return { x, y };
      });
    }
    const road: RoadDefinition =
      from < to ? { from, to } : { from: to, to: from };
    if (points) road.via = from < to ? points : points.reverse();
    return road;
  });
}

const fallbackRoads = new WeakMap<Scenario, RoadDefinition[]>();

/**
 * Old saves/mods without roads get a connected relative-neighbourhood graph.
 * Explicit [] means no roads. Shipped scenarios use authored links instead.
 * This compatibility fallback uses coordinates only, never downloaded map assets.
 */
export function scenarioRoads(scenario: Scenario): RoadDefinition[] {
  if (scenario.roads !== undefined) return scenario.roads;
  const cached = fallbackRoads.get(scenario);
  if (cached) return cached;
  const cities = [...scenario.settlements].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const distance = (a: (typeof cities)[number], b: (typeof cities)[number]) =>
    (a.map.x - b.map.x) ** 2 + (a.map.y - b.map.y) ** 2;
  const roads: RoadDefinition[] = [];
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const a = cities[i],
        b = cities[j];
      const span = distance(a, b);
      if (
        !cities.some(
          (c) =>
            c !== a &&
            c !== b &&
            distance(a, c) < span &&
            distance(b, c) < span,
        )
      )
        roads.push({ from: a.id, to: b.id });
    }
  }
  fallbackRoads.set(scenario, roads);
  return roads;
}
