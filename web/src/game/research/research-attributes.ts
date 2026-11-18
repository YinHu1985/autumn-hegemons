import {
  RESEARCH_ATTRIBUTES,
  RESEARCH_ATTRIBUTE_NAMES,
  type TechnologyDefinition,
} from "../../definitions/research";
import type { Talent } from "../../simulation/research-state";
import { researcherAptitude } from "../../simulation/research";

/** Presentation follows each topic's data; the simulation owns its actual multiplier. */
export function researchAttributeEntries(subject: TechnologyDefinition) {
  return RESEARCH_ATTRIBUTES.map((attribute) => ({
    attribute,
    name: RESEARCH_ATTRIBUTE_NAMES[attribute],
    weight: subject.attributeWeights[attribute] ?? 0,
  }))
    .filter(({ weight }) => weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

export function researchAttributeWeightsLabel(subject: TechnologyDefinition) {
  return researchAttributeEntries(subject)
    .map(({ name, weight }) => `${name} ×${weight}`)
    .join(" · ");
}

export function researchTalentAttributesLabel(
  talent: Talent,
  subject?: TechnologyDefinition,
) {
  const attributes = subject
    ? researchAttributeEntries(subject).map(({ attribute }) => attribute)
    : RESEARCH_ATTRIBUTES;
  return attributes
    .map(
      (attribute) =>
        `${RESEARCH_ATTRIBUTE_NAMES[attribute]} ${talent[attribute]}`,
    )
    .join(" · ");
}

export function researchLeaderOption(
  subject: TechnologyDefinition,
  talent: Talent,
) {
  return `${talent.name} · ${researchTalentAttributesLabel(talent, subject)} · 能力 ×${researcherAptitude(subject, talent).toFixed(2)}`;
}
