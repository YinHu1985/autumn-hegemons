/**
 * Rebuild political-map geometry from the scenario and editable map sources.
 * Run from web/: node scripts/build-map.mjs
 *
 * The generated asset is static. Ownership is deliberately absent: the game
 * colours the fixed city polygons from current save state after every conquest.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCells, createEdges } from "./lib/map-geometry.mjs";

export function buildMap(scenario, mask, frontier) {
  if (!scenario.settlements?.length) throw new Error("剧本至少需要一个城镇");
  if (!mask.landPath || !mask.waterPath) throw new Error("缺少陆地或湖泊遮罩");
  if (!Array.isArray(frontier.unmanagedSites))
    throw new Error("缺少外围定位点列表");
  const { width, height } = mask;
  const sites = [
    ...scenario.settlements.map((city) => ({
      id: city.id,
      point: [city.map?.x, city.map?.y],
    })),
    ...frontier.unmanagedSites.map((point, index) => ({
      id: `__frontier-${index}`,
      point,
      unmanaged: true,
    })),
  ];
  const cells = createCells(sites, { width, height });
  const points = cells.flatMap((cell) => cell.points);
  const left = Math.min(...points.map(([x]) => x));
  const top = Math.min(...points.map(([, y]) => y));
  const right = Math.max(...points.map(([x]) => x));
  const bottom = Math.max(...points.map(([, y]) => y));
  return {
    version: 1,
    width,
    height,
    description:
      "固定的游戏化近邻辖区，并非历史疆界；海岸与湖泊由遮罩裁切，国家归属由运行状态提供。",
    generatedBy: "scripts/build-map.mjs",
    attribution: mask.attribution,
    landPath: mask.landPath,
    waterPath: mask.waterPath,
    cells,
    edges: createEdges(cells),
    bounds: {
      x: left,
      y: top,
      width: Math.round((right - left) * 1000) / 1000,
      height: Math.round((bottom - top) * 1000) / 1000,
    },
  };
}

/** One atlas per distinct city layout; era/ownership changes share geometry. */
export function buildAtlasLibrary(scenarios, mask, frontier, legacy) {
  const layouts = [];
  const maps = new Map();
  const seen = new Set();
  for (const [index, source] of [...scenarios, legacy].entries()) {
    const cities = source.settlements
      .map((city) => ({ id: city.id, x: city.map.x, y: city.map.y }))
      .sort((a, b) => a.id.localeCompare(b.id, "en"));
    const key = JSON.stringify(cities);
    if (seen.has(key)) continue;
    seen.add(key);
    const file =
      source === legacy
        ? "territories-legacy.json"
        : index === 0
          ? "territories.json"
          : `territories-${index + 1}.json`;
    const geometry = buildMap(
      source,
      mask,
      source === legacy ? legacy.frontier : frontier,
    );
    layouts.push({ file, cities });
    maps.set(file, geometry);
  }
  return { catalogue: { version: 1, layouts }, maps };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const readJSON = async (path) =>
    JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const [catalogue, mask, frontier, legacy] = await Promise.all([
    readJSON("../public/content/base/scenarios.json"),
    readJSON("../map-source/land-mask.json"),
    readJSON("../map-source/frontier.json"),
    readJSON("../map-source/legacy-map.json"),
  ]);
  if (catalogue.version !== 1 || !catalogue.entries?.length)
    throw new Error("剧本目录无效");
  const entries = [...catalogue.entries].sort(
    (a, b) =>
      Number(b.id === catalogue.defaultScenario) -
      Number(a.id === catalogue.defaultScenario),
  );
  const scenarios = await Promise.all(
    entries.map((entry) => {
      if (
        typeof entry.file !== "string" ||
        !/^[a-z0-9_-]+\.json$/i.test(entry.file)
      )
        throw new Error("剧本目录文件路径无效");
      return readJSON(`../public/content/base/${entry.file}`);
    }),
  );
  const library = buildAtlasLibrary(scenarios, mask, frontier, legacy);
  const directory = new URL("../public/map/", import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const [file, map] of library.maps)
    await writeFile(new URL(file, directory), `${JSON.stringify(map)}\n`);
  await writeFile(
    new URL("catalogue.json", directory),
    `${JSON.stringify(library.catalogue)}\n`,
  );
  console.log(
    `地图预处理完成：${scenarios.length} 个剧本、${scenarios[0].settlements.length} 城、${library.maps.size} 套几何（含旧档兼容）。`,
  );
}
