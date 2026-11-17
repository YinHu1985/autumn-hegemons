import { useEffect, useRef } from "react";
import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { ResearchPanel } from "./ResearchPanel";
import { TalentPanel } from "./TalentPanel";
import { IdeasPanel } from "./IdeasPanel";
import { MilitaryPanel } from "./MilitaryPanel";
import { BattlePanel } from "./BattlePanel";
import { EconomyPanel } from "./EconomyPanel";
import { EventsPanel } from "./EventsPanel";
import { DiplomacyPanel } from "./DiplomacyPanel";
import { PAGE_TITLES, PRIMARY_PAGES, type GamePage } from "./hud/navigation";
import type { RequestMapLocation } from "./map/useMapLocationSelection";
import "./government-window.css";

interface Props {
  page: GamePage;
  content: Content;
  world: WorldState;
  onWorld: (world: WorldState) => void;
  onClose: () => void;
  locked: boolean;
  suspended: boolean;
  hidden?: boolean;
  onRequestMapLocation: RequestMapLocation;
  onNavigate?: (page: GamePage) => void;
}
export function GovernmentWindow({
  page,
  content,
  world,
  onWorld,
  onClose,
  locked,
  suspended,
  hidden = false,
  onRequestMapLocation,
  onNavigate,
}: Props) {
  const windowRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!hidden) windowRef.current?.focus({ preventScroll: true });
  }, [page, hidden]);
  const nationId = world.playerNationId;
  const nation = content.scenario.nations.find(
    (entry) => entry.id === nationId,
  );
  const props = { content, world, nationId, onWorld };
  return (
    <section
      ref={windowRef}
      hidden={hidden}
      tabIndex={-1}
      role="dialog"
      aria-label={PAGE_TITLES[page]}
      aria-modal={locked || undefined}
      className={`government-window government-${page} ${locked ? "tactical-window" : ""}`}
    >
      <header className="window-heading">
        <span className="window-emblem" aria-hidden="true">
          {PRIMARY_PAGES.find((entry) => entry.id === page)?.glyph ?? "史"}
        </span>
        <div className="window-heading-title">
          <small>
            {nation?.name}国 · {page === "events" ? "国史与奏报" : "国家政令"}
          </small>
          <h2>{PAGE_TITLES[page]}</h2>
        </div>
        <span className="window-hint">
          {locked ? "决战进行中 · 世界暂停" : "Esc 关闭"}
        </span>
        <button
          className="ui-close"
          disabled={locked}
          aria-label="关闭面板"
          title="关闭面板 · Esc"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="window-body">
        {page === "economy" ? (
          <EconomyPanel {...props} />
        ) : page === "research" ? (
          <ResearchPanel {...props} />
        ) : page === "talents" ? (
          <TalentPanel {...props} />
        ) : page === "ideas" ? (
          <IdeasPanel {...props} />
        ) : page === "military" ? (
          <MilitaryPanel
            {...props}
            onRequestMapLocation={onRequestMapLocation}
          />
        ) : page === "battles" ? (
          <BattlePanel {...props} suspended={suspended} />
        ) : page === "diplomacy" ? (
          <DiplomacyPanel
            {...props}
            onTalents={onNavigate ? () => onNavigate("talents") : undefined}
          />
        ) : (
          <EventsPanel {...props} />
        )}
      </div>
    </section>
  );
}
