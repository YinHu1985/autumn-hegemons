import type { Content } from "../definitions/types";
import type { Battle, TacticalUnit } from "../simulation/military-state";
import type { WorldState } from "../simulation/state";
import {
  tacticalActions,
  tacticalInitiative,
  tacticalVisionRange,
} from "../simulation/military-tactics";
import { tacticalStatusLabels, unitGlyph } from "./TacticalUnitCard";
import { TacticalFloatingPanel } from "./TacticalFloatingPanel";

export function TacticalUnitInspector({
  content,
  world,
  battle,
  unit,
  onClose,
}: {
  content: Content;
  world: WorldState;
  battle: Battle;
  unit?: TacticalUnit;
  onClose: () => void;
}) {
  const type = content.units.find((entry) => entry.id === unit?.typeId);
  const army = unit?.armyId ? world.military.armies[unit.armyId] : null;
  const general = army?.generalId
    ? world.research.talents[army.generalId]
    : null;
  const actions = tacticalActions(
    content,
    battle,
    unit?.id ?? null,
    "move",
    world,
  );
  return (
    <TacticalFloatingPanel
      className="tactical-inspector"
      title="部队情报"
      onClose={onClose}
    >
      {unit ? (
        <>
          <div className="tactical-inspector-title">
            <span className={`detail-standard detail-${unit.side}`}>
              {unitGlyph(unit, type)}
            </span>
            <div>
              <small>{army?.name ?? "地方征召"}</small>
              <h3>{type?.name ?? unit.typeId}</h3>
            </div>
            <strong>
              {(unit.cadre + unit.levy).toLocaleString()}
              <small>兵力</small>
            </strong>
          </div>
          <p className="tactical-command-source">
            {general
              ? `军团统帅 ${general.name} · 统率 ${general.command}`
              : army
                ? "军团尚未任命统帅"
                : "本地守备 · 无军团统帅"}
          </p>
          <div className="tactical-unit-stats">
            {[
              ["常备", unit.cadre],
              ["征召", unit.levy],
              ["士气", Math.round(unit.morale)],
              ["训练", Math.round(unit.training)],
              ["主动性", tacticalInitiative(content, unit).toFixed(1)],
              ["射程", `${type?.range ?? 1} 格`],
              ["视野", `${tacticalVisionRange(content, unit)} 格`],
              ["行动力", `${unit.actionPoints} / ${unit.maxActionPoints}`],
              ["已行动", `${unit.activationCount} 次`],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="tactical-float-note">
            {[
              actions.engaged ? "贴身牵制 · 无法移动、射击" : "未被敌军牵制",
              ...tacticalStatusLabels(unit),
              unit.strategyUsed ? "本次行动已施计" : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      ) : (
        <p className="tactical-deployment-help">
          点击兵牌或行动顺序中的部队查看情报。
        </p>
      )}
    </TacticalFloatingPanel>
  );
}
