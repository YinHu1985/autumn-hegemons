import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import type { Battle } from "../simulation/military-state";
import {
  armySize,
  assignBattleDefenders,
  availableGarrison,
  battleQueuePosition,
  battleStrength,
  resolveBattleNow,
  startManualBattle,
  withdrawBattle,
} from "../simulation/military";
import { armyStatusLabel } from "./militaryPresentation";

export function CampaignCard({
  content,
  world,
  nationId,
  battle,
  run,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
  battle: Battle;
  run: (command: () => WorldState) => void;
}) {
  const defending = battle.defenderId === nationId;
  const ready = battle.phase === "ready";
  const position = battleQueuePosition(world, battle);
  const waiting = position > 1;
  const cap = content.warfare.queuedProgressCap;
  const progress = Math.min(1, battle.elapsed / battle.preparationDays);
  const remaining = Math.max(0, battle.preparationDays - battle.elapsed);
  const city = content.scenario.settlements.find(
    (entry) => entry.id === battle.cityId,
  );
  const nationName = (id: string) =>
    content.scenario.nations.find((entry) => entry.id === id)?.name ?? id;
  const attackers = battle.attackerArmies
    .map((id) => world.military.armies[id])
    .filter(Boolean);
  const defenders = battle.defenderArmies
    .map((id) => world.military.armies[id])
    .filter(Boolean);
  const candidates = Object.values(world.military.armies).filter(
    (army) => army.nationId === nationId && armySize(army) > 0,
  );
  const garrison = ready
    ? battle.garrison
    : availableGarrison(content, world, battle);
  const attackPower = battleStrength(content, world, battle, "attacker");
  const defensePower = battleStrength(content, world, battle, "defender");
  const strengthRatio = attackPower / Math.max(1, attackPower + defensePower);
  const editPlan = (armyId: string, include: boolean) =>
    run(() =>
      assignBattleDefenders(
        content,
        world,
        battle.id,
        nationId,
        include
          ? [...battle.defenderArmies, armyId]
          : battle.defenderArmies.filter((id) => id !== armyId),
      ),
    );

  const actions = (
    <div className="ui-actions campaign-actions">
      <button
        className="primary"
        disabled={!ready}
        onClick={() =>
          run(() => startManualBattle(content, world, battle.id, nationId))
        }
      >
        亲自指挥
      </button>
      <button
        disabled={!ready}
        onClick={() =>
          run(() => resolveBattleNow(content, world, battle.id, nationId))
        }
      >
        自动决战
      </button>
      <button
        className="danger withdraw-order"
        title={
          defending
            ? "结束本次争夺，将城邑交给进攻方"
            : "放弃当前战果，出征军团进入返程"
        }
        onClick={() =>
          run(() => withdrawBattle(content, world, battle.id, nationId))
        }
      >
        {defending ? "放弃城邑" : "撤军回国"}
      </button>
    </div>
  );

  return (
    <article
      className={`campaign-card ${defending ? "defense-campaign" : "attack-campaign"} ${ready ? "campaign-ready" : ""}`}
    >
      <div className="feature-heading">
        <div>
          <small>
            {defending ? "本国防守" : "对外进攻"} ·{" "}
            {nationName(battle.attackerId)} → {nationName(battle.defenderId)}
          </small>
          <h3>{city?.name}之战</h3>
        </div>
        <span
          className={`campaign-phase ${ready ? "ready" : waiting ? "queued" : "preparing"}`}
        >
          {ready
            ? "决战待命"
            : waiting
              ? `防守序列 · 第 ${position} 场`
              : "当前战线"}
        </span>
      </div>

      <div className="campaign-progress-heading">
        <strong>
          {ready
            ? "双方阵容已锁定"
            : waiting && progress >= cap
              ? "集结完成 · 等待会战时机"
              : "决战准备"}
        </strong>
        <span>
          {Math.round(progress * 100)}% · {battle.elapsed}/
          {battle.preparationDays}日
        </span>
      </div>
      <div className="campaign-progress-track">
        <progress
          aria-label={`${city?.name}决战准备`}
          max={battle.preparationDays}
          value={battle.elapsed}
        />
        {waiting && (
          <i
            style={{ left: `${cap * 100}%` }}
            title={`排队期间最多准备至${Math.round(cap * 100)}%`}
          />
        )}
      </div>
      <p className="campaign-note">
        {ready
          ? "世界已暂停。选择亲自指挥、自动决战或撤退；战果将直接决定城邑归属。"
          : waiting
            ? `目标国正在应对前一场进攻，本军最多准备至 ${Math.round(cap * 100)}%。轮到本战后继续剩余准备，不会重新计时。`
            : `距决战还有 ${remaining} 日。防守方可在此期间编组迎战或放弃城邑。`}
      </p>

      {ready && actions}

      <div className="campaign-forces">
        <section>
          <span className="force-label">进攻军</span>
          <strong>
            {attackers
              .reduce((sum, army) => sum + armySize(army), 0)
              .toLocaleString()}
            人
          </strong>
          <small>
            {attackers.map((army) => army.name).join("、") || "无可用军团"}
          </small>
          <span>战力 {Math.round(attackPower).toLocaleString()}</span>
        </section>
        <span className="campaign-versus">对阵</span>
        <section>
          <span className="force-label">{ready ? "防守军" : "防守计划"}</span>
          <strong>
            {(
              defenders.reduce((sum, army) => sum + armySize(army), 0) +
              Math.floor(garrison)
            ).toLocaleString()}
            人
          </strong>
          <small>
            {defenders.map((army) => army.name).join("、") || "未指定军团"}
            {garrison > 0 ? " · 含地方守备" : ""}
          </small>
          <span>
            {ready ? "战力" : "当前可用战力"}{" "}
            {Math.round(defensePower).toLocaleString()}
          </span>
        </section>
      </div>
      <div
        className="campaign-strength"
        aria-label={`进攻战力${Math.round(attackPower)}，防守战力${Math.round(defensePower)}`}
      >
        <i style={{ width: `${strengthRatio * 100}%` }} />
      </div>
      <p className="campaign-note">
        地方守备 {Math.floor(garrison).toLocaleString()}人
        {ready ? "已从全国人力动员" : "预计可动员，决战时从全国人力征集"} ·
        守方战力含城防与地形优势。
      </p>

      {defending && !ready && (
        <details className="defense-plan" open={position === 1}>
          <summary>
            编组迎战 · 已指定 {battle.defenderArmies.length} 军团
          </summary>
          <p className="campaign-note">
            勾选后立即保存计划。可以预排返程军团；决战时仅已回池且空闲的部队参战，同一军团可预排多场防守。
          </p>
          <fieldset className="army-picker">
            <legend>迎战军团</legend>
            {candidates.map((army) => (
              <label
                key={army.id}
                className={army.status !== "idle" ? "unavailable" : ""}
              >
                <input
                  type="checkbox"
                  checked={battle.defenderArmies.includes(army.id)}
                  onChange={(e) => editPlan(army.id, e.target.checked)}
                />
                <span>
                  <strong>{army.name}</strong>
                  <small>
                    {armySize(army).toLocaleString()}人 ·{" "}
                    {armyStatusLabel(army)}
                    {army.remainingDays > 0
                      ? ` · 尚需${army.remainingDays}日`
                      : ""}
                    {army.status !== "idle" ? " · 当前不可参战" : ""}
                  </small>
                </span>
              </label>
            ))}
            {!candidates.length && (
              <p className="campaign-note">
                尚无在役军团，可前往军府征募。地方守备仍将在决战时迎敌。
              </p>
            )}
          </fieldset>
        </details>
      )}

      <div className="campaign-footer">
        <p className="campaign-note">
          {defending
            ? "防守不加远征维护；战后立即回池，伤亡与既有疲劳保留。"
            : `远征维护 +${Math.round((content.warfare.expeditionUpkeepMultiplier - 1) * 100)}%；结束或撤军后 ${content.warfare.returnDays} 日回池。`}
        </p>
        {!ready && actions}
      </div>
    </article>
  );
}
