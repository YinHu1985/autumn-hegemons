import { useEffect, useState } from "react";
import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import type { Battle } from "../simulation/military-state";
import {
  selectTacticalUnit,
  actTactical,
  endTacticalTurn,
  finishManualBattle,
} from "../simulation/military";
import {
  tacticalActions,
  tacticalOrders,
} from "../simulation/military-tactics";
import { TacticalBoard } from "./TacticalBoard";
import { TacticalOrdersPanel } from "./TacticalOrdersPanel";
import { TacticalUnitInspector } from "./TacticalUnitInspector";
import { TacticalTimeline } from "./TacticalTimeline";
import { TacticalFloatingPanel } from "./TacticalFloatingPanel";
import { useTacticalPlayback } from "./useTacticalPlayback";
import {
  tacticalActionObserved,
  tacticalPlaybackSnapshot,
  tacticalView,
  visibleTacticalUnitAt,
} from "./tactical-view";
import "./tactical.css";

interface Props {
  content: Content;
  world: WorldState;
  nationId: string;
  battle: Battle;
  onWorld: (world: WorldState) => void;
  suspended?: boolean;
}

export function TacticalBattle({
  content,
  world,
  nationId,
  battle,
  onWorld,
  suspended = false,
}: Props) {
  const [mode, setMode] = useState("move");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const playback = useTacticalPlayback({
    content,
    world,
    battleId: battle.id,
    nationId,
    onWorld,
    suspended: suspended || paused,
  });
  const tactical = battle.tactical!;
  const side = nationId === battle.attackerId ? "attacker" : "defender";
  const view = tacticalView(
    content,
    tacticalPlaybackSnapshot(battle, playback.frame),
    side,
  );
  const deployment = tactical.phase === "deployment";
  const finished = tactical.phase === "finished";
  const actingUnit = tactical.units.find(
    (unit) => unit.id === tactical.activeUnitId,
  );
  const active = view.active;
  const selected = deployment ? view.selected : active;
  const commanded = selected?.side === side ? selected : undefined;
  const inspected = inspectedId
    ? view.units.find((unit) => unit.id === inspectedId)
    : selected;
  const inspectionVisible =
    !inspectedId || view.visibility.unitIds.has(inspectedId);
  const controlsLocked =
    playback.busy || playback.paused || finished || (!deployment && !commanded);
  const actions = tacticalActions(
    content,
    battle,
    controlsLocked ? null : (commanded?.id ?? null),
    mode,
    world,
  );
  const orders = tacticalOrders(content, world, battle, commanded?.id ?? null);
  const currentOrder = orders.find((order) => order.id === mode);
  const strategy = content.tactics.strategies.find(
    (entry) => entry.id === mode,
  );
  const activeType = content.units.find((entry) => entry.id === active?.typeId);

  useEffect(() => {
    setMode("move");
  }, [tactical.activeUnitId, tactical.activation]);

  useEffect(() => {
    if (!inspectionVisible) setInspectedId(null);
  }, [inspectionVisible]);

  const inspect = (id: string) => {
    if (!view.visibility.unitIds.has(id)) return;
    setInspectedId(id);
    setDetailsOpen(true);
  };
  const issueOrder = (id: string, instant: boolean) => {
    if (controlsLocked || !commanded) return;
    playback.clearMessage();
    if (instant) {
      playback.run((current) =>
        actTactical(
          content,
          current,
          battle.id,
          nationId,
          commanded.x,
          commanded.y,
          id,
        ),
      );
      setMode("move");
    } else setMode(id);
  };
  const onCell = (x: number, y: number) => {
    if (playback.busy || playback.paused) return;
    const target = visibleTacticalUnitAt(view.units, x, y);
    if (deployment && target?.side === side) {
      playback.run((current) =>
        selectTacticalUnit(current, battle.id, target.id, nationId),
      );
      setInspectedId(target.id);
      setMode("move");
    } else if (target && !actions.targets.has(target.id)) {
      inspect(target.id);
    } else if (!controlsLocked && (target || actions.moves.has(`${x},${y}`))) {
      playback.run((current) =>
        actTactical(
          content,
          current,
          battle.id,
          nationId,
          x,
          y,
          deployment ? "move" : mode,
        ),
      );
    }
  };
  const observedAction = tacticalActionObserved(
    content,
    battle,
    side,
    playback.frame,
  );
  const animationName =
    playback.frame && observedAction
      ? (
          {
            move: "行军",
            melee: "近战",
            shoot: "射击",
            strategy: "施计",
            guard: "固守",
            wait: "待命",
            skip: "受制",
            end: "行动结束",
          } as const
        )[playback.frame.action.kind]
      : "敌军行动";
  const status = finished
    ? "战斗结束"
    : deployment
      ? "战前布阵"
      : playback.paused
        ? "演进暂停"
        : playback.busy
          ? `${animationName}中`
          : active
            ? `${active.side === side ? "我军" : "敌军"} · ${activeType?.name ?? "部队"}`
            : actingUnit
              ? "敌军行动中"
              : "行动条积累中";
  const hint = finished
    ? tactical.winner === side
      ? "我军获胜，提交战果返回大地图。"
      : "战斗结束，提交战果整顿军队。"
    : playback.paused
      ? "时序与动画已暂停，继续演进后恢复。"
      : playback.busy
        ? "正在执行军令，完成后结算战果。"
        : deployment
          ? "选择己方兵牌，再点亮格布阵；浮窗可拖动或关闭。"
          : !actingUnit
            ? "各部队依主动性匀速积累行动条，先满者行动。"
            : actingUnit.side !== side
              ? "敌军正在行动，世界时间保持暂停。"
              : actions.reason ||
                strategy?.description ||
                (mode === "move"
                  ? "点击亮格行军；贴身无法移动。思考时行动条暂停。"
                  : mode === "melee"
                    ? "点击邻接敌军近战，对方仍有战力时反击。"
                    : mode === "shoot"
                      ? "点击射程内敌军射击；贴身无法射击。"
                      : "选择高亮目标执行军令。");

  return (
    <div className="battle-panel tactical-command-screen">
      <header className="tactical-heading">
        <div className="tactical-battle-title">
          <small>世界暂停 · 决战计一战略日</small>
          <h2>
            {
              content.scenario.settlements.find(
                (city) => city.id === battle.cityId,
              )?.name
            }
            会战
          </h2>
        </div>
        <div className="tactical-force-summary">
          {(["attacker", "defender"] as const).map((unitSide) => (
            <span key={unitSide} className={`force-${unitSide}`}>
              <small>
                {unitSide === "attacker" ? "攻" : "守"} ·{" "}
                {
                  content.scenario.nations.find(
                    (nation) =>
                      nation.id ===
                      (unitSide === "attacker"
                        ? battle.attackerId
                        : battle.defenderId),
                  )?.name
                }
              </small>
              <strong>{view.men[unitSide].toLocaleString()}</strong>
              {unitSide !== side && !finished && <small>已发现</small>}
            </span>
          ))}
        </div>
        <div className="tactical-current-status">
          <strong>{status}</strong>
          <small>
            {deployment
              ? "整顿阵列，准备出战"
              : active
                ? `本队第 ${active.activationCount} 次行动 · 行动力 ${active.actionPoints}/${active.maxActionPoints}`
                : actingUnit
                  ? "视野之外 · 敌情不明"
                  : "侦察视野内敌情"}
          </small>
        </div>
      </header>
      <nav className="tactical-toolbar" aria-label="战场菜单">
        <button
          type="button"
          aria-pressed={ordersOpen}
          onClick={() => setOrdersOpen(!ordersOpen)}
        >
          军令
        </button>
        <button
          type="button"
          aria-pressed={detailsOpen}
          onClick={() => {
            if (!detailsOpen) setInspectedId(selected?.id ?? null);
            setDetailsOpen(!detailsOpen);
          }}
        >
          部队情报
        </button>
        <button
          type="button"
          aria-pressed={timelineOpen}
          onClick={() => setTimelineOpen(!timelineOpen)}
        >
          行动顺序
        </button>
        <button
          type="button"
          aria-pressed={logOpen}
          onClick={() => setLogOpen(!logOpen)}
        >
          战场纪事
        </button>
        <span>共享视野 · 林丘遮蔽</span>
        {!deployment && !finished && (
          <button
            type="button"
            className="tactical-pause"
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? "▶ 继续演进" : "Ⅱ 暂停演进"}
          </button>
        )}
      </nav>
      <section className="tactical-field" aria-label="战场">
        <TacticalBoard
          content={content}
          battle={battle}
          side={side}
          actions={actions}
          modeName={currentOrder?.name ?? "行动"}
          frame={playback.frame}
          inspectedId={detailsOpen ? (inspected?.id ?? null) : null}
          disabled={playback.busy || playback.paused}
          onCell={onCell}
        />
        {ordersOpen && (
          <TacticalOrdersPanel
            content={content}
            world={world}
            battle={battle}
            unit={commanded}
            mode={mode}
            disabled={controlsLocked}
            onOrder={issueOrder}
            onClose={() => setOrdersOpen(false)}
          />
        )}
        {timelineOpen && (
          <TacticalTimeline
            content={content}
            battle={battle}
            side={side}
            frame={playback.frame}
            onInspect={inspect}
            onClose={() => setTimelineOpen(false)}
          />
        )}
        {detailsOpen && (
          <TacticalUnitInspector
            content={content}
            world={world}
            battle={battle}
            unit={inspected}
            onClose={() => setDetailsOpen(false)}
          />
        )}
        {logOpen && (
          <TacticalFloatingPanel
            className="tactical-record"
            title="战场纪事"
            onClose={() => setLogOpen(false)}
          >
            <div className="tactical-record-lines">
              {view.log.length === 0 && <p>暂无已观测的战场纪事。</p>}
              {view.log.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </TacticalFloatingPanel>
        )}
        {finished && (
          <div className="tactical-result-banner">
            <strong>{tactical.winner === side ? "胜" : "败"}</strong>
            <span>
              {tactical.winner === side
                ? "敌军已溃，战事告捷"
                : "我军失利，撤回整补"}
            </span>
          </div>
        )}
      </section>
      <footer className="tactical-footer">
        <div
          className={`tactical-order-hint${playback.message ? " order-error" : ""}`}
          role="status"
        >
          <b>{status}</b>
          <span>{playback.message || hint}</span>
        </div>
        <div className="tactical-footer-actions">
          {!finished && (
            <button
              type="button"
              className="tactical-retreat"
              disabled={playback.busy || playback.paused}
              onClick={() =>
                playback.run((current) =>
                  finishManualBattle(
                    content,
                    current,
                    battle.id,
                    nationId,
                    true,
                  ),
                )
              }
            >
              全军撤退
            </button>
          )}
          <button
            type="button"
            className="primary tactical-next-turn"
            disabled={
              playback.busy ||
              playback.paused ||
              (!deployment && !finished && !commanded)
            }
            onClick={() =>
              playback.run((current) =>
                finished
                  ? finishManualBattle(content, current, battle.id, nationId)
                  : endTacticalTurn(content, current, battle.id, nationId),
              )
            }
          >
            {finished
              ? tactical.winner === side
                ? "获胜 · 提交战果"
                : "战败 · 撤回整补"
              : deployment
                ? "完成部署 · 开战"
                : "结束本队行动 →"}
          </button>
        </div>
      </footer>
    </div>
  );
}
