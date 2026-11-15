// Build-time geometry only. Runtime game rules do not import this module.
// Coordinates are atlas pixels, not geographic distances or historical borders.
const EPSILON = 1e-7;
const snap = ([x, y]) => [
  Math.round(x * 1000) / 1000,
  Math.round(y * 1000) / 1000,
];

export function polygonArea(points) {
  return (
    points.reduce((sum, a, index) => {
      const b = points[(index + 1) % points.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0) / 2
  );
}

export function containsPoint(points, point, tolerance = 0.002) {
  let inside = false;
  for (let index = 0; index < points.length; index++) {
    const a = points[index],
      b = points[(index + 1) % points.length];
    const cross =
      (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    if (
      Math.abs(cross) <=
        tolerance * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1])) &&
      point[0] >= Math.min(a[0], b[0]) - tolerance &&
      point[0] <= Math.max(a[0], b[0]) + tolerance &&
      point[1] >= Math.min(a[1], b[1]) - tolerance &&
      point[1] <= Math.max(a[1], b[1]) + tolerance
    )
      return true;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < a[0] + ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1])
    )
      inside = !inside;
  }
  return inside;
}

function cleanPolygon(points) {
  const distinct = points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]) > EPSILON;
  });
  return distinct.filter((point, index) => {
    const previous = distinct[(index + distinct.length - 1) % distinct.length];
    const next = distinct[(index + 1) % distinct.length];
    return (
      Math.abs(
        (point[0] - previous[0]) * (next[1] - point[1]) -
          (point[1] - previous[1]) * (next[0] - point[0]),
      ) > EPSILON
    );
  });
}

// Keep the half-plane nearer to site than other. The intersection is convex,
// so successive clipping produces one non-overlapping polygon for each city.
function clipCloser(points, site, other) {
  const nx = other[0] - site[0],
    ny = other[1] - site[1];
  const offset = (nx * (site[0] + other[0]) + ny * (site[1] + other[1])) / 2;
  const distance = ([x, y]) => nx * x + ny * y - offset;
  const result = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index],
      b = points[(index + 1) % points.length];
    const da = distance(a),
      db = distance(b);
    if (da <= EPSILON) result.push(a);
    if (da <= EPSILON !== db <= EPSILON) {
      const fraction = da / (da - db);
      result.push([
        a[0] + fraction * (b[0] - a[0]),
        a[1] + fraction * (b[1] - a[1]),
      ]);
    }
  }
  return cleanPolygon(result);
}

export function polygonPath(points, close = true) {
  return `M${points.map((point) => point.join(",")).join("L")}${close ? "Z" : ""}`;
}

export function createCells(sites, { width, height }) {
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0
  )
    throw new Error("地图宽高必须是正数");
  const ids = new Set(),
    positions = new Set();
  for (const site of sites) {
    if (!site.id || ids.has(site.id))
      throw new Error(`辖区定位点 ID 重复：${site.id}`);
    if (
      !Array.isArray(site.point) ||
      site.point.length !== 2 ||
      !site.point.every(Number.isFinite)
    )
      throw new Error(`辖区定位点坐标无效：${site.id}`);
    const key = site.point.join(",");
    if (positions.has(key)) throw new Error(`辖区定位点坐标重合：${site.id}`);
    if (
      !site.unmanaged &&
      (site.point[0] < 0 ||
        site.point[0] > width ||
        site.point[1] < 0 ||
        site.point[1] > height)
    )
      throw new Error(`城镇位于底图范围外：${site.id}`);
    ids.add(site.id);
    positions.add(key);
  }
  return sites
    .filter((site) => !site.unmanaged)
    .map((site) => {
      let points = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ];
      for (const other of sites) {
        if (other === site) continue;
        points = clipCloser(points, site.point, other.point);
        if (!points.length) throw new Error(`城镇没有可用辖区：${site.id}`);
      }
      // Adjacent cells must share exact vertices, including their rounded JSON.
      points = cleanPolygon(points.map(snap));
      if (points.length < 3 || Math.abs(polygonArea(points)) < 1)
        throw new Error(`城镇辖区退化或过小：${site.id}`);
      return {
        cityId: site.id,
        points,
        path: polygonPath(points),
        anchor: { x: site.point[0], y: site.point[1] },
      };
    });
}

export function createEdges(cells) {
  const edges = new Map();
  for (const cell of cells) {
    for (let index = 0; index < cell.points.length; index++) {
      const points = [
        cell.points[index],
        cell.points[(index + 1) % cell.points.length],
      ];
      const key = points
        .map((point) => point.join(","))
        .sort()
        .join("|");
      if (!edges.has(key))
        edges.set(key, { cityIds: [], path: polygonPath(points, false) });
      const edge = edges.get(key);
      if (edge.cityIds.includes(cell.cityId) || edge.cityIds.length === 2)
        throw new Error(`非流形辖区边界：${key}`);
      edge.cityIds.push(cell.cityId);
      edge.cityIds.sort();
    }
  }
  return [...edges.values()];
}
