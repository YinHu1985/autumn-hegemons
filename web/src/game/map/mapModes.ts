import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { diplomaticRelation } from "../../simulation/diplomacy";
import {
  RELATION_COLORS,
  relationDescription,
} from "../diplomacy/presentation";
import { nationColor } from "./presentation";
import type { MapCity, MapMode } from "./types";

export const MAP_MODE_LABELS: Record<MapMode, string> = {
  faction: "列国",
  terrain: "地形",
  roads: "道路",
  diplomacy: "外交",
};

// These are presentation colours; terrain effects remain in the content pack.
const TERRAIN_COLORS: Record<string, string> = {
  plain: "#bdc077",
  forest: "#426d47",
  jungle: "#2b7162",
  hill: "#b08d5c",
  mountain: "#777a82",
  marsh: "#508d9a",
  desert: "#d4ad64",
  tundra: "#c5d3d8",
};

export function terrainName(content: Content, city: MapCity) {
  return (
    content.terrains.find((terrain) => terrain.id === city.terrain)?.name ??
    city.terrain
  );
}

export function mapCityColor(
  content: Content,
  world: WorldState,
  viewerId: string,
  city: MapCity,
  mode: MapMode,
) {
  if (mode === "terrain") return TERRAIN_COLORS[city.terrain] ?? "#899878";
  const owner = world.settlements[city.id].owner;
  if (mode === "diplomacy")
    return RELATION_COLORS[diplomaticRelation(content, world, viewerId, owner)];
  return nationColor(content, owner);
}

export function mapCityTitle(
  content: Content,
  world: WorldState,
  viewerId: string,
  city: MapCity,
) {
  const state = world.settlements[city.id];
  const owner =
    content.scenario.nations.find((nation) => nation.id === state.owner)
      ?.name ?? state.owner;
  return `${city.name} · ${owner} · ${terrainName(content, city)} · ${relationDescription(content, world, viewerId, state.owner)} · 规模${state.scale}`;
}
