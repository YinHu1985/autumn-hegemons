import type { AtlasGeometry, MapCity, MapPoint, TerritoryCell } from "./types";

type Ring = MapPoint[];
type Segment = [MapPoint, MapPoint];

// The baked map uses absolute M/L/Z paths, including several land/lake rings.
// Even-odd containment matches the SVG mask used by TerritoryLayer.
function ringsFromPath(path: string): Ring[] {
  return (path.match(/M[^MZ]+Z/g) ?? [])
    .map((ring) => {
      const values =
        ring.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
      const points: Ring = [];
      for (let index = 0; index + 1 < values.length; index += 2)
        points.push({ x: values[index], y: values[index + 1] });
      return points;
    })
    .filter((ring) => ring.length >= 3);
}

function contains(ring: Ring, point: MapPoint) {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const a = ring[previous],
      b = ring[index];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y)
    )
      inside = !inside;
  }
  return inside;
}

function insideRings(rings: Ring[], point: MapPoint) {
  return rings.reduce(
    (inside, ring) => (contains(ring, point) ? !inside : inside),
    false,
  );
}

function segments(ring: Ring): Segment[] {
  return ring.map((point, index) => [point, ring[(index + 1) % ring.length]]);
}

function distanceToSegment(point: MapPoint, [a, b]: Segment, maximum: number) {
  // Most coastline segments are far outside a candidate's neighbourhood.
  if (
    point.x < Math.min(a.x, b.x) - maximum ||
    point.x > Math.max(a.x, b.x) + maximum ||
    point.y < Math.min(a.y, b.y) - maximum ||
    point.y > Math.max(a.y, b.y) + maximum
  )
    return maximum;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared
    ? Math.max(
        0,
        Math.min(
          1,
          ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
        ),
      )
    : 0;
  return Math.hypot(
    point.x - a.x - fraction * dx,
    point.y - a.y - fraction * dy,
  );
}

function candidates(cell: TerritoryCell): MapPoint[] {
  const xs = cell.points.map(([x]) => x),
    ys = cell.points.map(([, y]) => y);
  const left = Math.min(...xs),
    top = Math.min(...ys);
  const width = Math.max(...xs) - left,
    height = Math.max(...ys) - top;
  const result = [
    cell.anchor,
    {
      x: xs.reduce((sum, x) => sum + x, 0) / xs.length,
      y: ys.reduce((sum, y) => sum + y, 0) / ys.length,
    },
  ];
  // Fixed sample count keeps ownership changes cheap even for a large country.
  for (let row = 0; row < 9; row++)
    for (let column = 0; column < 9; column++)
      result.push({
        x: left + (width * (column + 0.5)) / 9,
        y: top + (height * (row + 0.5)) / 9,
      });
  return result;
}

/** Place a country name on its own dry land, away from cities and borders.
 * Call only when geometry or ownership changes, not on every camera frame.
 * An unlabelable sliver is omitted instead of falling back to sea/foreign land.
 */
export function nationLabelPositions(
  geometry: AtlasGeometry,
  cities: MapCity[],
  owners: Record<string, string>,
): { nationId: string; x: number; y: number }[] {
  const land = ringsFromPath(geometry.landPath);
  const water = ringsFromPath(geometry.waterPath);
  const coast = [...land, ...water].flatMap(segments);
  const cells = geometry.cells.map((cell) => ({
    ...cell,
    ring: cell.points.map(([x, y]) => ({ x, y })),
  }));
  const groups = new Map<string, typeof cells>();
  for (const cell of cells) {
    const nationId = owners[cell.cityId];
    if (!nationId) continue;
    if (!groups.has(nationId)) groups.set(nationId, []);
    groups.get(nationId)!.push(cell);
  }
  const anchors = new Map(cells.map((cell) => [cell.cityId, cell.anchor]));
  const cityPoints = cities.map((city) => anchors.get(city.id) ?? city.map);
  const result: { nationId: string; x: number; y: number }[] = [];
  for (const [nationId, owned] of groups) {
    const center = {
      x: owned.reduce((sum, cell) => sum + cell.anchor.x, 0) / owned.length,
      y: owned.reduce((sum, cell) => sum + cell.anchor.y, 0) / owned.length,
    };
    const borders: Segment[] = geometry.edges
      .filter(
        (edge) =>
          edge.cityIds.some((id) => owners[id] === nationId) &&
          (edge.cityIds.length === 1 ||
            edge.cityIds.some((id) => owners[id] !== nationId)),
      )
      .flatMap((edge) => {
        const values =
          edge.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
        if (values.length !== 4) return [];
        return [
          [
            { x: values[0], y: values[1] },
            { x: values[2], y: values[3] },
          ] as Segment,
        ];
      });
    const obstacles = [...borders, ...coast];
    let best: MapPoint | null = null;
    let bestScore = -Infinity;
    for (const cell of owned) {
      for (const point of candidates(cell)) {
        if (
          !contains(cell.ring, point) ||
          !insideRings(land, point) ||
          insideRings(water, point)
        )
          continue;
        // Clearance is capped so a remote empty corner cannot dominate forever.
        let clearance = 85;
        for (const city of cityPoints)
          clearance = Math.min(
            clearance,
            Math.hypot(point.x - city.x, point.y - city.y) * 0.8,
          );
        for (const segment of obstacles)
          clearance = Math.min(
            clearance,
            distanceToSegment(point, segment, clearance),
          );
        const score =
          clearance - Math.hypot(point.x - center.x, point.y - center.y) * 0.12;
        if (score > bestScore) {
          best = point;
          bestScore = score;
        }
      }
    }
    if (best) result.push({ nationId, ...best });
  }
  return result;
}
