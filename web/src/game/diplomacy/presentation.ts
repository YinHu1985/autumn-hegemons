import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { diplomaticRelation, relationValue } from "../../simulation/diplomacy";

export const RELATION_LABELS = {
  self: "本国",
  hostile: "险恶",
  discord: "不和",
  friendly: "友好",
  close: "亲密",
};

export const RELATION_COLORS = {
  self: "#d1ad51",
  hostile: "#ad534b",
  discord: "#bb8b54",
  friendly: "#7a9a76",
  close: "#3c8678",
};

export const signedRelation = (value: number) =>
  `${value > 0 ? "+" : ""}${value}`;

export function relationDescription(
  content: Content,
  world: WorldState,
  from: string,
  to: string,
) {
  const tier = diplomaticRelation(content, world, from, to);
  return tier === "self"
    ? RELATION_LABELS.self
    : `${RELATION_LABELS[tier]} ${signedRelation(relationValue(content, world, from, to))}`;
}
