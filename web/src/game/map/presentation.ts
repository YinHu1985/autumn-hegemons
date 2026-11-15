import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import type { AtlasGeometry, MapCity, MapPoint, TerritoryEdge } from "./types";

const COLORS = [
  "#5b7763",
  "#9f6c47",
  "#687d9f",
  "#9a5460",
  "#a5954d",
  "#777293",
];
export function nationColor(content: Content, id: string) {
  const index = content.scenario.nations.findIndex(
    (nation) => nation.id === id,
  );
  return (
    content.scenario.nations[index]?.color ??
    COLORS[Math.max(0, index) % COLORS.length]
  );
}

export function nationalEdges(
  edges: TerritoryEdge[],
  owners: Record<string, string>,
) {
  return edges.filter(
    (edge) =>
      edge.cityIds.some((id) => owners[id]) &&
      (edge.cityIds.length === 1 ||
        owners[edge.cityIds[0]] !== owners[edge.cityIds[1]]),
  );
}

/** Existing ids retain the baked anchors until the next atlas build. New ids still get a marker. */
export function mapCities(
  cities: MapCity[],
  geometry: AtlasGeometry | null,
): MapCity[] {
  const anchors = new Map(
    geometry?.cells.map((cell) => [cell.cityId, cell.anchor]),
  );
  return cities.map((city) => ({
    ...city,
    map: anchors.get(city.id) ?? city.map,
  }));
}

interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CityLabel {
  x: number;
  y: number;
  width: number;
  visible: boolean;
}
const overlaps = (a: LabelBox, b: LabelBox) =>
  a.x < b.x + b.width + 3 &&
  a.x + a.width + 3 > b.x &&
  a.y < b.y + b.height + 3 &&
  a.y + a.height + 3 > b.y;

/** Labels are laid out in screen pixels, with several candidate positions per city. */
export function layoutCityLabels(
  cities: MapCity[],
  zoom: number,
  selectedId: string,
  ownIds: Set<string>,
  labelText?: ReadonlyMap<string, string>,
) {
  const labels = new Map<string, CityLabel>();
  const occupied: LabelBox[] = [];
  const markers = cities.map((city) => ({
    id: city.id,
    x: city.map.x * zoom - 6,
    y: city.map.y * zoom - 6,
    width: 12,
    height: 12,
  }));
  const priority = [...cities].sort(
    (a, b) =>
      Number(b.id === selectedId) - Number(a.id === selectedId) ||
      Number(ownIds.has(b.id)) - Number(ownIds.has(a.id)) ||
      b.scale - a.scale,
  );
  for (const city of priority) {
    const width = (labelText?.get(city.id) ?? city.name).length * 13 + 16;
    const candidates = [
      { x: 11, y: -12 },
      { x: -width - 11, y: -12 },
      { x: -width / 2, y: -32 },
      { x: -width / 2, y: 14 },
      { x: 13, y: -32 },
    ];
    const valid = candidates.find((offset) => {
      const box = {
        x: city.map.x * zoom + offset.x,
        y: city.map.y * zoom + offset.y,
        width,
        height: 23,
      };
      return (
        !occupied.some((other) => overlaps(box, other)) &&
        !markers.some((other) => other.id !== city.id && overlaps(box, other))
      );
    });
    const offset = valid ?? candidates[0];
    const visible = !!valid || city.id === selectedId;
    if (visible)
      occupied.push({
        x: city.map.x * zoom + offset.x,
        y: city.map.y * zoom + offset.y,
        width,
        height: 23,
      });
    labels.set(city.id, { ...offset, width, visible });
  }
  return labels;
}

export function territoryFitPoints(
  geometry: AtlasGeometry | null,
  cities: MapCity[],
  ids?: Set<string>,
): MapPoint[] {
  const cells = geometry?.cells.filter(
    (cell) =>
      (!ids || ids.has(cell.cityId)) &&
      cities.some((city) => city.id === cell.cityId),
  );
  return cells?.length
    ? cells.flatMap((cell) => cell.points.map(([x, y]) => ({ x, y })))
    : cities.filter((city) => !ids || ids.has(city.id)).map((city) => city.map);
}

export function cityOwners(world: WorldState) {
  return Object.fromEntries(
    Object.entries(world.settlements).map(([id, city]) => [id, city.owner]),
  );
}
