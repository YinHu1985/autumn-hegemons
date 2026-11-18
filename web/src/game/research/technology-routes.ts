import type {
  ResearchCategory,
  TechnologyDefinition,
} from "../../definitions/research";
import type { Content } from "../../definitions/types";

export interface TechnologyRoute {
  id: string;
  label: string;
  category: ResearchCategory;
  subjects: TechnologyDefinition[];
}

function routeLabel(
  content: Content,
  route: string,
  first: TechnologyDefinition,
) {
  return (
    first.routeName ??
    content.buildings.find((building) => building.route === route)?.name ??
    content.goods.find((good) => good.id === route)?.name ??
    content.units.find((unit) => unit.id === route)?.name ??
    first.name
  );
}

/** Group a category by content route, preserving every tier and branch. */
export function technologyRoutes(
  content: Content,
  category: ResearchCategory,
): TechnologyRoute[] {
  const groups = new Map<string, TechnologyRoute>();
  for (const subject of content.technologies) {
    if (subject.category !== category) continue;
    const id = `${subject.category}:${subject.route}`;
    let row = groups.get(id);
    if (!row) {
      row = {
        id,
        label: routeLabel(content, subject.route, subject),
        category: subject.category,
        subjects: [],
      };
      groups.set(id, row);
    }
    row.subjects.push(subject);
  }
  return [...groups.values()].map((row) => {
    row.subjects.sort((a, b) => a.tier - b.tier);
    return row;
  });
}
