import { useEffect, useState } from "react";
import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { advanceDays } from "../simulation/time";
import { hasPendingBattle } from "../simulation/military";
import { MapView } from "./MapView";
import { CityPanel } from "./CityPanel";
import { GovernmentWindow } from "./GovernmentWindow";
import { StrategyTopbar } from "./hud/StrategyTopbar";
import { Outliner } from "./hud/Outliner";
import { EventPopup } from "./events/EventPopup";
import { useEventNotifications } from "./events/useEventNotifications";
import type { GamePage } from "./hud/navigation";
import { MapLocationPrompt } from "./map/MapLocationPrompt";
import {
  useMapLocationSelection,
  type RequestMapLocation,
} from "./map/useMapLocationSelection";
import "./strategy.css";

interface Props {
  content: Content;
  world: WorldState;
  onWorld: (world: WorldState) => void;
  onMenu: () => void;
  suspended: boolean;
}

/** The map is the permanent stage; HUD and operation windows float above it. */
export function Game({ content, world, onWorld, onMenu, suspended }: Props) {
  const nationId = world.playerNationId;
  const [cityId, setCityId] = useState(
    content.scenario.settlements.find(
      (city) => world.settlements[city.id].owner === nationId,
    )?.id ?? content.scenario.settlements[0].id,
  );
  const [cityOpen, setCityOpen] = useState(false);
  const [focusCityRequest, setFocusCityRequest] = useState<{
    id: string;
    sequence: number;
  }>();
  const [page, setPage] = useState<GamePage | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [message, setMessage] = useState("");
  const locationSelection = useMapLocationSelection();
  const selectingLocation = !!locationSelection.request;
  const cityStart = content.scenario.settlements.find(
    (city) => city.id === cityId,
  )!;
  const city = world.settlements[cityId];
  const activeBattle = world.military.activeBattleId;
  const pendingBattle = Object.values(world.military.battles).find(
    (battle) =>
      battle.phase === "ready" &&
      [battle.attackerId, battle.defenderId].includes(nationId),
  )?.id;
  const cities = Object.values(world.settlements);
  const gameOver = !cities.some((settlement) => settlement.owner === nationId);
  const victory = cities.every((settlement) => settlement.owner === nationId);
  const notifications = useEventNotifications(
    content,
    world,
    !!activeBattle ||
      !!pendingBattle ||
      suspended ||
      selectingLocation ||
      gameOver,
    onWorld,
  );
  const reportOpen = notifications.visible;

  const openPage = (next: GamePage, toggle = false) => {
    if (activeBattle && next !== "battles") return;
    locationSelection.cancel();
    // Clicking the originating page while picking means returning to its draft.
    if (selectingLocation && next === page) return;
    setCityOpen(false);
    setPage((previous) =>
      toggle && previous === next && !activeBattle ? null : next,
    );
  };
  const openCity = (id: string) => {
    if (activeBattle) return;
    if (selectingLocation) {
      if (locationSelection.request?.eligibleCityIds.includes(id))
        setCityId(id);
      locationSelection.choose(id);
      return;
    }
    setCityId(id);
    setCityOpen(true);
    setPage(null);
  };
  const openMenu = () => {
    locationSelection.cancel();
    setPlaying(false);
    onMenu();
  };
  const requestMapLocation: RequestMapLocation = (request) => {
    if (activeBattle || pendingBattle || suspended) return;
    setPlaying(false);
    locationSelection.cancel();
    locationSelection.begin(request);
  };

  useEffect(() => {
    if (activeBattle) {
      locationSelection.cancel();
      setPlaying(false);
      setCityOpen(false);
      setPage("battles");
    }
  }, [activeBattle]);
  useEffect(() => {
    if (pendingBattle) {
      locationSelection.cancel();
      setPlaying(false);
      setCityOpen(false);
      setPage("battles");
    }
  }, [pendingBattle]);
  useEffect(() => {
    if (reportOpen) setPlaying(false);
    // Resolving or closing a report never resumes time on the player's behalf.
  }, [reportOpen]);
  useEffect(() => {
    if (
      !playing ||
      activeBattle ||
      pendingBattle ||
      gameOver ||
      suspended ||
      selectingLocation ||
      reportOpen
    )
      return;
    const timer = window.setInterval(() => {
      try {
        onWorld(advanceDays(content, world, 1));
      } catch (error) {
        setMessage(String(error));
        setPlaying(false);
      }
    }, 200 / speed);
    return () => clearInterval(timer);
  }, [
    playing,
    speed,
    content,
    world,
    onWorld,
    activeBattle,
    pendingBattle,
    gameOver,
    suspended,
    selectingLocation,
    reportOpen,
  ]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        suspended ||
        event.defaultPrevented ||
        event.repeat ||
        document.querySelector(":popover-open")
      )
        return;
      if (event.key === "Escape" && reportOpen) {
        event.preventDefault();
        notifications.close();
        return;
      }
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (event.code === "Space") {
        // Let a focused report button receive its native Space activation.
        if (reportOpen) return;
        event.preventDefault();
        if (!activeBattle && !pendingBattle && !gameOver && !selectingLocation)
          setPlaying((value) => !value);
      }
      if (event.key === "Escape" && !activeBattle) {
        event.preventDefault();
        if (selectingLocation) locationSelection.cancel();
        else if (page) setPage(null);
        else if (cityOpen) setCityOpen(false);
        else {
          setPlaying(false);
          onMenu();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    activeBattle,
    pendingBattle,
    gameOver,
    suspended,
    page,
    cityOpen,
    onMenu,
    selectingLocation,
    locationSelection.cancel,
    reportOpen,
    notifications.close,
  ]);

  return (
    <div className="strategy-shell">
      <MapView
        content={content}
        world={world}
        selectedCityId={cityId}
        selectedNationId={nationId}
        leftPanelOpen={cityOpen && !selectingLocation}
        selection={locationSelection.request ?? undefined}
        focusCityRequest={focusCityRequest}
        onSelect={openCity}
        onMilitary={() => openPage("military")}
        onEvents={() => notifications.open()}
        onBattles={() => openPage("battles")}
      />
      <StrategyTopbar
        content={content}
        world={world}
        page={page}
        playing={playing && !suspended && !reportOpen}
        speed={speed}
        locked={!!activeBattle || gameOver}
        timeBlocked={hasPendingBattle(world) || selectingLocation || reportOpen}
        timeBlockedReason={
          reportOpen
            ? "阅览奏报期间世界暂停，处置或稍后处理后可继续"
            : selectingLocation
              ? "地图点选期间世界暂停，完成或取消选择后可继续"
              : undefined
        }
        onPage={(next) => openPage(next, true)}
        onToggleTime={() => {
          if (!selectingLocation && !reportOpen) setPlaying((value) => !value);
        }}
        onSpeed={setSpeed}
        onMenu={openMenu}
      />
      <Outliner
        content={content}
        world={world}
        selectedCityId={cityId}
        onCity={(id) => {
          openCity(id);
          if (!activeBattle && !selectingLocation)
            setFocusCityRequest((previous) => ({
              id,
              sequence: (previous?.sequence ?? 0) + 1,
            }));
        }}
        onMilitary={() => openPage("military")}
        onResearch={() => openPage("research")}
        onBattles={() => openPage("battles")}
      />
      {cityOpen && (
        <section
          className="province-window"
          hidden={selectingLocation}
          role="dialog"
          aria-label={`${cityStart.name}省份详情`}
        >
          <header className="province-window-heading">
            <span>城邑 · {cityStart.name}</span>
            <button
              className="ui-close"
              aria-label="关闭省份窗口"
              onClick={() => setCityOpen(false)}
            >
              ×
            </button>
          </header>
          <CityPanel
            key={cityId}
            content={content}
            world={world}
            city={city}
            cityStart={cityStart}
            nation={world.nations[city.owner]}
            playerNationId={nationId}
            onWorld={onWorld}
          />
        </section>
      )}
      {page && (
        <GovernmentWindow
          suspended={suspended}
          hidden={selectingLocation}
          page={page}
          onOpenEvent={notifications.open}
          content={content}
          world={world}
          onWorld={onWorld}
          onClose={() => setPage(null)}
          onNavigate={openPage}
          locked={!!activeBattle}
          onRequestMapLocation={requestMapLocation}
        />
      )}
      {notifications.event && (
        <EventPopup
          content={content}
          world={world}
          event={notifications.event}
          visible={reportOpen}
          count={notifications.count}
          index={notifications.index}
          onClose={notifications.close}
          onStep={notifications.step}
          onResolved={notifications.resolve}
        />
      )}
      {locationSelection.request && (
        <MapLocationPrompt
          request={locationSelection.request}
          error={locationSelection.error}
          onCancel={locationSelection.cancel}
        />
      )}
      {message && (
        <div className="strategy-message" role="status">
          <span>{message}</span>
          <button aria-label="关闭提示" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      {(gameOver || victory) && (
        <div className="end-banner">
          <strong>{gameOver ? "社稷已覆" : "天下归一"}</strong>
          <span>
            {gameOver
              ? "所有城邑已经失守，可从系统菜单另开新局。"
              : "列国皆已归于治下，可继续经营你的国家。"}
          </span>
          <button onClick={openMenu}>系统菜单</button>
        </div>
      )}
    </div>
  );
}
