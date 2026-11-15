import { useState } from "react";
import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import {
  unitUnlocked,
  armySize,
  armyLimits,
  armyEfficiency,
  militaryStrength,
  militaryUpkeepBreakdown,
  equipmentDemand,
  createArmy,
  recruitRegiment,
  demobilizeRegiment,
  assignGeneral,
  reinforceArmy,
  professionalizeRegiment,
  maximumCadreRatio,
  transferRegiment,
  dismissArmy,
} from "../simulation/military";
import { calculateEconomy } from "../simulation/economy";
import { AttackOrders } from "./AttackOrders";
import type { RequestMapLocation } from "./map/useMapLocationSelection";
import {
  armyStatusLabel,
  fatigueRecoveryRemaining,
  recentCombatRemaining,
} from "./militaryPresentation";
import "./battle.css";
interface Props {
  content: Content;
  world: WorldState;
  nationId: string;
  onWorld: (world: WorldState) => void;
  onRequestMapLocation: RequestMapLocation;
}
export function MilitaryPanel({
  content,
  world,
  nationId,
  onWorld,
  onRequestMapLocation,
}: Props) {
  const armies = Object.values(world.military.armies).filter(
    (a) => a.nationId === nationId,
  );
  const [selected, setSelected] = useState("");
  const [typeId, setTypeId] = useState("levy");
  const [musterCity, setMusterCity] = useState("");
  const [message, setMessage] = useState("");
  const army = armies.find((a) => a.id === selected) ?? armies[0];
  const cities = content.scenario.settlements.filter(
    (c) => world.settlements[c.id].owner === nationId,
  );
  const limits = armyLimits(content, world, nationId);
  const supplies = calculateEconomy(content, world, nationId).available;
  const demands = equipmentDemand(content, world, nationId);
  const upkeep = militaryUpkeepBreakdown(content, world, nationId);
  const run = (fn: () => WorldState) => {
    try {
      onWorld(fn());
      setMessage("军令已下达。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  const type = content.units.find((t) => t.id === typeId) ?? content.units[0];
  return (
    <div className="military-panel feature-panel">
      <div className="feature-heading">
        <div>
          <small>兵府 · 编制与军备</small>
          <h2>全国军团</h2>
        </div>
        <div>
          <select
            aria-label="编组城镇"
            value={musterCity || cities[0]?.id || ""}
            onChange={(e) => setMusterCity(e.target.value)}
          >
            {cities.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            disabled={!cities.length}
            onClick={() =>
              run(() =>
                createArmy(
                  content,
                  world,
                  nationId,
                  musterCity || cities[0].id,
                ),
              )
            }
          >
            新编军团
          </button>
        </div>
      </div>
      <div className="military-stats">
        <span>
          军团{" "}
          <b>
            {armies.length} / {limits.armies}
          </b>
        </span>
        <span>
          可征人力{" "}
          <b>{Math.floor(world.nations[nationId].manpower).toLocaleString()}</b>
        </span>
        <span>
          普通月维护 <b>{upkeep.base.toFixed(1)} 粮</b>
        </span>
        <span>
          远征附加 <b>+{upkeep.expedition.toFixed(1)} 粮</b>
        </span>
        <span>
          月度军费 <b>{upkeep.total.toFixed(1)} 粮</b>
        </span>
      </div>
      <div className="military-columns">
        <aside className="army-list">
          {armies.map((a) => (
            <button
              key={a.id}
              className={a.id === army?.id ? "active" : ""}
              onClick={() => setSelected(a.id)}
            >
              <strong>⚑ {a.name}</strong>
              <span>
                {armySize(a).toLocaleString()}人 · {armyStatusLabel(a)}
              </span>
              <small>
                {
                  content.scenario.settlements.find((c) => c.id === a.cityId)
                    ?.name
                }
                {a.destination && a.destination !== a.cityId
                  ? ` → ${content.scenario.settlements.find((c) => c.id === a.destination)?.name}`
                  : ""}
                {a.remainingDays > 0 ? ` · ${a.remainingDays}日` : ""}
              </small>
            </button>
          ))}
        </aside>
        {army ? (
          <section className="army-detail">
            <div className="feature-heading">
              <h3>{army.name}</h3>
              <span>
                战力 {Math.round(militaryStrength(content, world, army))} · 编队{" "}
                {army.units.length}/{limits.units}
              </span>
            </div>
            <label>
              统军将领{" "}
              <select
                value={army.generalId ?? ""}
                disabled={army.status !== "idle"}
                onChange={(e) =>
                  run(() =>
                    assignGeneral(
                      world,
                      nationId,
                      army.id,
                      e.target.value || null,
                    ),
                  )
                }
              >
                <option value="">未指派 · 基础指挥</option>
                {Object.values(world.research.talents)
                  .filter(
                    (t) =>
                      t.nationId === nationId &&
                      t.role === "general" &&
                      t.recruitedMonth !== null,
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · 统率 {t.command}
                    </option>
                  ))}
              </select>
            </label>
            <p className="army-availability">
              {army.status === "returning"
                ? `正在返程，${army.remainingDays} 日后回到调度池。期间继续支付远征维护，不能参加防守。`
                : army.expedition
                  ? "军团已投入远征，准备和排队期间同样被占用。可在战役面板撤军，返程后重新调度。"
                  : army.status === "idle"
                    ? "军团已在调度池，可出征或编入防守计划。闲置时恢复士气与进攻疲劳。"
                    : `${armyStatusLabel(army)}${army.remainingDays ? `，尚需 ${army.remainingDays} 日` : ""}。`}
            </p>
            {armyEfficiency(content, world, army) < 0.99 && (
              <p className="military-warning">
                军备或编制超额：实际作战效率{" "}
                {Math.round(armyEfficiency(content, world, army) * 100)}
                %。增加供给或调整编制可恢复。
              </p>
            )}
            <div className="regiment-list">
              {army.units.map((u) => (
                <div className="regiment" key={u.id}>
                  <div>
                    <strong>
                      {content.units.find((t) => t.id === u.typeId)?.name}
                    </strong>
                    <small>
                      常备 {u.cadre} · 征召 {u.levy}
                    </small>
                    {(u.offensiveFatigue ?? 0) > 0 && (
                      <small
                        className="military-warning"
                        title="已有进攻疲劳在攻守战中均生效；只有回池休整才能消除"
                      >
                        进攻疲劳 −{Math.round((u.offensiveFatigue ?? 0) * 100)}%
                        · 需休整约 {fatigueRecoveryRemaining(content, u)} 日
                      </small>
                    )}
                    {recentCombatRemaining(content, world, u) > 0 && (
                      <small className="military-warning">
                        {recentCombatRemaining(content, world, u)}{" "}
                        日内再出征将叠加疲劳；防守不新增。
                      </small>
                    )}
                  </div>
                  <div>
                    <span>
                      士气 {Math.round(u.morale)} · 训练{" "}
                      {Math.round(u.training)}
                    </span>
                    <progress max="100" value={u.morale} />
                  </div>
                  <div className="regiment-actions">
                    <button
                      title={`常备比例上限 ${Math.round(maximumCadreRatio(content, world, nationId, u.typeId) * 100)}%`}
                      disabled={
                        army.status !== "idle" ||
                        u.cadre / (u.cadre + u.levy) >=
                          maximumCadreRatio(content, world, nationId, u.typeId)
                      }
                      onClick={() =>
                        run(() =>
                          professionalizeRegiment(
                            content,
                            world,
                            nationId,
                            army.id,
                            u.id,
                          ),
                        )
                      }
                    >
                      增训常备
                    </button>
                    <button
                      disabled={army.status !== "idle"}
                      onClick={() =>
                        run(() =>
                          demobilizeRegiment(
                            content,
                            world,
                            nationId,
                            army.id,
                            u.id,
                          ),
                        )
                      }
                    >
                      复员
                    </button>
                    <select
                      aria-label="调编部队"
                      value=""
                      disabled={army.status !== "idle"}
                      onChange={(e) =>
                        run(() =>
                          transferRegiment(
                            world,
                            nationId,
                            army.id,
                            e.target.value,
                            u.id,
                          ),
                        )
                      }
                    >
                      <option value="">调编至…</option>
                      {armies
                        .filter(
                          (a) =>
                            a.id !== army.id &&
                            a.cityId === army.cityId &&
                            a.status === "idle",
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              ))}
              {!army.units.length && (
                <p>
                  军团尚无部队，先征发或招募常备。
                  <button
                    onClick={() =>
                      run(() => dismissArmy(world, nationId, army.id))
                    }
                  >
                    裁撤空军团
                  </button>
                </p>
              )}
            </div>
            <div className="army-orders">
              <label>
                兵种{" "}
                <select
                  value={type?.id ?? ""}
                  onChange={(e) => setTypeId(e.target.value)}
                >
                  {content.units.map((t) => (
                    <option
                      key={t.id}
                      value={t.id}
                      disabled={
                        !!t.requires &&
                        !unitUnlocked(content, world, nationId, t.id)
                      }
                    >
                      {t.name}
                      {t.requires &&
                      !unitUnlocked(content, world, nationId, t.id)
                        ? " · 科技未解锁"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              {type && (
                <>
                  <p>{type.description}</p>
                  <small>
                    招募 {type.cost}粮 · 常备{type.cadre} / 征召{type.levy} ·
                    月维护{type.upkeep}粮
                  </small>
                  <button
                    disabled={army.status !== "idle"}
                    onClick={() =>
                      run(() =>
                        recruitRegiment(
                          content,
                          world,
                          nationId,
                          army.id,
                          type.id,
                        ),
                      )
                    }
                  >
                    征募部队
                  </button>
                </>
              )}
              <button
                disabled={army.status !== "idle"}
                onClick={() =>
                  run(() => reinforceArmy(content, world, nationId, army.id))
                }
              >
                补员整训
              </button>
            </div>
            <AttackOrders
              key={army.id}
              content={content}
              world={world}
              nationId={nationId}
              army={army}
              run={run}
              onRequestMapLocation={onRequestMapLocation}
            />
          </section>
        ) : (
          <p>尚无军团，可在本国城镇新编。</p>
        )}
      </div>
      <details className="equipment-ledger">
        <summary>全国军备供需</summary>
        <div className="military-stats">
          {Object.entries(demands).map(([id, n]) => (
            <span
              key={id}
              className={(supplies[id] ?? 0) < n ? "military-warning" : ""}
            >
              {content.goods.find((g) => g.id === id)?.name}{" "}
              <b>
                {(supplies[id] ?? 0).toFixed(1)} / {n.toFixed(1)}
              </b>
            </span>
          ))}
        </div>
        <small>前者为可供给额度，后者为现役需求。征召不占用专业军备。</small>
      </details>
      <p role="status" className="panel-message">
        {message}
      </p>
    </div>
  );
}
