import type { Content } from "../definitions/types";
import type { Battle } from "../simulation/military-state";
import {
  tacticalView,
  tacticalPlaybackSnapshot,
  type TacticalSide,
} from "./tactical-view";
import type { TacticalPlaybackFrame } from "./useTacticalPlayback";
import { unitGlyph } from "./TacticalUnitCard";
import { TacticalFloatingPanel } from "./TacticalFloatingPanel";

export function TacticalTimeline({
  content,
  battle,
  side,
  frame = null,
  onClose,
  onInspect,
}: {
  content: Content;
  battle: Battle;
  side: TacticalSide;
  frame?: TacticalPlaybackFrame | null;
  onClose: () => void;
  onInspect: (id: string) => void;
}) {
  const tactical = battle.tactical!;
  const { units, timeline, forecast } = tacticalView(
    content,
    tacticalPlaybackSnapshot(battle, frame),
    side,
  );
  const title = (id: string) => {
    const unit = units.find((item) => item.id === id)!;
    const name =
      content.units.find((item) => item.id === unit.typeId)?.name ??
      unit.typeId;
    return `${name} · ${String.fromCharCode(65 + unit.x)}${unit.y + 1}`;
  };
  return (
    <TacticalFloatingPanel
      className="tactical-timeline"
      title="行动顺序"
      onClose={onClose}
    >
      <div className="tactical-forecast" aria-label="预计行动次序">
        <small>预计先后</small>
        <div>
          {forecast.map((entry, index) => {
            const unit = units.find((item) => item.id === entry.unitId)!;
            const type = content.units.find((item) => item.id === unit.typeId);
            return (
              <button
                key={`${entry.unitId}-${index}`}
                className={`forecast-${unit.side}`}
                onClick={() => onInspect(unit.id)}
                title={`${index + 1}. ${title(unit.id)} · ${(entry.at - tactical.clock).toFixed(2)} 时序后`}
              >
                <small>{index + 1}</small>
                {unitGlyph(unit, type)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="tactical-timeline-scroll">
        <div
          className="tactical-timeline-rows"
          style={{ height: timeline.length * 55 }}
        >
          {timeline.map((entry, index) => {
            const unit = units.find((item) => item.id === entry.unitId)!;
            const type = content.units.find((item) => item.id === unit.typeId);
            return (
              <button
                key={entry.unitId}
                onClick={() => onInspect(entry.unitId)}
                className={`tactical-timeline-row timeline-${unit.side}${entry.current ? " timeline-current" : ""}`}
                style={{ transform: `translateY(${index * 55}px)` }}
                title={`主动性 ${entry.initiative.toFixed(1)} · 距下次行动 ${entry.timeUntilAction.toFixed(2)} 时序`}
              >
                <span className="timeline-unit-glyph">
                  {unitGlyph(unit, type)}
                </span>
                <span className="timeline-unit-label">
                  <strong>{title(unit.id)}</strong>
                  <small>
                    {entry.current
                      ? "正在行动"
                      : `剩余 ${entry.remaining.toFixed(0)} · 主动性 ${entry.initiative.toFixed(0)}`}
                  </small>
                  <span
                    className="timeline-meter"
                    role="progressbar"
                    aria-label={`${title(unit.id)}累计行动条`}
                    aria-valuemin={0}
                    aria-valuemax={content.tactics.actionThreshold}
                    aria-valuenow={Number(entry.progress.toFixed(1))}
                  >
                    <i
                      style={{
                        width: `${Math.min(100, (entry.progress / content.tactics.actionThreshold) * 100)}%`,
                      }}
                    />
                  </span>
                </span>
                <b className="timeline-progress">
                  {Math.round(entry.progress)}
                  <small>/{content.tactics.actionThreshold}</small>
                </b>
              </button>
            );
          })}
        </div>
      </div>
      <p className="tactical-float-note">
        按剩余行动条排序 · 主动性影响积累速度
        <br />
        仅推演已发现部队；侦察与战损会改变次序
      </p>
    </TacticalFloatingPanel>
  );
}
