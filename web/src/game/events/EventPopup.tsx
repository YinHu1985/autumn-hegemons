import { useEffect, useRef } from "react";
import type { Content } from "../../definitions/types";
import type { ActiveEvent } from "../../simulation/events/state";
import { renderEventText } from "../../simulation/events";
import type { WorldState } from "../../simulation/state";
import { EventDossier } from "./EventDossier";
import "./event-popup.css";

interface Props {
  content: Content;
  world: WorldState;
  event: ActiveEvent;
  visible: boolean;
  count: number;
  index: number;
  onClose: () => void;
  onStep: (direction: -1 | 1) => void;
  onResolved: (world: WorldState) => void;
}

/** A non-modal report: the map and the current government page remain in place. */
export function EventPopup({
  content,
  world,
  event,
  visible,
  count,
  index,
  onClose,
  onStep,
  onResolved,
}: Props) {
  const popup = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement;
    const element = popup.current;
    element?.focus({ preventScroll: true });
    return () => {
      // Do not steal focus back from a menu, map-selection mode or another page.
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !previous.matches(":disabled") &&
        !previous.closest("[hidden],[inert]") &&
        previous.getClientRects().length > 0 &&
        (element?.contains(document.activeElement) ||
          document.activeElement === document.body)
      ) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [visible]);
  useEffect(() => {
    if (visible && document.activeElement === document.body)
      popup.current?.focus({ preventScroll: true });
  }, [event.id, visible]);
  const definition = content.events.find(
    (entry) => entry.id === event.definitionId,
  );
  if (!definition) return null;
  return (
    <section
      ref={popup}
      className="event-popup"
      hidden={!visible}
      role="dialog"
      aria-label={renderEventText(content, world, event, definition.title)}
      tabIndex={-1}
      onKeyDown={(key) => {
        if (key.key === "Escape") {
          key.preventDefault();
          key.stopPropagation();
          onClose();
        }
        // Native Space activation on buttons is preserved; the world stays paused.
        if (key.code === "Space") key.stopPropagation();
      }}
    >
      <header className="event-popup-heading">
        <span className="event-popup-mark" aria-hidden="true">
          奏
        </span>
        <strong>
          {definition.presentation?.important ? "要事呈报" : "奏报呈阅"}
        </strong>
        <span className="event-popup-pause">世界已暂停</span>
        <button
          className="ui-close"
          aria-label="稍后处理奏报"
          title="稍后处理 · Esc"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <EventDossier
        key={event.id}
        content={content}
        world={world}
        event={event}
        nationId={world.playerNationId}
        onWorld={onResolved}
      />
      <footer className="event-popup-footer">
        <div className="event-popup-navigation" aria-label="切换待议奏报">
          <button
            disabled={count < 2}
            aria-label="上一份奏报"
            onClick={() => onStep(-1)}
          >
            ‹
          </button>
          <span>
            {index + 1} / {count} 份待议
          </span>
          <button
            disabled={count < 2}
            aria-label="下一份奏报"
            onClick={() => onStep(1)}
          >
            ›
          </button>
        </div>
        <button className="event-popup-defer" onClick={onClose}>
          稍后处理
        </button>
      </footer>
    </section>
  );
}
