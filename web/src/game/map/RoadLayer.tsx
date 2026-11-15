import type { MapCity } from "./types";

/** The displayed network is the same editable graph used by attack eligibility. */
export function RoadLayer({
  roads,
  cities,
  selectedId,
  miniature = false,
}: {
  roads: readonly {
    from: string;
    to: string;
    via?: { x: number; y: number }[];
  }[];
  cities: MapCity[];
  selectedId?: string;
  miniature?: boolean;
}) {
  const byId = new Map(cities.map((city) => [city.id, city]));
  return (
    <g
      className={`map-roads ${miniature ? "miniature" : ""}`}
      aria-hidden="true"
    >
      {roads.map((road) => {
        const from = byId.get(road.from),
          to = byId.get(road.to);
        if (!from || !to) return null;
        const selected = from.id === selectedId || to.id === selectedId;
        const path = [from.map, ...(road.via ?? []), to.map]
          .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
          .join("");
        return (
          <g
            key={`${road.from}-${road.to}`}
            data-road={`${road.from}-${road.to}`}
            className={selected ? "selected" : ""}
          >
            <path
              className="road-bed"
              d={path}
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="road-line"
              d={path}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </g>
  );
}
