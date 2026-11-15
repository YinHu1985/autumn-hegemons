import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import type { MapCity } from "./types";
import { layoutCityLabels, nationColor } from "./presentation";
import { layoutArmyFlags } from "./armyLayout";
import { armyStatusLabel } from "../militaryPresentation";

export function ArmyLayer({
  content,
  world,
  cities,
  zoom,
  selectedId,
  showLabels,
  onMilitary,
  onBattles,
}: {
  content: Content;
  world: WorldState;
  cities: MapCity[];
  zoom: number;
  selectedId: string;
  showLabels: boolean;
  onMilitary: () => void;
  onBattles: () => void;
}) {
  const cityMap = new Map(cities.map((city) => [city.id, city]));
  const armies = Object.values(world.military.armies);
  const own = new Set(
    cities
      .filter(
        (city) => world.settlements[city.id].owner === world.playerNationId,
      )
      .map((city) => city.id),
  );
  const labels = layoutCityLabels(cities, zoom, selectedId, own);
  const offsets = layoutArmyFlags(cities, labels, armies, zoom, showLabels);
  const fronts = new Map<string, { count: number; ready: boolean }>();
  for (const battle of Object.values(world.military.battles)) {
    if (battle.phase === "resolved") continue;
    const front = fronts.get(battle.cityId) ?? { count: 0, ready: false };
    front.count++;
    front.ready ||= battle.phase === "ready";
    fronts.set(battle.cityId, front);
  }
  return (
    <g className="army-layer">
      {armies.map((army) => {
        const origin = cityMap.get(army.cityId),
          destination =
            army.destination !== army.cityId
              ? cityMap.get(army.destination ?? "")
              : undefined;
        if (!origin) return null;
        const offset = offsets.get(army.id)!;
        const color = nationColor(content, army.nationId);
        const soldiers = army.units.reduce(
          (sum, unit) => sum + unit.cadre + unit.levy,
          0,
        );
        const label =
          soldiers >= 10000
            ? `${(soldiers / 10000).toFixed(1)}万`
            : `${(soldiers / 1000).toFixed(1)}千`;
        const status = armyStatusLabel(army);
        return (
          <g key={army.id}>
            {destination && (
              <g className="march-route">
                <path
                  d={`M${origin.map.x},${origin.map.y}L${destination.map.x},${destination.map.y}`}
                  stroke={color}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={destination.map.x}
                  cy={destination.map.y}
                  r={8 / zoom}
                  fill="none"
                  stroke={color}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
            <path
              className="army-leader"
              d={`M${origin.map.x},${origin.map.y}l${(offset.x + 21) / zoom},${(offset.y + 10) / zoom}`}
              vectorEffect="non-scaling-stroke"
            />
            <g
              className="map-army"
              transform={`translate(${origin.map.x} ${origin.map.y}) scale(${1 / zoom}) translate(${offset.x} ${offset.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${army.name} ${status}`}
              onClick={onMilitary}
              onKeyDown={(event) => {
                if (event.key === "Enter") onMilitary();
              }}
            >
              <title>
                {army.name} · {soldiers}人 · {status}
                {army.remainingDays > 0
                  ? army.status === "returning"
                    ? ` · ${army.remainingDays}日后回池`
                    : ` · 余${army.remainingDays}日`
                  : ""}
                {destination ? ` → ${destination.name}` : ""}
              </title>
              <path d="M0,0H43V17L38,21H0Z" fill={color} />
              <text x="21" y="13" textAnchor="middle">
                {army.status === "marching"
                  ? "›"
                  : army.status === "returning"
                    ? "‹"
                    : "⚑"}{" "}
                {label}
              </text>
            </g>
          </g>
        );
      })}
      {[...fronts].map(([cityId, front]) => {
        const city = cityMap.get(cityId);
        if (!city) return null;
        return (
          <g
            key={cityId}
            className="map-battle"
            transform={`translate(${city.map.x} ${city.map.y}) scale(${1 / zoom}) translate(0 -42)`}
            role="button"
            tabIndex={0}
            aria-label={`${city.name} · ${front.count} 场战役 · ${front.ready ? "决战待命" : "战役准备"}`}
            onClick={onBattles}
            onKeyDown={(event) => {
              if (event.key === "Enter") onBattles();
            }}
          >
            <title>
              {city.name} · {front.count} 场战役 ·{" "}
              {front.ready ? "决战待命" : "战役准备"}
            </title>
            <circle r="11" />
            <text y="4" textAnchor="middle">
              {front.ready ? "战" : front.count > 1 ? front.count : "备"}
            </text>
          </g>
        );
      })}
    </g>
  );
}
