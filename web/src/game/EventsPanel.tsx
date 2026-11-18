import { useState } from "react";
import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { eventDaysLeft, renderEventText } from "../simulation/events";
import { EventHistory } from "./events/EventHistory";
import { eventContextLabel } from "./events/event-view";
import "./events/events.css";

interface Props {
  content: Content;
  world: WorldState;
  nationId: string;
  onOpenEvent: (id: string) => void;
}
export function EventsPanel({ content, world, nationId, onOpenEvent }: Props) {
  const active = world.civic.events.filter(
    (event) => event.nationId === nationId,
  );
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
          国史记录
        </button>
        <p>奏报逾期采用第一项抉择；暂停时期限不流逝。</p>
      </nav>
      {tab === "history" ? (
        <EventHistory content={content} world={world} nationId={nationId} />
      ) : !active.length ? (
        <div className="events-empty ui-empty">
          <span aria-hidden="true">奏</span>
          <strong>暂无待议奏报</strong>
          <p>各地政务如常。已发生的国事可在「国史记录」中查阅。</p>
          <button className="quiet" onClick={() => setTab("history")}>
            查阅国史
          </button>
        </div>
      ) : (
        <section aria-label="待议奏报" className="event-inbox">
          <header>
            <small>列国纪事</small>
            <h3>待议奏报</h3>
            <p>点选奏报，在独立小窗中阅览与处置。</p>
          </header>
          <div className="event-inbox-list">
            {active.map((event) => {
              const definition = content.events.find(
                (item) => item.id === event.definitionId,
              );
              if (!definition) return null;
              const days = eventDaysLeft(world, event);
              return (
                <button key={event.id} onClick={() => onOpenEvent(event.id)}>
                  <span className="event-inbox-meta">
                    <span>
                      {definition.presentation?.important ? "要事" : "奏报"}
                    </span>
                    <span className={days <= 10 ? "event-urgent" : ""}>
                      余 {days} 日
                    </span>
                  </span>
                  <strong>
                    {renderEventText(content, world, event, definition.title)}
                  </strong>
                  <small>
                    {eventContextLabel(content, world, event.context)}
                  </small>
                  <span className="event-inbox-open">阅览奏报 ›</span>
                </button>
              );
            })}
          </div>
          <footer>阅览奏报不会自行作出抉择。</footer>
        </section>
      )}
    </div>
  );
}
