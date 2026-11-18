import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { dateFromGameDay } from "../../simulation/modifier-clock";
import { effectDateLabel } from "../effects/effect-labels";
import { eventContextLabel } from "./event-view";

export function EventHistory({
  content,
  world,
  nationId,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
}) {
  const history = world.civic.history.filter(
    (entry) => entry.nationId === nationId,
  );
  const log = world.civic.log.filter((entry) => entry.nationId === nationId);
  return (
    <div className="events-history-workspace">
      <section className="event-resolutions" aria-label="奏报处置记录">
        <header>
          <h3>奏报处置</h3>
          <span>记录实际结果</span>
        </header>
        {!history.length && <p className="ui-empty">尚无已处置的奏报。</p>}
        <ol>
          {history.map((entry) => (
            <li
              key={entry.id}
              className={entry.status === "cancelled" ? "is-cancelled" : ""}
            >
              <div className="event-history-heading">
                <time>{effectDateLabel(dateFromGameDay(entry.at))}</time>
                <span>{eventContextLabel(content, world, entry.context)}</span>
              </div>
              <h4>{entry.title}</h4>
              <p>
                {entry.status === "cancelled"
                  ? `奏报撤销：${entry.reason ?? "所涉国情已经改变"}`
                  : entry.optionLabel}
              </p>
              {!!entry.results.length && (
                <ul className="event-actual-results">
                  {entry.results.map((result, index) => (
                    <li key={index}>{result.description}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
      <section className="events-history" aria-label="国史记录">
        <header>
          <h3>国史摘录</h3>
          <span>记国家兴衰，录政令得失</span>
        </header>
        {!log.length ? (
          <div className="events-empty ui-empty">
            <span aria-hidden="true">史</span>
            <strong>新局伊始，国史待书</strong>
            <p>营建、外交与军政大事将在此留录。</p>
          </div>
        ) : (
          <ol className="events-timeline">
            {log.map((entry, index) => (
              <li key={index}>
                <time>
                  <strong>
                    {entry.date.year < 0
                      ? `前${-entry.date.year}`
                      : entry.date.year}
                    年
                  </strong>
                  <span>
                    {entry.date.month}月{entry.date.day}日
                  </span>
                </time>
                <p>{entry.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
