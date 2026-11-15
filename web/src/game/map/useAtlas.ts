import { useEffect, useMemo, useState } from "react";
import type { AtlasGeometry, MapCity } from "./types";
import {
  atlasFileForLayout,
  atlasLayoutKey,
  atlasMatchesLayout,
  parseAtlasCatalogue,
} from "./atlasCatalogue";

export function useAtlas(cities: MapCity[]) {
  const key = useMemo(() => atlasLayoutKey(cities), [cities]);
  const [loaded, setLoaded] = useState<{
    key: string;
    geometry: AtlasGeometry | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const root = `${import.meta.env.BASE_URL}map/`;
    fetch(`${root}catalogue.json`, {
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("辖区地图暂时无法载入");
        const catalogue = parseAtlasCatalogue(await response.json());
        const file = atlasFileForLayout(catalogue, key);
        if (!file) throw new Error("此地图尚未生成辖区");
        const atlasResponse = await fetch(root + file, {
          signal: abort.signal,
        });
        if (!atlasResponse.ok) throw new Error("辖区地图暂时无法载入");
        const data = (await atlasResponse.json()) as AtlasGeometry;
        if (!atlasMatchesLayout(data, key))
          throw new Error("辖区地图与城邑布局不一致");
        if (!abort.signal.aborted)
          setLoaded({ key, geometry: data, error: "" });
      })
      .catch((cause: Error) => {
        if (!abort.signal.aborted)
          setLoaded({ key, geometry: null, error: cause.message });
      });
    return () => abort.abort();
  }, [key]);
  return loaded?.key === key ? loaded : { geometry: null, error: "" };
}
