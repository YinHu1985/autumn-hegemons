import { useMemo } from "react";
import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { layoutCityLabels } from "./presentation";
import { mapCityColor, mapCityTitle, terrainName } from "./mapModes";
import type { MapCity, MapMode } from "./types";

interface Props {
  content: Content;
  world: WorldState;
  cities: MapCity[];
  selectedId: string;
  nationId: string;
  hoverId: string | null;
  zoom: number;
  showLabels: boolean;
  mode: MapMode;
  eligibleIds?: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}
export function CityLayer({
  content,
  world,
  cities,
  selectedId,
  nationId,
  hoverId,
  zoom,
  showLabels,
  mode,
  eligibleIds,
  onSelect,
  onHover,
}: Props) {
  const ownIds = new Set(
    cities
      .filter((city) => world.settlements[city.id].owner === nationId)
      .map((city) => city.id),
  );
  const ownKey = [...ownIds].join("|");
  const labelText = useMemo(
    () =>
      new Map(
        cities.map((city) => [
          city.id,
          mode === "terrain"
            ? `${city.name} · ${terrainName(content, city)}`
            : city.name,
        ]),
      ),
    [cities, content, mode],
  );
  const labels = useMemo(
    () => layoutCityLabels(cities, zoom, selectedId, ownIds, labelText),
    [cities, zoom, selectedId, ownKey, labelText],
  );
  const ordered = [...cities].sort(
    (a, b) =>
      Number(a.id === hoverId || a.id === selectedId) -
      Number(b.id === hoverId || b.id === selectedId),
  );
  return (
    <g className="city-layer">
      {ordered.map((city) => {
        const state = world.settlements[city.id];
        const active = city.id === selectedId;
        const label = labels.get(city.id)!;
        const eligible = eligibleIds?.has(city.id);
        const visible = showLabels && (label.visible || city.id === hoverId);
        return (
          <g
            key={city.id}
            transform={`translate(${city.map.x} ${city.map.y}) scale(${1 / zoom})`}
            className={`map-city ${active ? "selected" : ""} ${ownIds.has(city.id) ? "owned" : ""} ${eligibleIds ? (eligible ? "pick-eligible" : "pick-ineligible") : ""}`}
            data-city={city.id}
            role="button"
            tabIndex={0}
            aria-label={`选择${city.name}`}
            aria-pressed={active}
            aria-disabled={eligibleIds ? !eligible : undefined}
            onClick={() => onSelect(city.id)}
            onPointerEnter={() => onHover(city.id)}
            onPointerLeave={() => onHover(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSelect(city.id);
              }
            }}
          >
            <title>
              {mapCityTitle(content, world, nationId, city)}
              {eligibleIds ? (eligible ? " · 可选择" : " · 不可选择") : ""}
            </title>
            <circle r="13" fill="transparent" />
            {active && <circle className="city-selection-ring" r="13" />}
            {eligible && <circle className="city-eligible-ring" r="15" />}
            <path
              className="city-pin"
              d={
                state.scale >= 3
                  ? "M-6,6V-6H-3V-3H0V-6H3V-3H6V6Z"
                  : "M-4.5,-4.5H4.5V4.5H-4.5Z"
              }
              fill={mapCityColor(content, world, nationId, city, mode)}
            />
            {visible && (
              <g
                className="city-label"
                transform={`translate(${label.x} ${label.y})`}
              >
                <rect width={label.width} height="23" rx="2" />
                <text x={label.width / 2} y="16" textAnchor="middle">
                  {labelText.get(city.id)}
                </text>
              </g>
            )}
            {state.construction && (
              <g className="city-building" transform="translate(-14 -14)">
                <circle r="6" />
                <text y="3" textAnchor="middle">
                  工
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
