import { useState } from "react";
import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import type { Army } from "../simulation/military-state";
import { canAttackCity } from "../simulation/geography";
import { diplomaticRelation } from "../simulation/diplomacy";
import { relationDescription } from "./diplomacy/presentation";
import type { RequestMapLocation } from "./map/useMapLocationSelection";
import {
  armySize,
  defenseQueue,
  marchArmy,
  marchDays,
  startAttack,
} from "../simulation/military";
import { armyStatusLabel, recentCombatRemaining } from "./militaryPresentation";

/** An attack freezes its expedition roster; domestic moves remain individual orders. */
export function AttackOrders({
  content,
  world,
  nationId,
  army,
  run,
  onRequestMapLocation,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
  army: Army;
  run: (command: () => WorldState) => void;
  onRequestMapLocation: RequestMapLocation;
}) {
  const [destination, setDestination] = useState("");
  const [selectedIds, setSelectedIds] = useState([army.id]);
  const armies = Object.values(world.military.armies).filter(
    (entry) => entry.nationId === nationId && armySize(entry) > 0,
  );
  const target =
    destination !== army.cityId ? world.settlements[destination] : undefined;
  const isAttack = !!target && target.owner !== nationId;
  const legalAttack =
    isAttack && canAttackCity(content, world, nationId, destination);
  const targetDefinition = content.scenario.settlements.find(
    (city) => city.id === destination,
  );
  const eligibleCityIds = content.scenario.settlements
    .filter(
      (city) =>
        city.id !== army.cityId &&
        (world.settlements[city.id].owner === nationId ||
          canAttackCity(content, world, nationId, city.id)),
    )
    .map((city) => city.id);
  const selected = armies.filter(
    (entry) => selectedIds.includes(entry.id) && entry.status === "idle",
  );
  const vulnerable = selected.flatMap((entry) =>
    entry.units.filter(
      (unit) => recentCombatRemaining(content, world, unit) > 0,
    ),
  );
  const currentQueue = isAttack ? defenseQueue(world, target.owner) : [];
  const attackableCount = eligibleCityIds.filter(
    (id) => world.settlements[id].owner !== nationId,
  ).length;
  const invalidTargetReason = (id: string) => {
    if (id === army.cityId) return "军团已驻扎在此城，请另选目标。";
    const owner = world.settlements[id]?.owner;
    if (
      owner &&
      owner !== nationId &&
      diplomaticRelation(content, world, nationId, owner) !== "hostile"
    )
      return `与该国当前关系为${relationDescription(content, world, nationId, owner)}。只有关系险恶（低于 −100）才允许出兵。`;
    return "目标城邑须与本国城邑有道路直接连接，请选择标亮的目标。";
  };

  return (
    <section className="attack-orders" aria-label="军团调度与出征">
      <div className="feature-heading">
        <h3>调度与出征</h3>
        <span>出征后不可增援</span>
      </div>
      <div className="destination-picker">
        <div>
          <small>目标城邑</small>
          <strong>
            {target
              ? `${targetDefinition?.name} · ${content.scenario.nations.find((nation) => nation.id === target.owner)?.name}国 · ${isAttack ? "进攻" : "调动"}`
              : "尚未指定"}
          </strong>
        </div>
        <button
          className="quiet"
          disabled={!eligibleCityIds.length || !!world.military.activeBattleId}
          onClick={() =>
            onRequestMapLocation({
              title: "选择调度或进攻目标",
              description:
                "点击标亮的城邑：己方城邑可调动；关系险恶且与本国有道路直连的外国城邑可进攻。选定后返回军府确认军令。",
              eligibleCityIds,
              invalidReason: invalidTargetReason,
              onSelect: setDestination,
            })
          }
        >
          {target ? "在大地图更换目标" : "到大地图选择目标"}
        </button>
      </div>
      {!eligibleCityIds.length && (
        <p className="campaign-note">当前没有可调动或进攻的目标。</p>
      )}
      {attackableCount === 0 && (
        <p className="campaign-note">
          暂无可进攻邻城。出兵要求与目标国关系险恶（低于
          −100），且两城有道路直连；可在外交中安排谴责声讨。
        </p>
      )}
      {isAttack ? (
        <>
          <fieldset className="army-picker">
            <legend>
              出征编组 · 已选 {selected.length} 军团 /{" "}
              {selected
                .reduce((sum, entry) => sum + armySize(entry), 0)
                .toLocaleString()}
              人
            </legend>
            {armies.map((entry) => (
              <label
                key={entry.id}
                className={entry.status !== "idle" ? "unavailable" : ""}
              >
                <input
                  type="checkbox"
                  checked={
                    selectedIds.includes(entry.id) && entry.status === "idle"
                  }
                  disabled={entry.status !== "idle"}
                  onChange={(e) =>
                    setSelectedIds((previous) =>
                      e.target.checked
                        ? [...previous, entry.id]
                        : previous.filter((id) => id !== entry.id),
                    )
                  }
                />
                <span>
                  <strong>{entry.name}</strong>
                  <small>
                    {armySize(entry).toLocaleString()}人 ·{" "}
                    {armyStatusLabel(entry)}
                    {entry.remainingDays > 0
                      ? ` · ${entry.remainingDays}日`
                      : ""}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="campaign-note">
            常规准备 {content.warfare.preparationDays} 日。
            {currentQueue.length
              ? `目标国已有 ${currentQueue.length} 场防守战，本次进攻将排第 ${currentQueue.length + 1} 位，准备最多先行至 ${Math.round(content.warfare.queuedProgressCap * 100)}%。`
              : "当前可直接推进决战准备。"}
          </p>
          <p className="campaign-note">
            出征、排队及返程期间额外维护 +
            {Math.round((content.warfare.expeditionUpkeepMultiplier - 1) * 100)}
            %；获胜或撤退后 {content.warfare.returnDays} 日回池。
          </p>
          {vulnerable.length > 0 && (
            <p className="military-warning">
              {vulnerable.length} 支部队近期参战，再出征将增加{" "}
              {Math.round(content.warfare.offensiveFatiguePerAttack * 100)}%
              进攻疲劳。准备与返程期间不会消除疲劳。
            </p>
          )}
          <button
            className="primary"
            disabled={
              !selected.length ||
              !legalAttack ||
              !!world.military.activeBattleId
            }
            onClick={() =>
              run(() =>
                startAttack(
                  content,
                  world,
                  nationId,
                  selected.map((entry) => entry.id),
                  destination,
                ),
              )
            }
          >
            发起进攻 · {selected.length} 军团
          </button>
          {!legalAttack && (
            <p className="military-warning">
              {invalidTargetReason(destination)}
            </p>
          )}
        </>
      ) : (
        <>
          {target && (
            <p className="campaign-note">
              {army.name} 调往己方城邑，预计{" "}
              {marchDays(content, world, army.id, destination)} 日抵达。
            </p>
          )}
          <button
            className="primary"
            disabled={
              army.status !== "idle" ||
              !target ||
              !army.units.length ||
              !!world.military.activeBattleId
            }
            onClick={() =>
              run(() =>
                marchArmy(content, world, nationId, army.id, destination),
              )
            }
          >
            调动军团
          </button>
        </>
      )}
    </section>
  );
}
