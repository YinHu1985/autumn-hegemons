import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { diplomaticRelation, relationValue } from "../../simulation/diplomacy";
import { RELATION_LABELS, signedRelation } from "./presentation";

/** Selecting a row changes the subject, so every country's pair relations are inspectable. */
export function NationRelations({
  content,
  world,
  nationId,
  onSelect,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
  onSelect: (id: string) => void;
}) {
  const name = content.scenario.nations.find(
    (nation) => nation.id === nationId,
  )?.name;
  return (
    <section className="nation-relations" aria-label={`${name}国与列国关系`}>
      <header className="ui-section-heading">
        <h3>{name}与列国</h3>
      </header>
      <p className="ui-note">选择国家，查阅其邦交。</p>
      <div className="nation-relations-grid">
        {content.scenario.nations
          .filter((nation) => nation.id !== nationId)
          .map((nation) => {
            const tier = diplomaticRelation(
              content,
              world,
              nationId,
              nation.id,
            );
            return (
              <button
                key={nation.id}
                onClick={() => onSelect(nation.id)}
                className={`relation-${tier}`}
              >
                <strong>{nation.name}</strong>
                <span>{RELATION_LABELS[tier]}</span>
                <b>
                  {signedRelation(
                    relationValue(content, world, nationId, nation.id),
                  )}
                </b>
              </button>
            );
          })}
      </div>
    </section>
  );
}
