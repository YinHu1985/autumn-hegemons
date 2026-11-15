import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { chooseEvent } from "../simulation/civic";
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
  return (
    <div className="feature-panel">
      <div className="panel-intro">
        <h2>邦国纪事</h2>
        <p>各地奏报与国政抉择。逾期未处理将采用第一项。</p>
      </div>
      {active.length === 0 && (
        <div className="empty-state">
          目前没有待处理奏报。各地仍在按时上报。
        </div>
      )}
      {active.map((event) => {
        const def = content.events.find(
          (item) => item.id === event.definitionId,
        )!;
        return (
          <article className="event-card" key={event.id}>
            <span className="eyebrow">尚余 {event.daysLeft} 日</span>
            <h3>{def.title}</h3>
            <p>{def.description}</p>
            <div className="event-options">
              {def.options.map((option, index) => (
                <button
                  key={option.label}
                  onClick={() =>
                    onWorld(chooseEvent(content, world, event.id, index))
                  }
                >
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </article>
        );
      })}
      <h3>国史</h3>
      {log.length === 0 ? (
        <p className="muted">新局伊始，国史待书。</p>
      ) : (
        <ol className="chronicle">
          {log.map((entry, index) => (
            <li key={index}>
              <time>
                {entry.date.year < 0
                  ? "前" + -entry.date.year
                  : entry.date.year}
                年 {entry.date.month}月{entry.date.day}日
              </time>
              <span>{entry.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
