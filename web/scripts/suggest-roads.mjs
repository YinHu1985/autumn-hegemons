/**
 * Produce an editable road proposal from neighbouring atlas cells.
 * Usage from web/: node scripts/suggest-roads.mjs > /tmp/roads.json
 * This never overwrites scenario data: review/copy its result into scenario.roads.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { containsPoint } from "./lib/map-geometry.mjs";

const rings = (path) =>
  path
    .split("M")
    .filter(Boolean)
    .map((ring) =>
      ring
        .replace(/Z$/, "")
        .split("L")
        .map((point) => point.split(",").map(Number)),
    );

export function suggestRoads(scenario, geometry) {
  const cities = new Map(scenario.settlements.map((city) => [city.id, city]));
  const land = rings(geometry.landPath),
    water = rings(geometry.waterPath);
  const inside = (polygons, point) =>
    polygons.filter((polygon) => containsPoint(polygon, point)).length % 2 ===
    1;
  return geometry.edges
    .filter((edge) => edge.cityIds.length === 2)
    .map((edge) => [...edge.cityIds].sort())
    .filter(([from, to]) => {
      const a = cities.get(from)?.map,
        b = cities.get(to)?.map;
      if (!a || !b) return false;
      // Sample the whole segment, excluding links across sea or substantial lakes.
      const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 2);
      for (let step = 0; step <= steps; step++) {
        const t = step / Math.max(1, steps);
        const point = [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
        if (!inside(land, point) || inside(water, point)) return false;
      }
      return true;
    })
    .map(([from, to]) => ({ from, to }))
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from, "en") || a.to.localeCompare(b.to, "en"),
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const readJSON = async (path) =>
    JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const [scenario, geometry] = await Promise.all([
    readJSON("../public/content/base/scenario.json"),
    readJSON("../public/map/territories.json"),
  ]);
  process.stdout.write(
    JSON.stringify(suggestRoads(scenario, geometry), null, 2) + "\n",
  );
}
