import { useState } from "react";
import { CATEGORY_NAMES } from "../definitions/research";
import {
  assignTalent,
  recruitTalent,
  refreshTalentPool,
  type TalentRole,
} from "../simulation/research";
import type { ResearchPanelProps } from "./ResearchShared";
import "./research.css";
const ROLE_NAMES: Record<TalentRole, string> = {
  idle: "待命",
  advisor: "顾问",
  general: "将领",
  research: "科研",
  envoy: "使者",
};
export function TalentPanel({
  content,
  world,
  nationId,
  onWorld,
}: ResearchPanelProps) {
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const talents = Object.values(world.research.talents).filter(
    (t) => t.nationId === nationId,
  );
  const run = (fn: () => typeof world) => {
    try {
      onWorld(fn());
      setMessage("人才任命已更新。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="research-panel">
      <header className="research-heading">
        <div>
          <small>择贤而任</small>
          <h2>人才馆</h2>
        </div>
        <button onClick={() => run(() => refreshTalentPool(world, nationId))}>
          访贤 · 15粮
        </button>
      </header>
      <p className="research-fineprint">
        同一人可在空闲时调任。每三年自动更新招募池；招募满二十年后逐月判定退场。顾问常规席位为2，超额会降低顾问效率。
        使者在外交界面领取任务，出使期间不能调任；目前能力值不影响外交效果。
      </p>
      <div className="research-toolbar">
        {[
          ["all", "全部"],
          ["candidate", "待招募"],
          ...Object.entries(ROLE_NAMES),
        ].map(([id, name]) => (
          <button
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
            key={id}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="talent-grid">
        {talents
          .filter(
            (t) =>
              filter === "all" ||
              (filter === "candidate"
                ? t.recruitedMonth === null
                : t.recruitedMonth !== null && t.role === filter),
          )
          .map((t) => {
            const mission = world.diplomacy?.missions.find(
              (entry) => entry.envoyId === t.id,
            );
            const destination =
              mission &&
              content.scenario.nations.find(
                (nation) => nation.id === mission.targetNationId,
              );
            const action =
              mission &&
              content.diplomacy.actions.find(
                (entry) => entry.id === mission.actionId,
              );
            return (
              <article className="talent-card" key={t.id}>
                <div className="talent-identity">
                  <img
                    src={`${import.meta.env.BASE_URL}${t.portrait}`}
                    alt={`${t.name}像`}
                  />
                  <div>
                    <small>
                      {t.recruitedMonth === null
                        ? "游士待聘"
                        : ROLE_NAMES[t.role]}
                    </small>
                    <h3>{t.name}</h3>
                    <span>{CATEGORY_NAMES[t.specialty]}专长</span>
                  </div>
                </div>
                {mission && (
                  <div
                    className="talent-mission"
                    aria-label={`${t.name}出使进度`}
                  >
                    <strong>
                      出使{destination?.name} · {action?.name ?? "外交任务"}
                    </strong>
                    <span>
                      尚余 {mission.remainingDays} 日 · 出使期间不可调任
                    </span>
                    <progress
                      aria-label={`${t.name}外交任务进度`}
                      value={mission.totalDays - mission.remainingDays}
                      max={mission.totalDays}
                    />
                  </div>
                )}
                <div className="talent-stats">
                  {[
                    ["统率", t.command],
                    ["武勇", t.martial],
                    ["治政", t.administration],
                    ["学识", t.scholarship],
                  ].map(([name, value]) => (
                    <div key={String(name)}>
                      <span>{name}</span>
                      <b>{value}</b>
                      <i style={{ width: `${value}%` }} />
                    </div>
                  ))}
                </div>
                {t.recruitedMonth === null ? (
                  <button
                    className="primary"
                    onClick={() =>
                      run(() => recruitTalent(world, nationId, t.id))
                    }
                  >
                    招募 · 10粮
                  </button>
                ) : (
                  <div className="talent-roles">
                    {Object.entries(ROLE_NAMES).map(([role, name]) => (
                      <button
                        className={t.role === role ? "active" : ""}
                        disabled={t.role === role || t.busy}
                        title={
                          t.busy
                            ? "正在执行任务，完成或取消任务后可调任"
                            : undefined
                        }
                        key={role}
                        onClick={() =>
                          run(() =>
                            assignTalent(
                              world,
                              nationId,
                              t.id,
                              role as TalentRole,
                            ),
                          )
                        }
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
      </div>
      <p className="research-feedback" role="status">
        {message}
      </p>
    </section>
  );
}
