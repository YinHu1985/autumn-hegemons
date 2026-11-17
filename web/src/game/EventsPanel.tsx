import { useState } from "react";
import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { chooseEvent } from "../simulation/civic";
import "./events/events.css";

interface Props {
  content: Content;
  world: WorldState;
  nationId: string;
  onWorld: (world: WorldState) => void;
}
export function EventsPanel({ content, world, nationId, onWorld }: Props) {
  const active = world.civic.events.filter(
    (event) => event.nationId === nationId,
  );
  const log = world.civic.log.filter((entry) => entry.nationId === nationId);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  return (
    <div className="events-screen">
      <nav className="events-tabs" aria-label="纪事分类">
        <button
          aria-pressed={tab === "pending"}
          onClick={() => setTab("pending")}
        >
          待议奏报 <b>{active.length}</b>
        </button>
        <button
          aria-pressed={tab === "history"}
          onClick={() => setTab("history")}
        >
          国史记录 <b>{log.length}</b>
        </button>
      </nav>
      {tab === "pending" ? (
        <section aria-label="待议奏报" className="events-pending">
          <p className="ui-note">奏报须在期限内裁定；逾期将采用第一项抉择。</p>
          {active.length === 0 && (
            <div className="events-empty ui-empty">
              <span aria-hidden="true">奏</span>
              <strong>暂无待议奏报</strong>
              <p>各地政务如常。已发生的国事可在「国史记录」中查阅。</p>
              <button className="quiet" onClick={() => setTab("history")}>
                查阅国史
              </button>
            </div>
          )}
          {active.map((event) => {
            const def = content.events.find(
              (item) => item.id === event.definitionId,
            )!;
            return (
              <article className="event-dossier ui-section" key={event.id}>
                <header className="ui-section-heading">
                  <h3>{def.title}</h3>
                  <span
                    className={`ui-badge ${event.daysLeft <= 10 ? "event-urgent" : ""}`}
                  >
                    尚余 {event.daysLeft} 日
                  </span>
                </header>
                <p className="event-description">{def.description}</p>
                <div className="event-decisions">
                  {def.options.map((option, index) => (
                    <button
                      key={option.label}
                      onClick={() =>
                        onWorld(chooseEvent(content, world, event.id, index))
                      }
                    >
                      <span
                        className="event-decision-number"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                      <span className="event-decision-arrow" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="events-history" aria-label="国史记录">
          <p className="ui-note">记国家兴衰，录政令得失。</p>
          {log.length === 0 ? (
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
                        ? "前" + -entry.date.year
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
      )}
    </div>
  );
}
