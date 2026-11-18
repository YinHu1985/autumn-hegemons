import { useState } from "react";
import type { Content } from "../../definitions/types";
import type { TechnologyDefinition } from "../../definitions/research";
import type { WorldState } from "../../simulation/state";
import { researchProgress, startResearch } from "../../simulation/research";

/** Shared by the researcher rail and the technology assignment dock. */
export function availableResearchLeaders(world: WorldState, nationId: string) {
  const groups = world.research.nations[nationId].groups;
  return Object.values(world.research.talents).filter(
    (talent) =>
      talent.nationId === nationId &&
      talent.role === "research" &&
      talent.recruitedMonth !== null &&
      !talent.busy &&
      !groups.some((group) => group.leaderId === talent.id),
  );
}

export function useResearchAssignment({
  content,
  world,
  nationId,
  onWorld,
  subject,
  leaderId,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
  onWorld: (world: WorldState) => void;
  subject?: TechnologyDefinition;
  leaderId: string;
}) {
  const [feedback, setFeedback] = useState({
    subjectId: "",
    message: "",
    success: false,
  });
  const state = world.research.nations[nationId];
  const available = availableResearchLeaders(world, nationId);
  const selected = available.some((talent) => talent.id === leaderId)
    ? leaderId
    : (available[0]?.id ?? "");
  const known = !!subject && state.unlocked.includes(subject.id);
  const group = state.groups.find((entry) => entry.targetId === subject?.id);
  const researching = !!group;
  const locked =
    !!subject?.prerequisite && !state.unlocked.includes(subject.prerequisite);
  const progress = subject
    ? researchProgress(content, world, nationId, subject)
    : 0;
  const start = () => {
    if (!subject) return;
    try {
      onWorld(startResearch(content, world, nationId, subject.id, selected));
      setFeedback({
        subjectId: subject.id,
        message: "研究组已组建，月底拨款后开始工作。",
        success: true,
      });
    } catch (error) {
      setFeedback({
        subjectId: subject.id,
        message: error instanceof Error ? error.message : String(error),
        success: false,
      });
    }
  };
  return {
    available,
    selected,
    known,
    researching,
    group,
    locked,
    progress,
    start,
    message:
      feedback.subjectId === subject?.id && (!feedback.success || researching)
        ? feedback.message
        : "",
  };
}
