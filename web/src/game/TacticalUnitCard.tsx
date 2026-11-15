import type { UnitDefinition } from "../definitions/military";
import type { TacticalUnit } from "../simulation/military-state";

export function unitGlyph(unit: TacticalUnit, type?: UnitDefinition) {
  if (type?.category === "ranged") return "弩";
  if (type?.category === "cavalry") return "骑";
  if (type?.category === "chariot") return "车";
  if (type?.category === "siege") return "械";
  return unit.cadre ? "甲" : "卒";
}

export function tacticalStatusLabels(unit: TacticalUnit) {
  const labels = (unit.statuses ?? []).map((status) =>
    status.kind === "doubt"
      ? `疑兵 ${status.remainingActivations} 次行动`
      : `挑衅 ${status.remainingActivations} 次行动`,
  );
  if (unit.guarding) labels.push("固守");
  return labels;
}

/** A raised banner on a terrain tile, rather than coloring the entire tile. */
export function TacticalUnitCard({
  unit,
  type,
  selected,
  deployment,
  active = false,
}: {
  unit: TacticalUnit;
  type?: UnitDefinition;
  selected: boolean;
  deployment: boolean;
  active?: boolean;
}) {
  const statuses = tacticalStatusLabels(unit);
  return (
    <span
      className={`tactical-piece piece-${unit.side}${selected ? " piece-selected" : ""}${active ? " piece-active" : ""}`}
    >
      <span className="piece-shadow" />
      <span className="piece-standard">{unitGlyph(unit, type)}</span>
      <span className="piece-readout">
        <span>{unit.cadre + unit.levy}</span>
        <span className="piece-morale">
          <i style={{ width: `${Math.max(0, Math.min(100, unit.morale))}%` }} />
        </span>
      </span>
      {!deployment && active && (
        <span className="piece-action-points">{unit.actionPoints}</span>
      )}
      {statuses.length > 0 && (
        <span className="piece-status">{statuses[0].split(" ")[0]}</span>
      )}
    </span>
  );
}
