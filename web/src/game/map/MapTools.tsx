import { useState } from "react";
import type { MapCity, MapMode } from "./types";
import { MAP_MODE_LABELS } from "./mapModes";

export function MapTools({
  cities,
  mode,
  labels,
  zoom,
  onMode,
  onLabels,
  onZoom,
  onFit,
  onFind,
}: {
  cities: MapCity[];
  mode: MapMode;
  labels: boolean;
  zoom: number;
  onMode: (mode: MapMode) => void;
  onLabels: (on: boolean) => void;
  onZoom: (factor: number) => void;
  onFit: (own: boolean) => void;
  onFind: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [notFound, setNotFound] = useState(false);
  return (
    <div className="map-tools">
      <div className="map-mode-switch" aria-label="地图图层">
        {(Object.entries(MAP_MODE_LABELS) as [MapMode, string][]).map(
          ([id, label]) => (
            <button
              key={id}
              className={mode === id ? "active" : ""}
              aria-pressed={mode === id}
              onClick={() => onMode(id)}
            >
              {label}
            </button>
          ),
        )}
      </div>
      <div className="map-tools-row map-camera-tools">
        <button onClick={() => onFit(false)}>天下</button>
        <button onClick={() => onFit(true)}>本国</button>
        <button aria-label="缩小地图" onClick={() => onZoom(1 / 1.25)}>
          −
        </button>
        <output>{Math.round(zoom * 100)}%</output>
        <button aria-label="放大地图" onClick={() => onZoom(1.25)}>
          ＋
        </button>
      </div>
      <div className="map-tools-row">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const term = search.trim();
            const city =
              (term &&
                cities.find(
                  (entry) => entry.name === term || entry.id === term,
                )) ||
              (term
                ? cities.find((entry) => entry.name.includes(term))
                : undefined);
            setNotFound(!city);
            if (city) onFind(city.id);
          }}
        >
          <input
            type="search"
            aria-label="查找城镇"
            placeholder="查找城邑"
            list="map-cities"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setNotFound(false);
            }}
          />
          <datalist id="map-cities">
            {cities.map((city) => (
              <option key={city.id} value={city.name} />
            ))}
          </datalist>
          <button>定位</button>
        </form>
        <label>
          <input
            type="checkbox"
            checked={labels}
            onChange={(event) => onLabels(event.target.checked)}
          />
          城名
        </label>
      </div>
      {notFound && (
        <small className="map-search-error" role="status">
          未找到该城邑
        </small>
      )}
    </div>
  );
}
