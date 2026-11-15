import type { ResearchCategory } from "../definitions/research";
export type TalentRole = "idle" | "advisor" | "general" | "research" | "envoy";
export interface Talent {
  id: string;
  nationId: string;
  name: string;
  role: TalentRole;
  command: number;
  martial: number;
  administration: number;
  scholarship: number;
  specialty: ResearchCategory;
  recruitedMonth: number | null;
  busy: boolean;
  portrait: string;
}
export interface ResearchGroup {
  id: string;
  leaderId: string;
  targetId: string;
  investment: number;
  fundedInvestment: number;
}
export interface NationResearch {
  unlocked: string[];
  progress: Record<string, number>;
  bonuses: Record<string, number>;
  enacted: string[];
  groups: ResearchGroup[];
  lastRefresh: number;
  notices: string[];
}
export interface ResearchState {
  nations: Record<string, NationResearch>;
  talents: Record<string, Talent>;
  seed: number;
  nextId: number;
}
export function researchRandom(state: ResearchState): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}
export const absoluteMonth = (date: { year: number; month: number }) =>
  date.year * 12 + date.month - 1;
