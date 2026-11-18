import {
  RESEARCH_ATTRIBUTES,
  type TechnologyDefinition,
} from "../definitions/research";
import type { Talent } from "./research-state";

/** Each weight is additive: the primary ability and any secondary bonuses are data. */
export function researcherAptitude(
  technology: TechnologyDefinition,
  talent: Pick<Talent, "administration" | "scholarship" | "command">,
): number {
  return (
    0.5 +
    RESEARCH_ATTRIBUTES.reduce(
      (sum, attribute) =>
        sum + talent[attribute] * (technology.attributeWeights[attribute] ?? 0),
      0,
    ) /
      100
  );
}

export function researchSpecialtyMultiplier(
  technology: TechnologyDefinition,
  talent: Pick<Talent, "specialty">,
): number {
  return talent.specialty === technology.category ? 1.75 : 0.7;
}

/** The same leader factor is used by simulation, recruitment planning and UI previews. */
export function researcherEffectiveness(
  technology: TechnologyDefinition,
  talent: Pick<
    Talent,
    "administration" | "scholarship" | "command" | "specialty"
  >,
): number {
  return (
    researcherAptitude(technology, talent) *
    researchSpecialtyMultiplier(technology, talent)
  );
}
