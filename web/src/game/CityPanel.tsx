import { formatModifier } from "../definitions/modifiers";
import { useState } from "react";
import "./city-panel.css";
import type { Content, SettlementStart } from "../definitions/types";
import type {
  NationState,
  SettlementState,
  WorldState,
} from "../simulation/state";
import {
  canBuildSpecialty,
  startConstruction,
  startExpansion,
} from "../simulation/commands";
import {
  buildingCapacity,
  constructionQuote,
  terrainNames,
} from "../simulation/settlements";
import { hasTechnology } from "../simulation/research";
interface Props {
  content: Content;
  world: WorldState;
  city: SettlementState;
  cityStart: SettlementStart;
  nation: NationState;
  playerNationId: string;
  onWorld: (w: WorldState) => void;
}
export function CityPanel({
  content,
  world,
  city,
  cityStart,
  nation,
  playerNationId,
  onWorld,
}: Props) {
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"buildings" | "construction">("buildings");
  const own = city.owner === playerNationId;
  const quote = constructionQuote(content, world, city.id, "__expand");
  const scene =
    cityStart.map.x < 800
      ? "northwest"
      : cityStart.map.y > 700
        ? "jiangnan"
        : cityStart.map.y < 330
          ? "north"
          : null;
  const run = (fn: () => WorldState) => {
    try {
      onWorld(fn());
      setMessage("政令已下达。");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const goodName = (id: string) =>
    content.goods.find((g) => g.id === id)?.name ?? id;
  return (
    <aside className="city-inspector parchment" aria-label="城镇详情">
      <div className="city-scene">
        <img
          src={`${import.meta.env.BASE_URL}assets/${scene ? `cities/${scene}.webp` : "central-city.webp"}`}
          alt="城邑风景"
        />
        <span>
          {content.scenario.nations.find((n) => n.id === city.owner)?.name}国 ·{" "}
          {content.terrains.find((t) => t.id === cityStart.terrain)?.name ??
            terrainNames[cityStart.terrain] ??
            cityStart.terrain}
        </span>
        <strong>{cityStart.name}</strong>
      </div>
      <div className="inspector-content">
        <div className="inspector-title">
          <div>
            <small>{own ? "领内城邑" : "列国城邑"}</small>
            <h2>{cityStart.name}</h2>
          </div>
          <span>规模 {city.scale}</span>
        </div>
        <p className="city-specialty">
          特产 ·{" "}
          {content.specialties.find((s) => s.id === cityStart.specialty)
            ?.name ?? cityStart.specialty}
        </p>
        <div className="inspector-facts">
          <div>
            <span>治理效率</span>
            <strong>{Math.round(city.governance * 100)}%</strong>
          </div>
          <div>
            <span>建筑 / 容量</span>
            <strong>
              {Object.keys(city.buildings).length} / {buildingCapacity(city)}
            </strong>
          </div>
        </div>
        <div className="governance-track">
          <i style={{ width: `${city.governance * 100}%` }} />
        </div>
        {own && (
          <button
            className="expand-city"
            disabled={
              !!city.construction ||
              city.scale >= 7 ||
              nation.treasury < quote.cost
            }
            onClick={() => run(() => startExpansion(content, world, city.id))}
          >
            扩建城邑{" "}
            <small>
              {quote.cost} 粮 · {quote.days} 日
            </small>
          </button>
        )}
        {city.construction && (
          <p className="construction-note">
            ⚒{" "}
            {city.construction.buildingId === "__expand"
              ? "扩建城邑"
              : content.buildings.find(
                  (b) => b.id === city.construction?.buildingId,
                )?.name}
            <strong>尚需 {city.construction.remainingDays} 日</strong>
          </p>
        )}
        <div className="inspector-tabs">
          <button
            className={tab === "buildings" ? "active" : ""}
            onClick={() => setTab("buildings")}
          >
            城内设施
          </button>
          {own && (
            <button
              className={tab === "construction" ? "active" : ""}
              onClick={() => setTab("construction")}
            >
              营建工程
            </button>
          )}
        </div>
        <div className="city-building-scroll">
          {tab === "buildings" || !own ? (
            <div className="inspector-list">
              {Object.entries(city.buildings).map(([id, state]) => {
                const b = content.buildings.find((b) => b.id === id)!;
                const level = b.levels[state.level - 1];
                return (
                  <article className="city-building" key={id}>
                    <div>
                      <b>
                        {state.level === 1
                          ? ""
                          : state.level === 2
                            ? "改良"
                            : "先进"}
                        {b.name}
                      </b>
                      <span>{"◆".repeat(state.level)}</span>
                    </div>
                    <p>
                      {Object.entries(level.outputs)
                        .map(([id, q]) => `${goodName(id)} +${q}`)
                        .join(" · ") ||
                        Object.entries(level.modifiers ?? {})
                          .map(([key, value]) => formatModifier(key, value))
                          .join(" · ")}
                    </p>
                    <small>
                      维护 {level.upkeep} 粮 / 月
                      {state.effectiveLevel < state.level
                        ? " · 新等级下月生效"
                        : ""}
                    </small>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="construction-list">
              {content.buildings
                .filter((b) => canBuildSpecialty(b, cityStart.specialty))
                .map((b) => {
                  const level = city.buildings[b.id]?.level ?? 0;
                  if (level >= b.levels.length) return null;
                  const next = b.levels[level];
                  const cost = constructionQuote(content, world, city.id, b.id);
                  const tech =
                    next.technology &&
                    !hasTechnology(world, city.owner, next.technology)
                      ? content.technologies.find(
                          (t) => t.id === next.technology,
                        )?.name
                      : null;
                  return (
                    <button
                      key={b.id}
                      disabled={
                        !!city.construction ||
                        !!tech ||
                        nation.treasury < cost.cost
                      }
                      onClick={() =>
                        run(() =>
                          startConstruction(content, world, city.id, b.id),
                        )
                      }
                    >
                      <span>
                        <b>
                          {level ? "升级 · " : ""}
                          {b.name}
                        </b>
                        <small>
                          {tech
                            ? `需研究：${tech}`
                            : `${cost.cost} 粮 · ${cost.days} 日`}
                        </small>
                      </span>
                      <em>{level + 1}阶</em>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
        {message && (
          <p className="panel-message" role="status">
            {message}
          </p>
        )}
        {!own && (
          <p className="foreign-note">
            与该国处于战争状态。可在军府选择军团，向此城进军。
          </p>
        )}
      </div>
    </aside>
  );
}
