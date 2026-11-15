import type { AtlasGeometry, MapCity } from "./types";

interface AtlasLayout {
  file: string;
  cities: { id: string; x: number; y: number }[];
}
export interface AtlasCatalogue {
  version: 1;
  layouts: AtlasLayout[];
}

/** Coordinates identify geometry; dates, country names and ownership do not. */
export function atlasLayoutKey(cities: Pick<MapCity, "id" | "map">[]) {
  return JSON.stringify(
    cities
      .map((city) => ({ id: city.id, x: city.map.x, y: city.map.y }))
      .sort((a, b) => a.id.localeCompare(b.id, "en")),
  );
}

export function parseAtlasCatalogue(value: unknown): AtlasCatalogue {
  const catalogue = value as AtlasCatalogue;
  if (
    catalogue?.version !== 1 ||
    !Array.isArray(catalogue.layouts) ||
    !catalogue.layouts.length
  )
    throw new Error("辖区地图目录格式不兼容");
  for (const layout of catalogue.layouts) {
    if (
      !layout ||
      typeof layout.file !== "string" ||
      !/^[a-z0-9_-]+\.json$/i.test(layout.file) ||
      !Array.isArray(layout.cities) ||
      !layout.cities.length
    )
      throw new Error("辖区地图目录条目无效");
    const ids = new Set<string>();
    for (const city of layout.cities) {
      if (
        !city ||
        typeof city.id !== "string" ||
        !city.id ||
        ids.has(city.id) ||
        !Number.isFinite(city.x) ||
        !Number.isFinite(city.y)
      )
        throw new Error("辖区地图目录坐标无效");
      ids.add(city.id);
    }
  }
  return catalogue;
}

export function atlasFileForLayout(catalogue: AtlasCatalogue, key: string) {
  return (
    catalogue.layouts.find(
      (layout) =>
        atlasLayoutKey(
          layout.cities.map((city) => ({ id: city.id, map: city })),
        ) === key,
    )?.file ?? null
  );
}

/** Reject stale or mismatched published assets before rendering any borders. */
export function atlasMatchesLayout(geometry: AtlasGeometry, key: string) {
  return (
    geometry.version === 1 &&
    !!geometry.landPath &&
    !!geometry.cells?.length &&
    atlasLayoutKey(
      geometry.cells.map((cell) => ({ id: cell.cityId, map: cell.anchor })),
    ) === key
  );
}
