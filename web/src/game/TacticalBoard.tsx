import type { CSSProperties } from "react";
import type { Content } from "../definitions/types";
import type { Battle } from "../simulation/military-state";
import {
  BOARD_COLUMNS,
  tacticalRows,
  tacticalTerrain,
  tacticalActions,
} from "../simulation/military-tactics";
import { TacticalUnitCard, tacticalStatusLabels } from "./TacticalUnitCard";
import {
  TacticalEffects,
  animatedTacticalPosition,
  tacticalTileCenter,
} from "./TacticalEffects";
import { TacticalMapViewport } from "./TacticalMapViewport";
import type { TacticalPlaybackFrame } from "./useTacticalPlayback";
import {
  tacticalMovementVisible,
  tacticalPlaybackSnapshot,
  tacticalView,
  visibleTacticalUnitAt,
} from "./tactical-view";

interface Props {
  content: Content;
  battle: Battle;
  side: "attacker" | "defender";
  actions: ReturnType<typeof tacticalActions>;
  modeName: string;
  frame: TacticalPlaybackFrame | null;
  inspectedId: string | null;
  disabled: boolean;
  onCell: (x: number, y: number) => void;
}

export function TacticalBoard({
  content,
  battle,
  side,
  actions,
  modeName,
  frame,
  inspectedId,
  disabled,
  onCell,
}: Props) {
  const tactical = battle.tactical!;
  const snapshot = tacticalPlaybackSnapshot(battle, frame);
  const view = tacticalView(content, snapshot, side);
  const rows = tacticalRows(battle);
  // Match reference C: odd columns sit half a tile lower (odd-q offset).
  const visualRows = rows + (BOARD_COLUMNS > 1 ? 0.5 : 0);
  const movingPosition =
    frame && tacticalMovementVisible(content, battle, side, frame)
      ? animatedTacticalPosition(frame, battle.id)
      : null;
  const movingUnit = movingPosition
    ? view.units.find((unit) => unit.id === frame?.action.unitId)
    : null;
  const focusedUnit = view.active ?? view.selected;
  return (
    <TacticalMapViewport
      columns={BOARD_COLUMNS}
      rows={visualRows}
      focusPoint={focusedUnit ? tacticalTileCenter(focusedUnit) : undefined}
    >
      <div
        className="tactical-map"
        aria-label="决战棋盘"
        style={
          {
            "--battle-columns": BOARD_COLUMNS,
            "--battle-rows": visualRows,
          } as CSSProperties
        }
      >
        {Array.from({ length: rows * BOARD_COLUMNS }, (_, index) => {
          const x = index % BOARD_COLUMNS;
          const y = Math.floor(index / BOARD_COLUMNS);
          const unit = visibleTacticalUnitAt(view.units, x, y);
          const visible = view.visibility.tiles.has(`${x},${y}`);
          const inMotion =
            unit &&
            frame?.action.unitId === unit.id &&
            (frame.action.kind === "move" ||
              (frame.action.kind === "melee" && !!movingPosition));
          const type = unit
            ? content.units.find((item) => item.id === unit.typeId)
            : undefined;
          const terrain = tacticalTerrain(content, battle, x, y);
          const terrainName =
            terrain === "forest"
              ? "林地"
              : terrain === "hill"
                ? "丘陵"
                : "平地";
          const coordinate = `${String.fromCharCode(65 + x)}${y + 1}`;
          const cost = actions.moves.get(`${x},${y}`);
          const target = unit ? actions.targets.has(unit.id) : false;
          const hostile = target && unit?.side !== side;
          const selected =
            unit?.id ===
            (tactical.phase === "deployment"
              ? tactical.selectedId
              : tactical.activeUnitId);
          const inspected = unit?.id === inspectedId;
          const hit =
            !!frame &&
            !!unit &&
            unit.id === frame.action.targetId &&
            frame.progress > 0.45 &&
            ["melee", "shoot", "strategy"].includes(frame.action.kind);
          const statuses = unit ? tacticalStatusLabels(unit) : [];
          const detail = [
            `${coordinate} · ${terrainName}`,
            visible ? "" : "视野之外 · 敌情不明",
            unit
              ? `${unit.side === side ? "己方" : "敌方"}${type?.name} · 常备 ${unit.cadre} / 征召 ${unit.levy} · 士气 ${Math.round(unit.morale)} · 行动力 ${unit.actionPoints}/${unit.maxActionPoints}`
              : cost !== undefined
                ? tactical.phase === "deployment"
                  ? "可部署"
                  : `可移动，消耗 ${cost} 行动力`
                : "",
            ...statuses,
            target ? `可${modeName}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              type="button"
              key={coordinate}
              className={`tactical-tile tile-${terrain}${visible ? "" : " tile-fogged"}${selected ? " tile-selected" : ""}${inspected ? " tile-inspected" : ""}${hit ? " tile-being-hit" : ""}${cost !== undefined ? " tile-reachable" : ""}${target ? (hostile ? " tile-enemy-target" : " tile-ally-target") : ""}`}
              aria-label={detail}
              style={
                {
                  left: `${(x * 100) / BOARD_COLUMNS}%`,
                  top: `${((y + (x % 2) * 0.5) * 100) / visualRows}%`,
                  width: `${100 / BOARD_COLUMNS}%`,
                  height: `${100 / visualRows}%`,
                  "--hit-shift":
                    hit && frame
                      ? `${Math.sin(frame.progress * 60) * (1 - frame.progress) * 8}px`
                      : "0px",
                } as CSSProperties
              }
              aria-pressed={selected}
              title={detail}
              aria-disabled={disabled}
              onClick={() => {
                if (!disabled) onCell(x, y);
              }}
            >
              <span className="tile-coordinate">{coordinate}</span>
              {cost !== undefined && !unit && (
                <span className="tile-path-cost">
                  {tactical.phase === "deployment" ? "·" : cost}
                </span>
              )}
              {unit && !inMotion && (
                <TacticalUnitCard
                  unit={unit}
                  type={type}
                  selected={selected}
                  deployment={tactical.phase === "deployment"}
                  active={unit.id === tactical.activeUnitId}
                />
              )}
              {target && (
                <span className="tile-target-mark">{hostile ? "⊕" : "+"}</span>
              )}
            </button>
          );
        })}
        {movingUnit && movingPosition && (
          <div
            className="tactical-moving-unit"
            style={{
              left: `${(movingPosition.x * 100) / BOARD_COLUMNS}%`,
              top: `${(movingPosition.y * 100) / visualRows}%`,
              width: `${100 / BOARD_COLUMNS}%`,
              height: `${100 / visualRows}%`,
            }}
          >
            <TacticalUnitCard
              unit={movingUnit}
              type={content.units.find(
                (entry) => entry.id === movingUnit.typeId,
              )}
              selected={true}
              deployment={tactical.phase === "deployment"}
              active={movingUnit.id === tactical.activeUnitId}
            />
          </div>
        )}
        <TacticalEffects
          content={content}
          frame={frame}
          battleId={battle.id}
          side={side}
          columns={BOARD_COLUMNS}
          rows={visualRows}
        />
      </div>
    </TacticalMapViewport>
  );
}
