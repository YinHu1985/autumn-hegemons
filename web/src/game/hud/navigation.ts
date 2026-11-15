export type GamePage =
  | "economy"
  | "research"
  | "talents"
  | "military"
  | "battles"
  | "diplomacy"
  | "ideas"
  | "events";

export const PRIMARY_PAGES: {
  id: GamePage;
  glyph: string;
  label: string;
  description: string;
}[] = [
  {
    id: "economy",
    glyph: "政",
    label: "内政",
    description: "产业、财赋与国家预算",
  },
  {
    id: "research",
    glyph: "学",
    label: "科研",
    description: "百工技艺与研究课题",
  },
  {
    id: "talents",
    glyph: "士",
    label: "人才",
    description: "延揽贤士、任命职务",
  },
  {
    id: "military",
    glyph: "军",
    label: "军府",
    description: "部队编组、整训与出征",
  },
  {
    id: "battles",
    glyph: "战",
    label: "战役",
    description: "进攻准备、防守编组与决战",
  },
  { id: "ideas", glyph: "道", label: "百家", description: "学说与治国理念" },
  {
    id: "diplomacy",
    glyph: "使",
    label: "外交",
    description: "列国关系与使节往来",
  },
];

export const PAGE_TITLES: Record<GamePage, string> = {
  economy: "内政",
  research: "科研",
  talents: "人才",
  military: "军府",
  battles: "战役",
  diplomacy: "外交",
  ideas: "百家",
  events: "纪事",
};
