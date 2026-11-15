import type { MapCity, MapPoint } from "./types";
import type { CityLabel } from "./presentation";

interface Box extends MapPoint {
  width: number;
  height: number;
}
const touches = (a: Box, b: Box) =>
  a.x < b.x + b.width + 3 &&
  a.x + a.width + 3 > b.x &&
  a.y < b.y + b.height + 3 &&
  a.y + a.height + 3 > b.y;

/** Place banners near their city without covering city names, pins or other banners. */
export function layoutArmyFlags(
  cities: MapCity[],
  labels: Map<string, CityLabel>,
  armies: { id: string; cityId: string }[],
  zoom: number,
  showLabels: boolean,
) {
  const occupied: Box[] = cities.flatMap((city) => {
    const pin = {
      x: city.map.x * zoom - 8,
      y: city.map.y * zoom - 8,
      width: 16,
      height: 16,
    };
    const label = labels.get(city.id);
    return showLabels && label?.visible
      ? [
          pin,
          {
            x: city.map.x * zoom + label.x,
            y: city.map.y * zoom + label.y,
            width: label.width,
            height: 23,
          },
        ]
      : [pin];
  });
  const result = new Map<string, MapPoint>();
  for (const army of armies) {
    const city = cities.find((entry) => entry.id === army.cityId);
    if (!city) continue;
    const candidates: MapPoint[] = [];
    for (const radius of [22, 48, 76, 104, 132]) {
      candidates.push(
        { x: -21, y: radius },
        { x: -43 - radius, y: 5 },
        { x: radius, y: 5 },
        { x: -21, y: -radius - 21 },
      );
    }
    const offset =
      candidates.find(
        (point) =>
          !occupied.some((box) =>
            touches(box, {
              x: city.map.x * zoom + point.x,
              y: city.map.y * zoom + point.y,
              width: 43,
              height: 21,
            }),
          ),
      ) ?? candidates[candidates.length - 1];
    occupied.push({
      x: city.map.x * zoom + offset.x,
      y: city.map.y * zoom + offset.y,
      width: 43,
      height: 21,
    });
    result.set(army.id, offset);
  }
  return result;
}
