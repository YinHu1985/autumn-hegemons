import { useEffect, useMemo, useRef, useState } from "react";
import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { useMapCamera } from "./map/useMapCamera";
import { overlayMapInsets } from "./map/camera";
import { useAtlas } from "./map/useAtlas";
import { cityOwners, mapCities, territoryFitPoints } from "./map/presentation";
import { TerritoryLayer } from "./map/TerritoryLayer";
import { CityLayer } from "./map/CityLayer";
import { ArmyLayer } from "./map/ArmyLayer";
import { MiniMap } from "./map/MiniMap";
import { MapTools } from "./map/MapTools";
import { RoadLayer } from "./map/RoadLayer";
import { scenarioRoads } from "../definitions/roads";
import type { MapMode } from "./map/types";
import "./map/map.css";

interface Props {
  content: Content;
  world: WorldState;
  selectedCityId: string;
  selectedNationId: string;
  onSelect: (id: string) => void;
  onMilitary: () => void;
  onEvents: () => void;
  onBattles: () => void;
  leftPanelOpen?: boolean;
  focusCityRequest?: { id: string; sequence: number };
  selection?: { eligibleCityIds: readonly string[] };
}
export function MapView({
  content,
  world,
  selectedCityId,
  selectedNationId,
  onSelect,
  onMilitary,
  onEvents,
  onBattles,
  leftPanelOpen = false,
  focusCityRequest,
  selection,
}: Props) {
  const { geometry, error } = useAtlas(content.scenario.settlements);
  const cities = useMemo(
    () => mapCities(content.scenario.settlements, geometry),
    [content, geometry],
  );
  const extent = useMemo(
    () => territoryFitPoints(geometry, cities),
    [geometry, cities],
  );
  const {
    host,
    camera,
    size,
    tx,
    ty,
    focus,
    fit,
    zoomBy,
    panTo,
    viewportProps,
  } = useMapCamera({
    width: 1800,
    height: 1500,
    initialPoints: extent,
    getInsets: (viewport) => overlayMapInsets(viewport, leftPanelOpen),
  });
  const [mode, setMode] = useState<MapMode>("faction");
  const [labels, setLabels] = useState(true);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const eligibleIds = useMemo(
    () => (selection ? new Set(selection.eligibleCityIds) : undefined),
    [selection],
  );
  const roads = useMemo(
    () => scenarioRoads(content.scenario),
    [content.scenario],
  );
  const lastSelection = useRef(selectedCityId);
  const lastFocusRequest = useRef<{ id: string; sequence: number } | null>(
    null,
  );
  const atlasFitted = useRef(false);
  const owners = cityOwners(world);
  const ownIds = new Set(
    cities
      .filter((city) => owners[city.id] === selectedNationId)
      .map((city) => city.id),
  );
  // Map selection leaves the camera still; selections in the city roster focus it.
  const selectOnMap = (id: string) => {
    lastSelection.current = id;
    onSelect(id);
  };
  useEffect(() => {
    const requested =
      focusCityRequest &&
      (focusCityRequest.sequence !== lastFocusRequest.current?.sequence ||
        focusCityRequest.id !== lastFocusRequest.current?.id);
    if (requested) {
      if (!size.width || !size.height) return;
      const city = cities.find((entry) => entry.id === focusCityRequest.id);
      lastFocusRequest.current = focusCityRequest;
      lastSelection.current = selectedCityId;
      if (city) {
        // This runs after the province window opens, so focus uses its new inset.
        focus(city.map.x, city.map.y);
        atlasFitted.current = true;
      }
      return;
    }
    if (lastSelection.current !== selectedCityId) {
      const city = cities.find((entry) => entry.id === selectedCityId);
      if (city) focus(city.map.x, city.map.y);
      lastSelection.current = selectedCityId;
    }
  }, [
    selectedCityId,
    focusCityRequest,
    cities,
    focus,
    size.width,
    size.height,
  ]);
  useEffect(() => {
    if (geometry && size.width && !atlasFitted.current) {
      const home = territoryFitPoints(geometry, cities, ownIds);
      const xs = home.map((point) => point.x),
        ys = home.map((point) => point.y);
      fit(
        home.length
          ? [
              { x: Math.min(...xs) - 120, y: Math.min(...ys) - 100 },
              { x: Math.max(...xs) + 120, y: Math.max(...ys) + 100 },
            ]
          : extent,
      );
      atlasFitted.current = true;
    }
  }, [geometry, size, extent, fit]);
  const events = world.civic.events.filter(
    (event) => event.nationId === selectedNationId,
  ).length;
  const battles = Object.values(world.military.battles).filter(
    (battle) =>
      battle.phase !== "resolved" &&
      [battle.attackerId, battle.defenderId].includes(selectedNationId),
  ).length;
  return (
    <section
      className={`atlas ${leftPanelOpen ? "province-open" : ""} ${selection ? "selecting-location" : ""}`}
      aria-label="天下地图"
    >
      <div
        ref={host}
        className="map-viewport"
        tabIndex={0}
        aria-label="地图视野，方向键平移，加减号缩放"
        {...viewportProps}
      >
        <div
          className="map-world"
          style={{
            transform: `translate(${tx}px,${ty}px) scale(${camera.zoom})`,
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}assets/strategic-map.svg`}
            alt="山川地理底图"
            draggable={false}
          />
        </div>
        {/* Keep vector text out of the cached, CSS-scaled background layer.
            SVG transforms rasterize labels at their final screen resolution. */}
        <svg className="map-overlay">
          <g transform={`translate(${tx} ${ty}) scale(${camera.zoom})`}>
            {geometry && (
              <TerritoryLayer
                geometry={geometry}
                content={content}
                world={world}
                viewerId={selectedNationId}
                cities={cities}
                owners={owners}
                mode={mode}
                selectedId={selectedCityId}
                hoverId={hoverId}
                zoom={camera.zoom}
                eligibleIds={eligibleIds}
                onSelect={selectOnMap}
                onHover={setHoverId}
              />
            )}
            {(mode === "roads" || selection) && (
              <RoadLayer
                roads={roads}
                cities={cities}
                selectedId={hoverId ?? selectedCityId}
              />
            )}
            <CityLayer
              content={content}
              world={world}
              cities={cities}
              selectedId={selectedCityId}
              nationId={selectedNationId}
              hoverId={hoverId}
              zoom={camera.zoom}
              showLabels={labels}
              mode={mode}
              eligibleIds={eligibleIds}
              onSelect={selectOnMap}
              onHover={setHoverId}
            />
            <ArmyLayer
              content={content}
              world={world}
              cities={cities}
              zoom={camera.zoom}
              selectedId={selectedCityId}
              showLabels={labels}
              onMilitary={onMilitary}
              onBattles={onBattles}
            />
          </g>
        </svg>
      </div>
      <div className="alert-strip">
        {events > 0 && <button onClick={onEvents}>国事待议 · {events}</button>}
        {battles > 0 && (
          <button onClick={onBattles}>边境战报 · {battles}</button>
        )}
      </div>
      <div className="map-compass" aria-hidden="true">
        <span>北</span>
        <svg viewBox="0 0 40 60">
          <path d="M20 3L29 39L20 31L11 39Z" />
          <path d="M20 31V56M3 30H37" />
        </svg>
      </div>
      <section className="map-panel" aria-label="地图菜单">
        <MapTools
          cities={cities}
          mode={mode}
          labels={labels}
          zoom={camera.zoom}
          onMode={setMode}
          onLabels={setLabels}
          onZoom={zoomBy}
          onFit={(own) =>
            fit(territoryFitPoints(geometry, cities, own ? ownIds : undefined))
          }
          onFind={(id) => {
            const city = cities.find((entry) => entry.id === id)!;
            selectOnMap(id);
            focus(city.map.x, city.map.y, overlayMapInsets(size, true));
          }}
        />
        <MiniMap
          geometry={geometry}
          content={content}
          world={world}
          viewerId={selectedNationId}
          mode={mode}
          cities={cities}
          owners={owners}
          camera={camera}
          size={size}
          onPan={panTo}
        />
      </section>
      {error && (
        <div className="map-load-error" role="status">
          {error}，城邑仍可选择。
        </div>
      )}
    </section>
  );
}
