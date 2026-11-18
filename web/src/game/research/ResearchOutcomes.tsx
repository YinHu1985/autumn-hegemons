import type { TechnologyDefinition } from "../../definitions/research";
import type { Content } from "../../definitions/types";
import { formatModifier } from "../../definitions/modifiers";
import { EffectActionList } from "../effects/EffectActionList";

/** Distinguish permanent knowledge from policies which still require an enactment slot. */
export function ResearchOutcomes({
  content,
  subject,
}: {
  content: Content;
  subject: TechnologyDefinition;
}) {
  const effects = Object.entries(subject.effects).filter(
    ([, value]) => value !== 0,
  );
  const ideas = content.ideas.filter((idea) =>
    subject.completionEffects?.some(
      (effect) => effect.type === "unlock_idea" && effect.ideaId === idea.id,
    ),
  );
  const actions =
    subject.completionEffects?.filter(
      (action) => action.type !== "unlock_idea",
    ) ?? [];
  const buildings = content.buildings.flatMap((building) =>
    building.levels.flatMap((level, index) =>
      level.technology === subject.id
        ? [`${building.name} · ${index + 1} 级`]
        : [],
    ),
  );
  return (
    <>
      {effects.length > 0 && (
        <>
          <h4 className="tech-detail-section-label">研究后生效</h4>
          <ul className="tech-detail-effects">
            {effects.map(([key, value]) => (
              <li key={key}>{formatModifier(key, value)}</li>
            ))}
          </ul>
        </>
      )}
      {ideas.length > 0 && (
        <div className="tech-detail-idea-unlocks">
          <h4 className="tech-detail-section-label">解锁理念</h4>
          {ideas.map((idea) => (
            <div key={idea.id}>
              <strong>{idea.name}</strong>
              <p>
                实行后：
                {Object.entries(idea.effects)
                  .filter(([, value]) => value !== 0)
                  .map(([key, value]) => formatModifier(key, value))
                  .join(" · ")}
              </p>
            </div>
          ))}
          <p className="tech-detail-note">
            解锁后在「百家」安排实行，占用理念槽位；研究完成不会自动实行。
          </p>
        </div>
      )}
      {actions.length > 0 && (
        <>
          <h4 className="tech-detail-section-label">研究完成时</h4>
          <EffectActionList content={content} actions={actions} />
        </>
      )}
      {buildings.length > 0 && (
        <p className="tech-detail-unlocks">解锁建筑：{buildings.join("、")}</p>
      )}
      {!effects.length &&
        !ideas.length &&
        !buildings.length &&
        !actions.length && <p className="tech-detail-note">效果待定</p>}
    </>
  );
}
