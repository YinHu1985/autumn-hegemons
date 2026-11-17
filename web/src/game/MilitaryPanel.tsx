import { useState } from "react";
import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import {
  armySize,
  armyLimits,
  armyEfficiency,
  militaryStrength,
  militaryUpkeepBreakdown,
  equipmentDemand,
  createArmy,
  assignGeneral,
} from "../simulation/military";
import { calculateEconomy } from "../simulation/economy";
import type { RequestMapLocation } from "./map/useMapLocationSelection";
import { armyStatusLabel } from "./militaryPresentation";
import { RegimentRoster } from "./military/RegimentRoster";
import { ArmyOrders } from "./military/ArmyOrders";
import "./battle.css";
import "./military/military.css";
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
    (entry) => entry.nationId === nationId,
  );
  const [selected, setSelected] = useState("");
  const [musterCity, setMusterCity] = useState("");
  const [message, setMessage] = useState("");
  const army = armies.find((entry) => entry.id === selected) ?? armies[0];
  const cities = content.scenario.settlements.filter(
    (city) => world.settlements[city.id].owner === nationId,
  );
  const cityName = (id: string) =>
    content.scenario.settlements.find((city) => city.id === id)?.name ?? id;
  const musterCityId = cities.some((city) => city.id === musterCity)
    ? musterCity
    : (cities[0]?.id ?? "");
  const limits = armyLimits(content, world, nationId);
  const supplies = calculateEconomy(content, world, nationId).available;
  const demands = equipmentDemand(content, world, nationId);
  const upkeep = militaryUpkeepBreakdown(content, world, nationId);
  const run = (command: () => WorldState) => {
    try {
      onWorld(command());
      setMessage("军令已下达。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const newArmy = () =>
    run(() => {
      const next = createArmy(content, world, nationId, musterCityId);
      const created = Object.values(next.military.armies).find(
        (entry) => !world.military.armies[entry.id],
      );
      if (created) setSelected(created.id);
      return next;
    });
  return (
    <div className="military-panel feature-panel">
      <div className="military-stats" aria-label="全国军备概况">
        <span>
          军团编制{" "}
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
        <aside className="military-rail" aria-label="军团名录">
          <header className="ui-section-heading">
            <h3>军团名录</h3>
            <span>{armies.length} 军</span>
          </header>
          <div className="army-list">
            {armies.map((entry) => (
              <button
                key={entry.id}
                aria-pressed={entry.id === army?.id}
                className={entry.id === army?.id ? "active" : ""}
                onClick={() => {
                  setSelected(entry.id);
                  setMessage("");
                }}
              >
                <strong>{entry.name}</strong>
                <span>
                  {armySize(entry).toLocaleString()}人{" "}
                  <em>{armyStatusLabel(entry)}</em>
                </span>
                <small>
                  {cityName(entry.cityId)}
                  {entry.destination && entry.destination !== entry.cityId
                    ? ` → ${cityName(entry.destination)}`
                    : ""}
                  {entry.remainingDays > 0 ? ` · ${entry.remainingDays}日` : ""}
                </small>
              </button>
            ))}
            {!armies.length && (
              <p className="ui-note">尚无军团，请在下方选择城邑新编。</p>
            )}
          </div>
          <section className="army-muster" aria-label="新编军团">
            <label className="army-field">
              <span>编组城镇</span>
              <select
                aria-label="编组城镇"
                value={musterCityId}
                onChange={(event) => setMusterCity(event.target.value)}
              >
                {cities.map((city) => (
                  <option value={city.id} key={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={!cities.length} onClick={newArmy}>
              ＋ 新编军团
            </button>
            <small>先编军团，再征募部队。</small>
          </section>
        </aside>
        {army ? (
          <section className="army-detail" aria-label={`${army.name}军团档案`}>
            <header className="army-dossier-heading">
              <div>
                <small>
                  {cityName(army.cityId)}驻军 · {armyStatusLabel(army)}
                </small>
                <h2>{army.name}</h2>
              </div>
              <div className="army-dossier-numbers">
                <span>
                  战力{" "}
                  <b>
                    {Math.round(
                      militaryStrength(content, world, army),
                    ).toLocaleString()}
                  </b>
                </span>
                <span>
                  编队{" "}
                  <b>
                    {army.units.length} / {limits.units}
                  </b>
                </span>
              </div>
              <label className="army-field army-general">
                <span>统军将领</span>
                <select
                  value={army.generalId ?? ""}
                  disabled={army.status !== "idle"}
                  onChange={(event) =>
                    run(() =>
                      assignGeneral(
                        world,
                        nationId,
                        army.id,
                        event.target.value || null,
                      ),
                    )
                  }
                >
                  <option value="">未指派 · 基础指挥</option>
                  {Object.values(world.research.talents)
                    .filter(
                      (talent) =>
                        talent.nationId === nationId &&
                        talent.role === "general" &&
                        talent.recruitedMonth !== null,
                    )
                    .map((talent) => (
                      <option key={talent.id} value={talent.id}>
                        {talent.name} · 统率 {talent.command}
                      </option>
                    ))}
                </select>
              </label>
            </header>
            <p className="army-availability">
              {army.status === "returning"
                ? `正在返程，${army.remainingDays} 日后回到调度池。期间继续支付远征维护，不能参加防守。`
                : army.expedition
                  ? "军团已投入远征，准备和排队期间同样被占用。可在战役面板撤军，返程后重新调度。"
                  : army.status === "idle"
                    ? "军团可出征或编入防守计划，闲置时恢复士气与进攻疲劳。"
                    : `${armyStatusLabel(army)}${army.remainingDays ? `，尚需 ${army.remainingDays} 日` : ""}。`}
            </p>
            {armyEfficiency(content, world, army) < 0.99 && (
              <p className="military-warning ui-note">
                军备或编制超额：实际作战效率{" "}
                {Math.round(armyEfficiency(content, world, army) * 100)}
                %。增加供给或调整编制可恢复。
              </p>
            )}
            <div className="army-management">
              <RegimentRoster
                content={content}
                world={world}
                nationId={nationId}
                army={army}
                armies={armies}
                run={run}
              />
              <ArmyOrders
                key={army.id}
                content={content}
                world={world}
                nationId={nationId}
                army={army}
                run={run}
                onRequestMapLocation={onRequestMapLocation}
              />
            </div>
          </section>
        ) : (
          <div className="ui-empty military-empty">
            <strong>兵府待建</strong>
            <p>从左侧选择本国城邑，新编第一支军团。</p>
          </div>
        )}
      </div>
      <details className="equipment-ledger">
        <summary>
          全国军备供需 <span>可供给额度 / 现役需求</span>
        </summary>
        <div className="equipment-grid">
          {Object.entries(demands).map(([id, amount]) => (
            <div
              key={id}
              className={(supplies[id] ?? 0) < amount ? "military-warning" : ""}
            >
              <span>{content.goods.find((good) => good.id === id)?.name}</span>
              <b>
                {(supplies[id] ?? 0).toFixed(1)} / {amount.toFixed(1)}
              </b>
            </div>
          ))}
        </div>
        {!Object.keys(demands).length && (
          <p className="ui-note">当前部队没有专业军备需求。</p>
        )}
        <small>征召兵不占用专业军备额度。</small>
      </details>
      {message && (
        <p role="status" className="panel-message">
          {message}
        </p>
      )}
    </div>
  );
}
