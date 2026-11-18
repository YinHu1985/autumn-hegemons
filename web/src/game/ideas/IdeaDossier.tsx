import {
  CATEGORY_NAMES,
  type IdeaDefinition,
} from "../../definitions/research";
import { formatModifier } from "../../definitions/modifiers";
import type { Content } from "../../definitions/types";
import { EffectActionList } from "../effects/EffectActionList";

interface Props {
  content: Content;
  idea: IdeaDefinition;
  known: boolean;
  enacted: boolean;
  usedSlots: number;
  capacity: number;
  onEnact: () => void;
}

/** The policy screen only governs enactment; unlocking actions can come from elsewhere. */
export function IdeaDossier({
  content,
  idea,
  known,
  enacted,
  usedSlots,
  capacity,
  onEnact,
}: Props) {
  const sources = content.technologies.filter((technology) =>
    technology.completionEffects?.some(
      (effect) => effect.type === "unlock_idea" && effect.ideaId === idea.id,
    ),
  );
  return (
    <>
      <article className="idea-dossier-content">
        {idea.image && (
          <img
            className="idea-dossier-art"
            src={`${import.meta.env.BASE_URL}${idea.image}`}
            alt=""
          />
        )}
        <small>
          {idea.school} · {enacted ? "实行中" : known ? "已解锁" : "未解锁"}
        </small>
        <h3>{idea.name}</h3>
        <p>{idea.description}</p>
        <section className="idea-dossier-effects" aria-label="实行效果">
          <h4>实行后生效</h4>
          <ul>
            {Object.entries(idea.effects)
              .filter(([, value]) => value !== 0)
              .map(([key, value]) => (
                <li key={key}>{formatModifier(key, value)}</li>
              ))}
          </ul>
        </section>
        {!!idea.enactEffects?.length && (
          <section className="idea-dossier-effects" aria-label="开始实行时效果">
            <h4>开始实行时</h4>
            <EffectActionList content={content} actions={idea.enactEffects} />
          </section>
        )}
        {!!idea.repealEffects?.length && (
          <section className="idea-dossier-effects" aria-label="停止实行时效果">
            <h4>停止实行时</h4>
            <EffectActionList content={content} actions={idea.repealEffects} />
          </section>
        )}
        <div className="idea-unlock-requirement">
          <small>{known ? "理念已解锁" : "解锁途径"}</small>
          {sources.map((technology) => (
            <p key={technology.id}>
              科研 · {CATEGORY_NAMES[technology.category]} ·{" "}
              <strong>{technology.name}</strong>
            </p>
          ))}
          <p>
            {known
              ? "可安排实行；掌握知识不会自动实行理念。"
              : sources.length
                ? "掌握上述任一科技，即可解锁此理念。"
                : "此理念尚未解锁。"}
          </p>
        </div>
      </article>
      <div className="ideas-enact-action">
        <p className="ui-note">
          {enacted
            ? "该理念正在实行，国家已获得相应加成。"
            : `实行槽位 ${usedSlots} / ${capacity}，安排后获得国家加成。`}
        </p>
        <button
          className={enacted ? "danger" : "primary"}
          disabled={!known}
          onClick={onEnact}
        >
          {enacted ? "停止实行该理念" : known ? "安排实行该理念" : "尚未解锁"}
        </button>
      </div>
    </>
  );
}
