import { CATEGORY_NAMES } from "../../definitions/research";
import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import type { Talent } from "../../simulation/research-state";
import { assignTalent, recruitTalent } from "../../simulation/research";
import { TALENT_ROLES, talentRoleName } from "./talent-view";

export function TalentDossier({
  content,
  world,
  nationId,
  talent,
  run,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
  talent: Talent;
  run: (command: () => WorldState, notice: string) => void;
}) {
  const candidate = talent.recruitedMonth === null;
  const mission = world.diplomacy.missions.find(
    (entry) => entry.envoyId === talent.id,
  );
  const destination =
    mission &&
    content.scenario.nations.find(
      (nation) => nation.id === mission.targetNationId,
    );
  const action =
    mission &&
    content.diplomacy.actions.find((entry) => entry.id === mission.actionId);
  const group = world.research.nations[nationId].groups.find(
    (entry) => entry.leaderId === talent.id,
  );
  const subject =
    group && content.technologies.find((entry) => entry.id === group.targetId);
  const army = Object.values(world.military.armies).find(
    (entry) => entry.generalId === talent.id,
  );
  const locked = talent.busy || !!group || (!!army && army.status !== "idle");
  return (
    <article className="talent-dossier" aria-label={`${talent.name}人才档案`}>
      <header className="talent-dossier-identity">
        <img
          src={`${import.meta.env.BASE_URL}${talent.portrait}`}
          alt={`${talent.name}像`}
        />
        <div>
          <span className="ui-badge">
            {candidate ? "游士待聘" : talentRoleName(talent.role)}
          </span>
          <h2>{talent.name}</h2>
          <p>{CATEGORY_NAMES[talent.specialty]}专长</p>
        </div>
        <div className="talent-availability">
          <span>
            {candidate ? "尚未入仕" : locked ? "正在任事" : "可随时调任"}
          </span>
          <small>
            {candidate
              ? "招募后可安排职务"
              : army
                ? `统领${army.name}`
                : group
                  ? `主持${subject?.name ?? "课题"}`
                  : mission
                    ? `出使${destination?.name ?? "列国"}`
                    : "已列入本国人才名录"}
          </small>
        </div>
      </header>
      <section className="talent-abilities" aria-label={`${talent.name}能力`}>
        {[
          ["统率", talent.command],
          ["武勇", talent.martial],
          ["治政", talent.administration],
          ["学识", talent.scholarship],
        ].map(([name, value]) => (
          <div key={String(name)}>
            <span>{name}</span>
            <strong>{value}</strong>
            <progress
              max="100"
              value={Number(value)}
              aria-label={`${talent.name}${name}`}
            />
          </div>
        ))}
      </section>
      {mission && (
        <section
          className="ui-section talent-current-task"
          aria-label={`${talent.name}出使进度`}
        >
          <div className="ui-section-heading">
            <h3>出使{destination?.name}</h3>
            <span>尚余 {mission.remainingDays} 日</span>
          </div>
          <p>{action?.name ?? "外交任务"} · 出使期间不可调任</p>
          <progress
            aria-label={`${talent.name}外交任务进度`}
            value={mission.totalDays - mission.remainingDays}
            max={mission.totalDays}
          />
        </section>
      )}
      {group && (
        <p className="ui-note">
          正在主持「{subject?.name ?? "课题"}
          」。请先在科研界面结束课题，再安排新职务。
        </p>
      )}
      {!!army && army.status !== "idle" && (
        <p className="ui-note">
          军团正在出征、调动或休整，回到调度池后可调任。
        </p>
      )}
      <section className="talent-appointment ui-section" aria-label="职务安排">
        <header className="ui-section-heading">
          <h3>{candidate ? "延揽入仕" : "职务安排"}</h3>
          <small>{candidate ? "一次招募，四方任用" : "空闲时可直接调任"}</small>
        </header>
        {candidate ? (
          <>
            <p>延揽入仕后，可任顾问、将领、科研人才或使者。</p>
            <div className="ui-actions">
              <small>招募后先进入待命名录</small>
              <button
                className="primary"
                disabled={world.nations[nationId].treasury < 10}
                onClick={() =>
                  run(
                    () => recruitTalent(world, nationId, talent.id),
                    `${talent.name}已入仕，可安排职务。`,
                  )
                }
              >
                招募 · 10粮
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="talent-role-options">
              {TALENT_ROLES.map((role) => (
                <button
                  key={role.id}
                  className="talent-role-option"
                  aria-pressed={talent.role === role.id}
                  disabled={talent.role === role.id || locked}
                  title={
                    locked
                      ? "正在执行任务，完成或取消任务后可调任"
                      : `任命为${role.name}`
                  }
                  onClick={() =>
                    run(
                      () => assignTalent(world, nationId, talent.id, role.id),
                      `已任命${talent.name}为${role.name}。`,
                    )
                  }
                >
                  <strong>{role.name}</strong>
                  <small>
                    {talent.role === role.id ? "当前职务" : role.description}
                  </small>
                </button>
              ))}
            </div>
            <p className="ui-note">
              顾问直接提供内政加成；将领、科研人才与使者还需在对应窗口安排任务。
            </p>
          </>
        )}
      </section>
      <details className="talent-rules">
        <summary>用人制度</summary>
        <p>
          每三年自动更新招募池，也可花费粮食访贤。招募满二十年后逐月判定退场。顾问常规席位为
          2，超额会降低顾问效率。
        </p>
        <p>使者出使期间不能调任；目前能力值不影响外交效果。</p>
      </details>
    </article>
  );
}
