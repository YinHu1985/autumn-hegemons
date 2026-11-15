import type { Content } from "../../definitions/types";

export interface MapPoint {
  x: number;
  y: number;
}
export interface TerritoryCell {
  cityId: string;
  points: number[][];
  path: string;
  anchor: MapPoint;
}
export interface TerritoryEdge {
  cityIds: string[];
  path: string;
}
/** Display geometry only. Ownership and travel rules belong to the simulation. */
export interface AtlasGeometry {
  version: 1;
  width: number;
  height: number;
  landPath: string;
  waterPath: string;
  bounds: { x: number; y: number; width: number; height: number };
  cells: TerritoryCell[];
  edges: TerritoryEdge[];
}
export type MapCity = Content["scenario"]["settlements"][number];
export type MapMode = "faction" | "terrain" | "roads" | "diplomacy";
