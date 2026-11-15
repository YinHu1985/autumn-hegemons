import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const temporary = await mkdtemp(join(tmpdir(), "autumn-map-presentation-"));
after(() => rm(temporary, { recursive: true, force: true }));
const [bundled, scenarioText, geometryText] = await Promise.all([
  build({
    entryPoints: ["src/game/map/presentation.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  }),
  readFile("public/content/base/scenario.json", "utf8"),
  readFile("public/map/territories.json", "utf8"),
]);
const entry = join(temporary, "presentation.mjs");
await writeFile(entry, bundled.outputFiles[0].text);
const { nationalEdges, mapCities, layoutCityLabels, territoryFitPoints } =
  await import(pathToFileURL(entry).href);
const scenario = JSON.parse(scenarioText);
const geometry = JSON.parse(geometryText);
const modeBundle = await build({
  entryPoints: ["src/game/map/mapModes.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const modeEntry = join(temporary, "modes.mjs");
await writeFile(modeEntry, modeBundle.outputFiles[0].text);
const { mapCityColor, mapCityTitle } = await import(
  pathToFileURL(modeEntry).href
);

test("占领城邑后国界按当前归属变化，几何及原始剧本不变", () => {
  const owners = Object.fromEntries(
    scenario.settlements.map((city) => [city.id, city.owner]),
  );
  const before = JSON.stringify(geometry);
  const shared = geometry.edges.find(
    (edge) =>
      edge.cityIds.length === 2 &&
      owners[edge.cityIds[0]] !== owners[edge.cityIds[1]] &&
      geometry.edges.some(
        (other) =>
          other.cityIds.length === 2 &&
          other.cityIds.includes(edge.cityIds[1]) &&
          owners[other.cityIds[0]] === owners[other.cityIds[1]],
      ),
  );
  assert.ok(shared, "剧本必须包含可征服的相邻敌国辖区");
  assert.ok(nationalEdges(geometry.edges, owners).includes(shared));

  const [conqueror, conquered] = shared.cityIds;
  const capturedOwners = { ...owners, [conquered]: owners[conqueror] };
  assert.ok(!nationalEdges(geometry.edges, capturedOwners).includes(shared));
  assert.ok(nationalEdges(geometry.edges, owners).includes(shared));
  const previousInternal = geometry.edges.find(
    (edge) =>
      edge.cityIds.length === 2 &&
      edge.cityIds.includes(conquered) &&
      owners[edge.cityIds[0]] === owners[edge.cityIds[1]],
  );
  assert.ok(previousInternal, "被占城邑原先与本国邻城接壤");
  assert.ok(!nationalEdges(geometry.edges, owners).includes(previousInternal));
  assert.ok(
    nationalEdges(geometry.edges, capturedOwners).includes(previousInternal),
  );
  assert.equal(JSON.stringify(geometry), before);

  const exterior = geometry.edges.find((edge) => edge.cityIds.length === 1);
  assert.ok(nationalEdges(geometry.edges, capturedOwners).includes(exterior));
  assert.equal(nationalEdges(geometry.edges, {}).length, 0);
});

test("修改城市坐标暂不移动已烘焙标记，新城市及无底图情况仍可显示", () => {
  const changed = structuredClone(scenario.settlements);
  const firstId = changed[0].id;
  const original = structuredClone(changed[0]);
  changed[0].map = { x: 50, y: 1300 };
  const added = { ...original, id: "mod_new_city", map: { x: 700, y: 680 } };
  changed.push(added);
  const displayed = mapCities(changed, geometry);
  assert.deepEqual(
    displayed.find((city) => city.id === firstId).map,
    geometry.cells.find((cell) => cell.cityId === firstId).anchor,
  );
  assert.deepEqual(displayed.at(-1).map, added.map);
  assert.deepEqual(changed[0].map, { x: 50, y: 1300 });
  assert.deepEqual(mapCities(changed, null), changed);

  const selectedId = new Set([firstId]);
  const points = territoryFitPoints(geometry, displayed, selectedId);
  const cell = geometry.cells.find((entry) => entry.cityId === firstId);
  assert.deepEqual(
    points,
    cell.points.map(([x, y]) => ({ x, y })),
  );
  assert.deepEqual(
    territoryFitPoints(geometry, displayed, new Set([added.id])),
    [added.map],
  );
});

function assertLabelsDoNotOverlap(cities, labels, zoom) {
  const visible = cities
    .filter((city) => labels.get(city.id).visible)
    .map((city) => {
      const label = labels.get(city.id);
      return {
        id: city.id,
        left: city.map.x * zoom + label.x,
        top: city.map.y * zoom + label.y,
        width: label.width,
        height: 23,
      };
    });
  for (let i = 0; i < visible.length; i++) {
    for (const b of visible.slice(i + 1)) {
      const a = visible[i];
      const separate =
        a.left + a.width <= b.left ||
        b.left + b.width <= a.left ||
        a.top + a.height <= b.top ||
        b.top + b.height <= a.top;
      assert.ok(separate, `城名 ${a.id} 与 ${b.id} 重叠，缩放 ${zoom}`);
    }
  }
}

test("城名按屏幕空间避让，缩放后仍优先显示选中城和本国城", () => {
  const cities = mapCities(scenario.settlements, geometry);
  const own = new Set(
    cities.filter((city) => city.owner === "qi").map((city) => city.id),
  );
  for (const zoom of [0.45, 0.8, 1.4, 2.5]) {
    const labels = layoutCityLabels(cities, zoom, "linzi", own);
    assert.ok(labels.get("linzi").visible);
    assert.equal(labels.size, cities.length);
    assertLabelsDoNotOverlap(cities, labels, zoom);
    for (const label of labels.values()) {
      assert.ok([label.x, label.y, label.width].every(Number.isFinite));
    }
  }

  // Crowded labels can consume all available positions. Priority must not depend
  // on the source-array order or let a large foreign city hide the selected one.
  const crowded = Array.from({ length: 8 }, (_, index) => ({
    ...cities[0],
    id: `crowd_${index}`,
    name: `邑${index}`,
    map: { x: 900, y: 500 },
    scale: 8 - index,
  }));
  const ownIds = new Set(["crowd_6"]);
  const labels = layoutCityLabels(crowded, 0.5, "crowd_7", ownIds);
  assert.ok(labels.get("crowd_7").visible);
  assert.ok(labels.get("crowd_6").visible);
  assert.ok([...labels.values()].some((label) => !label.visible));
  assertLabelsDoNotOverlap(crowded, labels, 0.5);
});

test("地形模式较长的城名与地形文字仍按实际宽度避让", () => {
  const cities = mapCities(scenario.settlements, geometry);
  const labelsByCity = new Map(
    cities.map((city) => [city.id, `${city.name} · 高山`]),
  );
  const own = new Set(
    cities.filter((city) => city.owner === "qi").map((city) => city.id),
  );
  for (const zoom of [0.45, 0.8, 1.4, 2.5]) {
    const labels = layoutCityLabels(cities, zoom, "linzi", own, labelsByCity);
    assert.ok(labels.get("linzi").visible);
    assertLabelsDoNotOverlap(cities, labels, zoom);
    for (const city of cities)
      assert.ok(
        labels.get(city.id).width >= labelsByCity.get(city.id).length * 13,
      );
  }
});

test("外交颜色与提示读取当前归属和关系，地形不因占领变化", () => {
  const cities = [
    { id: "a", name: "甲邑", terrain: "forest" },
    { id: "b", name: "乙邑", terrain: "plain" },
  ];
  const content = {
    scenario: {
      nations: [
        { id: "qi", name: "齐", color: "#aaa" },
        { id: "lu", name: "鲁", color: "#bbb" },
      ],
    },
    diplomacy: {
      minRelation: -200,
      maxRelation: 200,
      center: 20,
      yearlyDrift: 1,
      actions: [],
    },
    terrains: [
      { id: "forest", name: "森林" },
      { id: "plain", name: "平原" },
    ],
  };
  const world = {
    settlements: { a: { owner: "qi", scale: 2 }, b: { owner: "lu", scale: 3 } },
    diplomacy: { relations: [], missions: [], nextId: 1 },
  };
  const own = mapCityColor(content, world, "qi", cities[0], "diplomacy");
  const friendly = mapCityColor(content, world, "qi", cities[1], "diplomacy");
  assert.notEqual(own, friendly);
  assert.match(
    mapCityTitle(content, world, "qi", cities[1]),
    /鲁 · 平原 · 友好 \+20/,
  );
  const terrain = mapCityColor(content, world, "qi", cities[1], "terrain");
  const colours = new Set([own, friendly]);
  for (const value of [-150, -50, 150]) {
    world.diplomacy.relations = [{ nations: ["lu", "qi"], value }];
    colours.add(mapCityColor(content, world, "qi", cities[1], "diplomacy"));
  }
  assert.equal(colours.size, 5);
  assert.match(mapCityTitle(content, world, "qi", cities[1]), /亲密 \+150/);
  world.settlements.b.owner = "qi";
  assert.equal(mapCityColor(content, world, "qi", cities[1], "diplomacy"), own);
  assert.match(
    mapCityTitle(content, world, "qi", cities[1]),
    /齐 · 平原 · 本国/,
  );
  assert.equal(
    mapCityColor(content, world, "qi", cities[1], "terrain"),
    terrain,
  );
});
