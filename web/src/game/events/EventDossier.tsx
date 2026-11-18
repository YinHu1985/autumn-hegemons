import { useState } from "react";
import type { EventOption } from "../../definitions/events";
import type { Content } from "../../definitions/types";
import {
  chooseEvent,
  eventDaysLeft,
  getEventOptionStatus,
  renderEventText,
} from "../../simulation/events";
import type { ActiveEvent } from "../../simulation/events/state";
import type { WorldState } from "../../simulation/state";
import { describeEffectAction } from "../effects/effect-labels";
import { eventContextLabel, eventCostLabel, eventImageUrl } from "./event-view";

interface Props {
  content: Content;
  world: WorldState;
  event: ActiveEvent;
  nationId: string;
  onWorld: (world: WorldState) => void;
}

function OptionEffects({
  content,
  world,
  option,
  event,
}: {
  content: Content;
  world: WorldState;
  option: EventOption;
  event: ActiveEvent;
}) {
  const totalWeight =
    option.outcomes?.reduce((sum, outcome) => sum + outcome.weight, 0) ?? 0;
  const description = (action: EventOption["effects"][number]) =>
    renderEventText(
      content,
      world,
      event,
      describeEffectAction(content, action, event.context),
    );
  return (
    <span className="event-option-effects">
      {option.effects.map((action, index) => (
        <span key={index}>{description(action)}</span>
      ))}
      {option.outcomes?.map((outcome) => (
        <span key={outcome.id} className="event-outcome-preview">
          <b>{Number(((outcome.weight / totalWeight) * 100).toFixed(1))}%</b>
          <span>
            {outcome.effects.length
              ? outcome.effects.map(description).join("；")
              : "没有额外变化"}
          </span>
        </span>
      ))}
    </span>
  );
}

export function EventDossier({
  content,
  world,
  event,
  nationId,
  onWorld,
}: Props) {
  const [error, setError] = useState("");
  const definition = content.events.find(
    (item) => item.id === event.definitionId,
  );
  if (!definition) return null;
  const days = eventDaysLeft(world, event);
  const render = (text: string) => renderEventText(content, world, event, text);
  return (
    <article className="event-dossier" aria-label={render(definition.title)}>
      <header className="event-illustration">
        <img src={eventImageUrl(definition.presentation?.image)} alt="" />
        <div>
          <small>
            {definition.presentation?.speaker
              ? render(definition.presentation.speaker)
              : "史官呈报"}{" "}
            · {eventContextLabel(content, world, event.context)}
          </small>
          <h3>{render(definition.title)}</h3>
          <span
            className={`event-time-seal ${days <= 10 ? "event-urgent" : ""}`}
          >
            尚余 <b>{days}</b> 日
          </span>
        </div>
      </header>
      <div className="event-dossier-body">
        <p className="event-description">{render(definition.description)}</p>
        {error && (
          <p className="panel-message error" role="alert">
            {error}
          </p>
        )}
        <div className="event-decisions" aria-label="奏报抉择">
          {definition.options.map((option, index) => {
            const status = getEventOptionStatus(content, world, event, option);
            const cost = eventCostLabel(status.cost);
            return (
              <button
                key={option.id}
                disabled={!status.available}
                title={status.reasons.join("；") || undefined}
                onClick={() => {
                  try {
                    onWorld(
                      chooseEvent(
                        content,
                        world,
                        event.id,
                        option.id,
                        nationId,
                      ),
                    );
                  } catch (cause) {
                    setError((cause as Error).message);
                  }
                }}
              >
                <span className="event-decision-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="event-decision-content">
                  <span className="event-decision-heading">
                    <strong>{render(option.label)}</strong>
                    {index === 0 && (
                      <span className="event-default-choice">逾期默认</span>
                    )}
                    {cost && (
                      <span className="event-option-cost">支出 {cost}</span>
                    )}
                  </span>
                  <small>{render(option.description)}</small>
                  <OptionEffects
                    content={content}
                    world={world}
                    option={option}
                    event={event}
                  />
                  {!status.available && (
                    <span className="event-unavailable-reason">
                      {status.reasons.join("；")}
                    </span>
                  )}
                </span>
                <span className="event-decision-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            );
          })}
        </div>
        <p className="event-decision-footnote">
          点选即执行。费用与条件以作出抉择时的国情为准。
        </p>
      </div>
    </article>
  );
}
