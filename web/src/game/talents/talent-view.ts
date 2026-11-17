import type { TalentRole } from "../../simulation/research-state";

export const TALENT_ROLES: {
  id: TalentRole;
  name: string;
  description: string;
}[] = [
  { id: "advisor", name: "顾问", description: "辅佐国政" },
  { id: "general", name: "将领", description: "统率军团" },
  { id: "research", name: "科研", description: "主持课题" },
  { id: "envoy", name: "使者", description: "出使列国" },
  { id: "idle", name: "待命", description: "暂不任职" },
];
export const talentRoleName = (role: TalentRole) =>
  TALENT_ROLES.find((entry) => entry.id === role)?.name ?? role;
