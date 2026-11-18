import { formatModifier } from "../../definitions/modifiers";
import type { Content } from "../../definitions/types";
import { gameDay } from "../../simulation/modifier-clock";
import { listActiveModifiers } from "../../simulation/modifier-query";
import type { WorldState } from "../../simulation/state";
import { effectExpiryLabel } from "../effects/effect-labels";

export function EconomyModifiers({
  content,
  world,
  nationId,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
}) {
  const entries = listActiveModifiers(
    content,
    world,
    { nationId },
    { administrationOnly: true, includeSettlements: true },
  );
  const now = gameDay(world.date);
  return (
    <section className="ui-section economy-modifiers" aria-label="当前生效状态">
      <header className="ui-section-heading">
        <h3>当前生效状态</h3>
        <span className="ui-badge">{entries.length} 项</span>
      </header>
      {entries.length === 0 ? (
        <p className="ui-note">当前没有额外生效的国事状态。</p>
      ) : (
        <div className="economy-modifier-list">
          {entries.map((entry) => {
            const target =
              entry.target.kind === "settlement"
                ? (content.scenario.settlements.find(
                    (city) => city.id === entry.target.id,
                  )?.name ?? entry.target.id)
                : "全国";
            const effects = entry.contributions.map((contribution) =>
              formatModifier(contribution.key, {
                operation: contribution.operation,
                value: contribution.value,
              }),
            );
            const duration =
              entry.expiresAt === undefined && entry.source.kind === "idea"
                ? "实行期间"
                : effectExpiryLabel(entry.expiresAt, now);
            return (
              <details className="economy-modifier" key={entry.id}>
                <summary>
                  <span className="economy-modifier-seal" aria-hidden="true">
                    {entry.icon ? (
                      <img
                        src={`${import.meta.env.BASE_URL}${entry.icon}`}
                        alt=""
                      />
                    ) : (
                      "令"
                    )}
                  </span>
                  <span className="economy-modifier-caption">
                    <strong>{entry.name}</strong>
                    <small>
                      {target} · {duration}
                    </small>
                  </span>
                  <span className="economy-modifier-chevron" aria-hidden="true">
                    ⌄
                  </span>
                </summary>
                <div className="economy-modifier-detail">
                  <p>{entry.description}</p>
                  <ul>
                    {effects.map((effect, index) => (
                      <li key={index}>{effect}</li>
                    ))}
                  </ul>
                  <small>来源：{entry.source.name}</small>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
