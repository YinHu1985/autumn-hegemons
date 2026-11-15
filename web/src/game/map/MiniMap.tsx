import { useId } from "react";
import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import type { AtlasGeometry, MapCity, MapMode } from "./types";
import type { MapCamera } from "./camera";
import { mapCityColor, MAP_MODE_LABELS } from "./mapModes";
import { RoadLayer } from "./RoadLayer";
import { scenarioRoads } from "../../definitions/roads";

export function MiniMap({
  geometry,
  content,
  world,
  viewerId,
  mode,
  cities,
  owners,
  camera,
  size,
  onPan,
}: {
  geometry: AtlasGeometry | null;
  content: Content;
  world: WorldState;
  viewerId: string;
  mode: MapMode;
  cities: MapCity[];
  owners: Record<string, string>;
  camera: MapCamera;
  size: { width: number; height: number };
  onPan: (x: number, y: number) => void;
}) {
  const maskId = useId();
  const bounds = geometry?.bounds ?? {
    x: 400,
    y: 0,
    width: 1050,
    height: 1000,
  };
  const box = {
    x: bounds.x - 35,
    y: bounds.y - 35,
    width: bounds.width + 70,
    height: bounds.height + 70,
  };
  return (
    <div className="mini-map-frame">
      <div className="mini-map-caption">
        天下{MAP_MODE_LABELS[mode]} <span>点击移观</span>
      </div>
      <svg
        className="mini-map"
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="button"
        tabIndex={0}
        aria-label="小地图定位"
        onPointerDown={(event) => {
          // Use the SVG transform so the wider menu never distorts geography
          // or shifts the location reached by a click.
          const matrix = event.currentTarget.getScreenCTM();
          if (!matrix) return;
          const point = new DOMPoint(
            event.clientX,
            event.clientY,
          ).matrixTransform(matrix.inverse());
          onPan(point.x, point.y);
        }}
        onKeyDown={(event) => {
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-80, 0],
            ArrowRight: [80, 0],
            ArrowUp: [0, -80],
            ArrowDown: [0, 80],
          };
          const move = moves[event.key];
          if (move) {
            event.preventDefault();
            onPan(camera.x + move[0], camera.y + move[1]);
          }
        }}
      >
        <image
          href={`${import.meta.env.BASE_URL}assets/strategic-map.svg`}
          x="0"
          y="0"
          width="1800"
          height="1500"
        />
        {geometry && (
          <>
            <defs>
              <mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width="1800"
                height="1500"
                style={{ maskType: "luminance" }}
              >
                <path d={geometry.landPath} fill="white" fillRule="evenodd" />
                <path d={geometry.waterPath} fill="black" fillRule="evenodd" />
              </mask>
            </defs>
            <g mask={`url(#${maskId})`}>
              {geometry.cells
                .filter((cell) => owners[cell.cityId])
                .map((cell) => (
                  <path
                    key={cell.cityId}
                    d={cell.path}
                    fill={mapCityColor(
                      content,
                      world,
                      viewerId,
                      cities.find((city) => city.id === cell.cityId)!,
                      mode,
                    )}
                    opacity=".65"
                  />
                ))}
            </g>
          </>
        )}
        {mode === "roads" && (
          <RoadLayer
            roads={scenarioRoads(content.scenario)}
            cities={cities}
            miniature
          />
        )}
        {cities.map((city) => (
          <circle
            key={city.id}
            cx={city.map.x}
            cy={city.map.y}
            r="5"
            fill="#f7e8bb"
            stroke="#415047"
            strokeWidth="2"
          />
        ))}
        <rect
          className="mini-map-window"
          x={camera.x - size.width / camera.zoom / 2}
          y={camera.y - size.height / camera.zoom / 2}
          width={size.width / camera.zoom}
          height={size.height / camera.zoom}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
