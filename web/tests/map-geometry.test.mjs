import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildMap } from "../scripts/build-map.mjs";
import { containsPoint, polygonArea } from "../scripts/lib/map-geometry.mjs";

const readJSON = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [scenario, mask, frontier, published] = await Promise.all([
  readJSON("../public/content/base/scenario.json"),
  readJSON("../map-source/land-mask.json"),
  readJSON("../map-source/frontier.json"),
  readJSON("../public/map/territories.json"),
]);
const map = buildMap(scenario, mask, frontier);
const insideMask = (path, point) =>
  path
    .split("M")
    .filter(Boolean)
    .map((ring) =>
      ring
        .replace(/Z$/, "")
        .split("L")
        .map((pair) => pair.split(",").map(Number)),
    )
    .filter((ring) => containsPoint(ring, point)).length %
    2 ===
  1;

test("地图预处理可复现，发布资产与剧本一致，归属不写入几何", () => {
  assert.deepEqual(map, published, "修改城镇坐标后运行 npm run map:build");
  assert.deepEqual(buildMap(structuredClone(scenario), mask, frontier), map);
  const conquered = structuredClone(scenario);
  for (const city of conquered.settlements) city.owner = "another-nation";
  assert.deepEqual(buildMap(conquered, mask, frontier), map);
  assert.equal(map.cells.length, scenario.settlements.length);
  assert.ok(map.landPath.startsWith("M") && map.waterPath.startsWith("M"));
});

test("所有城镇位于自己的有效辖区，边界共享且外围有限", () => {
  const byId = new Map(map.cells.map((cell) => [cell.cityId, cell]));
  for (const city of scenario.settlements) {
    const cell = byId.get(city.id);
    assert.ok(cell, city.id);
    assert.deepEqual(cell.anchor, city.map);
    assert.ok(containsPoint(cell.points, [city.map.x, city.map.y]), city.id);
    assert.ok(
      insideMask(map.landPath, [city.map.x, city.map.y]),
      `${city.name} 位于陆地`,
    );
    assert.ok(
      !insideMask(map.waterPath, [city.map.x, city.map.y]),
      `${city.name} 不在湖中`,
    );
    assert.ok(polygonArea(cell.points) > 1, city.id);
    assert.ok(
      cell.points.every(
        (point) => point.length === 2 && point.every(Number.isFinite),
      ),
    );
  }
  for (const edge of map.edges) {
    assert.ok(edge.cityIds.length === 1 || edge.cityIds.length === 2);
    for (const id of edge.cityIds) assert.ok(byId.has(id));
    const vertices = edge.path
      .slice(1)
      .split("L")
      .map((v) => v.split(",").map(Number));
    assert.equal(vertices.length, 2);
    for (const id of edge.cityIds) {
      const cell = byId.get(id);
      for (const vertex of vertices)
        assert.ok(
          cell.points.some(
            (point) => point[0] === vertex[0] && point[1] === vertex[1],
          ),
        );
    }
  }
  assert.ok(map.edges.some((edge) => edge.cityIds.length === 2));
  // The expanded playable region still leaves Tibet, Lingnan and Korea outside.
  for (const point of [
    [200, 550],
    [1000, 1300],
    [1580, 310],
    [500, 1050],
  ])
    assert.ok(map.cells.every((cell) => !containsPoint(cell.points, point)));
});

test("采样范围内辖区没有空洞或重叠，外部定位点保持留白", () => {
  const sites = [
    ...scenario.settlements.map((city) => ({
      id: city.id,
      point: [city.map.x, city.map.y],
    })),
    ...frontier.unmanagedSites.map((point) => ({ id: null, point })),
  ];
  for (let y = 5; y < 1000; y += 19) {
    for (let x = 305; x < 1500; x += 17) {
      const distances = sites
        .map((site) => ({
          ...site,
          distance: Math.hypot(site.point[0] - x, site.point[1] - y),
        }))
        .sort((a, b) => a.distance - b.distance);
      if (distances[1].distance - distances[0].distance < 0.01) continue;
      const expected = distances[0].id ? [distances[0].id] : [];
      const matches = map.cells
        .filter((cell) => containsPoint(cell.points, [x, y]))
        .map((cell) => cell.cityId);
      assert.deepEqual(matches, expected, `地图位置 ${x},${y}`);
    }
  }
});

test("无效、重合或越界城镇坐标在构建阶段明确报错", () => {
  for (const position of [
    { x: NaN, y: 3 },
    { x: -5, y: 3 },
    scenario.settlements[1].map,
  ]) {
    const invalid = structuredClone(scenario);
    invalid.settlements[0].map = position;
    assert.throws(() => buildMap(invalid, mask, frontier));
  }
});
