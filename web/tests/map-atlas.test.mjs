import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { buildAtlasLibrary } from "../scripts/build-map.mjs";

const bundle = await build({
  entryPoints: ["src/game/map/atlasCatalogue.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const {
  atlasLayoutKey,
  atlasFileForLayout,
  parseAtlasCatalogue,
  atlasMatchesLayout,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const readJSON = async (file) => JSON.parse(await readFile(file, "utf8"));
const [index, mask, frontier, legacy, published] = await Promise.all([
  readJSON("public/content/base/scenarios.json"),
  readJSON("map-source/land-mask.json"),
  readJSON("map-source/frontier.json"),
  readJSON("map-source/legacy-map.json"),
  readJSON("public/map/catalogue.json"),
]);
const scenarios = await Promise.all(
  index.entries.map((entry) => readJSON(`public/content/base/${entry.file}`)),
);

test("双剧本共享同城地图，所有发布静态几何和目录都可重建", async () => {
  const { catalogue, maps } = buildAtlasLibrary(
    scenarios,
    mask,
    frontier,
    legacy,
  );
  assert.deepEqual(catalogue, published);
  assert.equal(maps.size, 2, "内置双剧本共用一套，旧23城独立一套");
  const parsed = parseAtlasCatalogue(published);
  const currentKey = atlasLayoutKey(scenarios[0].settlements);
  assert.equal(atlasLayoutKey(scenarios[1].settlements), currentKey);
  assert.equal(atlasFileForLayout(parsed, currentKey), "territories.json");
  for (const [file, geometry] of maps) {
    assert.deepEqual(await readJSON(`public/map/${file}`), geometry);
    assert.ok(
      atlasMatchesLayout(
        geometry,
        atlasLayoutKey(
          geometry.cells.map((cell) => ({ id: cell.cityId, map: cell.anchor })),
        ),
      ),
    );
  }
});

test("旧23城匹配原辖区，新旧布局互不套用，顺序和归属不改变匹配", async () => {
  const oldKey = atlasLayoutKey(legacy.settlements);
  assert.equal(
    atlasFileForLayout(published, oldKey),
    "territories-legacy.json",
  );
  const oldAtlas = await readJSON("public/map/territories-legacy.json");
  assert.ok(atlasMatchesLayout(oldAtlas, oldKey));
  assert.equal(oldAtlas.cells.length, 23);
  assert.equal(
    atlasMatchesLayout(oldAtlas, atlasLayoutKey(scenarios[0].settlements)),
    false,
  );
  const reordered = structuredClone(scenarios[0].settlements).reverse();
  reordered.forEach((city) => {
    city.owner = "new_owner";
    city.name = "新名";
  });
  assert.equal(
    atlasFileForLayout(published, atlasLayoutKey(reordered)),
    "territories.json",
  );
});

test("自定义增删或移动城市不借用错误辖区，可预处理出新地图", () => {
  for (const change of [
    (cities) => cities.pop(),
    (cities) => {
      cities[0].map.x += 2;
    },
    (cities) =>
      cities.push({ ...cities[0], id: "mod_new", map: { x: 470, y: 680 } }),
  ]) {
    const modified = structuredClone(scenarios[0]);
    change(modified.settlements);
    const key = atlasLayoutKey(modified.settlements);
    assert.equal(atlasFileForLayout(published, key), null);
    const library = buildAtlasLibrary(
      [...scenarios, modified],
      mask,
      frontier,
      legacy,
    );
    const file = atlasFileForLayout(library.catalogue, key);
    assert.ok(file);
    assert.ok(atlasMatchesLayout(library.maps.get(file), key));
  }
});

test("地图目录拒绝错误版本、越级路径、重复ID与无效坐标", () => {
  assert.throws(() => parseAtlasCatalogue({ version: 2, layouts: [] }));
  for (const change of [
    (entry) => {
      entry.file = "../content/base/scenario.json";
    },
    (entry) => {
      entry.cities[0].x = NaN;
    },
    (entry) => {
      entry.cities.push(entry.cities[0]);
    },
  ]) {
    const invalid = structuredClone(published);
    change(invalid.layouts[0]);
    assert.throws(() => parseAtlasCatalogue(invalid));
  }
});
