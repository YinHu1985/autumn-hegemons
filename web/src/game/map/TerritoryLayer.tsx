import { useId, useMemo } from "react";
import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { nationLabelPositions } from "./nationLabels";
import { nationalEdges, nationColor } from "./presentation";
import type { AtlasGeometry, MapCity, MapMode } from "./types";
import { mapCityColor, mapCityTitle } from "./mapModes";
import { relationDescription } from "../diplomacy/presentation";

interface Props {
  geometry: AtlasGeometry;
  content: Content;
  world: WorldState;
  viewerId: string;
  cities: MapCity[];
  owners: Record<string, string>;
  mode: MapMode;
  selectedId: string;
  hoverId: string | null;
  zoom: number;
  eligibleIds?: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}
export function TerritoryLayer({
  geometry,
  content,
  world,
  viewerId,
  cities,
  owners,
  mode,
  selectedId,
  hoverId,
  zoom,
  eligibleIds,
  onSelect,
  onHover,
}: Props) {
  const maskId = useId();
  const ownerKey = Object.entries(owners)
    .sort()
    .map(([id, owner]) => `${id}:${owner}`)
    .join("|");
  const countryLabels = useMemo(
    () => nationLabelPositions(geometry, cities, owners),
    [geometry, cities, ownerKey],
  );
  const cells = geometry.cells.filter((cell) => owners[cell.cityId]);
  const boundaries = nationalEdges(geometry.edges, owners)
    .map((edge) => edge.path)
    .join(" ");
  return (
    <>
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={geometry.width}
          height={geometry.height}
          style={{ maskType: "luminance" }}
        >
          <path d={geometry.landPath} fill="white" fillRule="evenodd" />
          <path d={geometry.waterPath} fill="black" fillRule="evenodd" />
        </mask>
        <clipPath id={`${maskId}-land`}>
          <path d={geometry.landPath} clipRule="evenodd" />
        </clipPath>
        <clipPath id={`${maskId}-dry`}>
          <path
            d={`M0,0H${geometry.width}V${geometry.height}H0Z${geometry.waterPath}`}
            clipRule="evenodd"
          />
        </clipPath>
      </defs>
      <g
        mask={`url(#${maskId})`}
        clipPath={`url(#${maskId}-land)`}
        className={`territory-layer ${mode}`}
      >
        <g clipPath={`url(#${maskId}-dry)`}>
          {cells.map((cell) => {
            const city = cities.find((city) => city.id === cell.cityId)!;
            const eligible = eligibleIds?.has(cell.cityId);
            return (
              <path
                key={cell.cityId}
                d={cell.path}
                data-territory={cell.cityId}
                className={`territory-cell ${selectedId === cell.cityId ? "selected" : ""} ${hoverId === cell.cityId ? "hovered" : ""} ${eligibleIds ? (eligible ? "pick-eligible" : "pick-ineligible") : ""}`}
                fill={mapCityColor(content, world, viewerId, city, mode)}
                onClick={() => onSelect(cell.cityId)}
                onPointerEnter={() => onHover(cell.cityId)}
                onPointerLeave={() => onHover(null)}
              >
                <title>
                  {mapCityTitle(content, world, viewerId, city)}
                  {eligibleIds ? (eligible ? " · 可选择" : " · 不可选择") : ""}
                </title>
              </path>
            );
          })}
          <>
            <path
              className="province-borders"
              d={geometry.edges.map((edge) => edge.path).join(" ")}
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="nation-border-halo"
              d={boundaries}
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="nation-borders"
              d={boundaries}
              vectorEffect="non-scaling-stroke"
            />
          </>
          {cells
            .filter((cell) => cell.cityId === selectedId)
            .map((cell) => (
              <path
                key={cell.cityId}
                className="selected-territory"
                d={cell.path}
                vectorEffect="non-scaling-stroke"
              />
            ))}
        </g>
      </g>
      {(mode === "faction" || mode === "diplomacy") && zoom < 1.7 && (
        <g className="nation-names" aria-hidden="true">
          {countryLabels.map((label) => (
            <text
              key={label.nationId}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={34 / zoom}
              fill={
                mode === "diplomacy"
                  ? "#473b2b"
                  : nationColor(content, label.nationId)
              }
            >
              {
                content.scenario.nations.find(
                  (nation) => nation.id === label.nationId,
                )?.name
              }
              {mode === "diplomacy" && (
                <tspan x={label.x} dy={20 / zoom} fontSize={12 / zoom}>
                  {relationDescription(
                    content,
                    world,
                    viewerId,
                    label.nationId,
                  )}
                </tspan>
              )}
            </text>
          ))}
        </g>
      )}
    </>
  );
}
