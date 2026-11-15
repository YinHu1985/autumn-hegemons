import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import type { Battle } from "../simulation/military-state";
import { BOARD_COLUMNS, tacticalRows } from "../simulation/tactical-board";
import { validateSavedDiplomacy } from "./validate-diplomacy-save";
type RecordValue = Record<string, unknown>;
function invalid(path: string): never {
  throw new Error(`存档字段无效：${path}`);
}
function record(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(path);
  return value as RecordValue;
}
function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path);
  return value;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path);
  return value;
}
function num(
  value: unknown,
  path: string,
  min = 0,
  max = Infinity,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    invalid(path);
  return value;
}
function bool(value: unknown, path: string) {
  if (typeof value !== "boolean") invalid(path);
}
function oneOf(value: unknown, values: string[], path: string) {
  if (!values.includes(text(value, path))) invalid(path);
}
function reference(value: unknown, ids: Set<string>, path: string) {
  if (!ids.has(text(value, path))) invalid(path);
}
function nullableReference(value: unknown, ids: Set<string>, path: string) {
  if (value !== null) reference(value, ids, path);
}
function keysMatch(value: RecordValue, ids: Set<string>, path: string) {
  if (
    Object.keys(value).length !== ids.size ||
    Object.keys(value).some((id) => !ids.has(id))
  )
    invalid(path);
}
function date(value: unknown, path: string) {
  const d = record(value, path);
  num(d.year, `${path}.year`, -10000, 10000, true);
  num(d.month, `${path}.month`, 1, 12, true);
  num(d.day, `${path}.day`, 1, 30, true);
}
function strings(value: unknown, path: string) {
  for (const entry of list(value, path)) text(entry, path);
}
/** Catch non-finite numbers even in optional reports and future fields before they reach calculations. */
function finiteTree(value: unknown, path: string): void {
  if (typeof value === "number" && !Number.isFinite(value)) invalid(path);
  if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value))
      finiteTree(item, `${path}.${key}`);
}
export function validateSavedWorld(raw: unknown, content: Content): WorldState {
  finiteTree(raw, "world");
  const w = record(raw, "world");
  date(w.date, "date");
  const nationIds = new Set(content.scenario.nations.map((n) => n.id));
  const cityIds = new Set(content.scenario.settlements.map((c) => c.id));
  const subjectIds = new Set(
    [...content.technologies, ...content.ideas].map((t) => t.id),
  );
  const ideaIds = new Set(content.ideas.map((t) => t.id));
  const unitTypes = new Set(content.units.map((u) => u.id));
  reference(w.playerNationId, nationIds, "playerNationId");
  const nations = record(w.nations, "nations");
  keysMatch(nations, nationIds, "nations");
  for (const [id, value] of Object.entries(nations)) {
    const n = record(value, `nations.${id}`);
    if (n.id !== id) invalid(`nations.${id}.id`);
    for (const key of ["treasury", "manpower"]) num(n[key], `${id}.${key}`);
    for (const key of ["budget", "operatingCoverage"]) {
      const r = record(n[key], `${id}.${key}`);
      for (const category of ["buildings", "army", "research"])
        num(r[category], `${id}.${key}.${category}`, 0, 1);
    }
    if (n.lastReport !== null) {
      const report = record(n.lastReport, `${id}.lastReport`);
      date(report.date, `${id}.lastReport.date`);
      for (const key of [
        "income",
        "required",
        "requested",
        "paid",
        "coverage",
        "closingTreasury",
      ])
        num(report[key], `${id}.lastReport.${key}`);
    }
  }
  const cities = record(w.settlements, "settlements");
  keysMatch(cities, cityIds, "settlements");
  for (const [id, value] of Object.entries(cities)) {
    const c = record(value, id);
    if (c.id !== id) invalid(`${id}.id`);
    reference(c.owner, nationIds, `${id}.owner`);
    num(c.scale, `${id}.scale`, 1, Infinity, true);
    num(c.governance, `${id}.governance`, 0, 1);
    const buildings = record(c.buildings, `${id}.buildings`);
    for (const [key, value] of Object.entries(buildings)) {
      const definition = content.buildings.find((b) => b.id === key);
      if (!definition) invalid(`${id}.buildings.${key}`);
      const b = record(value, `${id}.${key}`);
      num(b.level, `${id}.${key}.level`, 1, definition.levels.length, true);
      num(
        b.effectiveLevel,
        `${id}.${key}.effectiveLevel`,
        0,
        b.level as number,
        true,
      );
    }
    if (c.construction !== null) {
      const job = record(c.construction, `${id}.construction`);
      const buildingId = text(job.buildingId, `${id}.construction.buildingId`);
      const definition = content.buildings.find((b) => b.id === buildingId);
      if (buildingId !== "__expand" && !definition)
        invalid(`${id}.construction.buildingId`);
      num(
        job.targetLevel,
        `${id}.construction.targetLevel`,
        1,
        definition?.levels.length ?? Infinity,
        true,
      );
      num(
        job.remainingDays,
        `${id}.construction.remainingDays`,
        1,
        Infinity,
        true,
      );
    }
  }
  const research = record(w.research, "research");
  num(research.seed, "research.seed", 0, 4294967295, true);
  num(research.nextId, "research.nextId", 1, Infinity, true);
  const talents = record(research.talents, "research.talents");
  const talentIds = new Set(Object.keys(talents));
  for (const [id, value] of Object.entries(talents)) {
    const t = record(value, id);
    if (t.id !== id) invalid(`${id}.id`);
    reference(t.nationId, nationIds, `${id}.nationId`);
    text(t.name, `${id}.name`);
    text(t.portrait, `${id}.portrait`);
    oneOf(
      t.role,
      ["idle", "advisor", "general", "research", "envoy"],
      `${id}.role`,
    );
    oneOf(
      t.specialty,
      ["civil", "craft", "military", "humanities"],
      `${id}.specialty`,
    );
    for (const key of ["command", "martial", "administration", "scholarship"])
      num(t[key], `${id}.${key}`, 0, 100);
    if (t.recruitedMonth !== null)
      num(t.recruitedMonth, `${id}.recruitedMonth`, -Infinity, Infinity, true);
    bool(t.busy, `${id}.busy`);
  }
  const researchNations = record(research.nations, "research.nations");
  keysMatch(researchNations, nationIds, "research.nations");
  const groupIds = new Set<string>();
  const leaders = new Set<string>();
  for (const [id, value] of Object.entries(researchNations)) {
    const state = record(value, `research.${id}`);
    const unlocked = list(state.unlocked, `${id}.unlocked`);
    for (const subject of unlocked)
      reference(subject, subjectIds, `${id}.unlocked`);
    for (const idea of list(state.enacted, `${id}.enacted`)) {
      reference(idea, ideaIds, `${id}.enacted`);
      if (!unlocked.includes(idea)) invalid(`${id}.enacted`);
    }
    for (const key of ["progress", "bonuses"])
      for (const [target, value] of Object.entries(
        record(state[key], `${id}.${key}`),
      )) {
        reference(target, subjectIds, `${id}.${key}`);
        num(value, `${id}.${key}.${target}`);
      }
    num(state.lastRefresh, `${id}.lastRefresh`, -Infinity, Infinity, true);
    strings(state.notices, `${id}.notices`);
    for (const value of list(state.groups, `${id}.groups`)) {
      const g = record(value, `${id}.group`);
      const groupId = text(g.id, "group.id");
      if (groupIds.has(groupId)) invalid("group.id");
      groupIds.add(groupId);
      reference(g.targetId, subjectIds, `${groupId}.targetId`);
      reference(g.leaderId, talentIds, `${groupId}.leaderId`);
      const leader = record(talents[g.leaderId as string], "group.leader");
      if (
        leader.nationId !== id ||
        leader.role !== "research" ||
        leader.recruitedMonth === null ||
        leaders.has(g.leaderId as string)
      )
        invalid(`${groupId}.leaderId`);
      leaders.add(g.leaderId as string);
      num(g.investment, `${groupId}.investment`);
      num(g.fundedInvestment, `${groupId}.fundedInvestment`);
    }
  }
  const military = record(w.military, "military");
  num(military.nextId, "military.nextId", 1, Infinity, true);
  num(military.day, "military.day", 0, Infinity, true);
  num(military.rng, "military.rng", 0, 4294967295, true);
  strings(military.log, "military.log");
  const armies = record(military.armies, "military.armies");
  const armyIds = new Set(Object.keys(armies));
  const regimentIds = new Set<string>();
  const regiment = (raw: unknown, path: string) => {
    const u = record(raw, path);
    text(u.id, `${path}.id`);
    reference(u.typeId, unitTypes, `${path}.typeId`);
    for (const key of ["cadre", "levy"]) num(u[key], `${path}.${key}`);
    for (const key of ["morale", "training"])
      num(u[key], `${path}.${key}`, 0, 100);
    if (u.cadreTarget !== undefined) num(u.cadreTarget, `${path}.cadreTarget`);
    if (u.lastBattleDay !== undefined)
      num(
        u.lastBattleDay,
        `${path}.lastBattleDay`,
        0,
        military.day as number,
        true,
      );
    if (u.offensiveFatigue !== undefined)
      num(
        u.offensiveFatigue,
        `${path}.offensiveFatigue`,
        0,
        content.warfare.maximumOffensiveFatigue,
      );
    return u;
  };
  for (const [id, value] of Object.entries(armies)) {
    const a = record(value, id);
    if (a.id !== id) invalid(`${id}.id`);
    text(a.name, `${id}.name`);
    reference(a.nationId, nationIds, `${id}.nationId`);
    reference(a.cityId, cityIds, `${id}.cityId`);
    nullableReference(a.destination, cityIds, `${id}.destination`);
    nullableReference(a.generalId, talentIds, `${id}.generalId`);
    if (a.generalId !== null) {
      const general = record(talents[a.generalId as string], "general");
      if (
        general.nationId !== a.nationId ||
        general.role !== "general" ||
        general.recruitedMonth === null ||
        leaders.has(a.generalId as string)
      )
        invalid(`${id}.generalId`);
      leaders.add(a.generalId as string);
    }
    oneOf(
      a.status,
      ["idle", "marching", "battle", "resting", "returning"],
      `${id}.status`,
    );
    bool(a.expedition, `${id}.expedition`);
    if (a.status === "returning" && a.expedition !== true)
      invalid(`${id}.expedition`);
    if (a.status === "marching" && a.destination === null)
      invalid(`${id}.destination`);
    num(a.remainingDays, `${id}.remainingDays`, 0, Infinity, true);
    num(a.arrivedDay, `${id}.arrivedDay`, -1, Infinity, true);
    for (const value of list(a.units, `${id}.units`)) {
      const u = regiment(value, `${id}.unit`);
      if (regimentIds.has(u.id as string)) invalid("unit.id");
      regimentIds.add(u.id as string);
    }
  }
  const battles = record(military.battles, "military.battles");
  const battleIds = new Set(Object.keys(battles));
  nullableReference(military.activeBattleId, battleIds, "activeBattleId");
  const readyDefenders = new Set<string>();
  const occupiedArmies = new Set<string>();
  const activeOrders = new Set<number>();
  for (const [id, value] of Object.entries(battles)) {
    const b = record(value, id);
    if (b.id !== id) invalid(`${id}.id`);
    reference(b.cityId, cityIds, `${id}.cityId`);
    reference(b.attackerId, nationIds, `${id}.attackerId`);
    reference(b.defenderId, nationIds, `${id}.defenderId`);
    if (b.attackerId === b.defenderId) invalid(`${id}.defenderId`);
    oneOf(b.kind, ["field"], `${id}.kind`);
    oneOf(b.phase, ["preparation", "ready", "resolved"], `${id}.phase`);
    num(b.preparationDays, `${id}.preparationDays`, 1, Infinity, true);
    num(
      b.elapsed,
      `${id}.elapsed`,
      0,
      b.phase === "resolved" ? Infinity : (b.preparationDays as number),
    );
    num(b.startedDay, `${id}.startedDay`, 0, military.day as number, true);
    num(b.order, `${id}.order`, 1, Infinity, true);
    num(b.garrison, `${id}.garrison`);
    if (b.phase !== "resolved") {
      if (activeOrders.has(b.order as number)) invalid(`${id}.order`);
      activeOrders.add(b.order as number);
      if (
        record(cities[b.cityId as string], "battle.city").owner !== b.defenderId
      )
        invalid(`${id}.defenderId`);
    }
    if (
      b.phase === "preparation" &&
      (b.garrison !== 0 || b.elapsed === b.preparationDays)
    )
      invalid(`${id}.phase`);
    if (b.phase === "ready") {
      if (
        readyDefenders.has(b.defenderId as string) ||
        b.elapsed !== b.preparationDays
      )
        invalid(`${id}.phase`);
      readyDefenders.add(b.defenderId as string);
    }
    for (const key of ["attackerArmies", "defenderArmies"]) {
      const entries = list(b[key], `${id}.${key}`);
      if (new Set(entries).size !== entries.length) invalid(`${id}.${key}`);
      for (const army of entries) {
        const armyId = text(army, `${id}.${key}`);
        if (b.phase === "resolved") continue;
        reference(armyId, armyIds, `${id}.${key}`);
        const a = record(armies[armyId], "battle.army");
        if (
          a.nationId !==
          (key === "attackerArmies" ? b.attackerId : b.defenderId)
        )
          invalid(`${id}.${key}`);
        if (key === "attackerArmies" || b.phase === "ready") {
          if (
            occupiedArmies.has(armyId) ||
            a.status !== "battle" ||
            a.expedition !== (key === "attackerArmies")
          )
            invalid(`${id}.${key}`);
          occupiedArmies.add(armyId);
        }
      }
    }
    if (military.activeBattleId === id && b.phase !== "ready")
      invalid(`${id}.phase`);
    if (b.tactical !== null) {
      const t = record(b.tactical, `${id}.tactical`);
      num(t.turn, `${id}.tactical.turn`, 0, Infinity, true);
      num(t.clock, `${id}.tactical.clock`);
      num(t.activation, `${id}.tactical.activation`, 0, Infinity, true);
      oneOf(
        t.phase,
        ["deployment", "combat", "finished"],
        `${id}.tactical.phase`,
      );
      if (t.winner !== null)
        oneOf(t.winner, ["attacker", "defender"], `${id}.tactical.winner`);
      strings(t.log, `${id}.tactical.log`);
      if (t.observedLog !== undefined) {
        const logs = record(t.observedLog, `${id}.tactical.observedLog`);
        strings(logs.attacker, `${id}.tactical.observedLog.attacker`);
        strings(logs.defender, `${id}.tactical.observedLog.defender`);
      }
      oneOf(
        t.activeSide,
        ["attacker", "defender"],
        `${id}.tactical.activeSide`,
      );
      const tacticalIds = new Set<string>();
      for (const value of list(t.units, `${id}.tactical.units`)) {
        const u = regiment(value, `${id}.tactical.unit`);
        if (tacticalIds.has(u.id as string)) invalid(`${id}.tactical.unit.id`);
        tacticalIds.add(u.id as string);
        oneOf(u.side, ["attacker", "defender"], "tactical.side");
        num(u.x, "tactical.x", 0, BOARD_COLUMNS - 1, true);
        num(u.y, "tactical.y", 0, Infinity, true);
        bool(u.acted, "tactical.acted");
        num(u.maxActionPoints, "tactical.maxActionPoints", 1, 100, true);
        num(
          u.actionProgress,
          "tactical.actionProgress",
          0,
          content.tactics.actionThreshold + 1e-6,
        );
        num(u.activationCount, "tactical.activationCount", 0, Infinity, true);
        num(
          u.actionPoints,
          "tactical.actionPoints",
          0,
          u.maxActionPoints as number,
          true,
        );
        bool(u.strategyUsed, "tactical.strategyUsed");
        bool(u.guarding, "tactical.guarding");
        const statusKinds = new Set<string>();
        for (const rawStatus of list(u.statuses, "tactical.statuses")) {
          const status = record(rawStatus, "tactical.status");
          oneOf(status.kind, ["doubt", "provoke"], "tactical.status.kind");
          if (statusKinds.has(status.kind as string))
            invalid("tactical.status.kind");
          statusKinds.add(status.kind as string);
          num(
            status.remainingActivations,
            "tactical.status.remainingActivations",
            1,
            100,
            true,
          );
          if (status.kind === "provoke" || status.sourceId !== undefined)
            text(status.sourceId, "tactical.status.sourceId");
        }
        if (u.attackMultiplier !== undefined)
          num(u.attackMultiplier, "tactical.attackMultiplier");
        if (u.defenseMultiplier !== undefined)
          num(u.defenseMultiplier, "tactical.defenseMultiplier");
      }
      const boardRows = tacticalRows(b as unknown as Battle);
      for (const rawUnit of list(t.units, `${id}.tactical.units`)) {
        const u = record(rawUnit, "tactical.unit");
        num(u.y, "tactical.y", 0, boardRows - 1, true);
        for (const rawStatus of list(u.statuses, "tactical.statuses")) {
          const status = record(rawStatus, "tactical.status");
          if (status.sourceId !== undefined)
            reference(status.sourceId, tacticalIds, "tactical.status.sourceId");
        }
      }
      nullableReference(t.selectedId, tacticalIds, `${id}.tactical.selectedId`);
      nullableReference(
        t.activeUnitId,
        tacticalIds,
        `${id}.tactical.activeUnitId`,
      );
      if (t.activeUnitId !== null) {
        const active = (t.units as RecordValue[]).find(
          (unit) => unit.id === t.activeUnitId,
        )!;
        if (
          active.side !== t.activeSide ||
          (active.actionProgress as number) <
            content.tactics.actionThreshold - 1e-6
        )
          invalid(`${id}.tactical.activeUnitId`);
      }
      if (t.lastAction !== null) {
        const action = record(t.lastAction, `${id}.tactical.lastAction`);
        num(action.sequence, "tactical.lastAction.sequence", 1, Infinity, true);
        oneOf(
          action.kind,
          [
            "move",
            "melee",
            "shoot",
            "strategy",
            "guard",
            "wait",
            "skip",
            "end",
          ],
          "tactical.lastAction.kind",
        );
        reference(action.unitId, tacticalIds, "tactical.lastAction.unitId");
        if (action.visibleTo !== undefined) {
          const audience = list(
            action.visibleTo,
            "tactical.lastAction.visibleTo",
          );
          for (const side of audience)
            oneOf(
              side,
              ["attacker", "defender"],
              "tactical.lastAction.visibleTo",
            );
          if (new Set(audience).size !== audience.length)
            invalid("tactical.lastAction.visibleTo");
        }
        if (action.targetId !== undefined)
          reference(
            action.targetId,
            tacticalIds,
            "tactical.lastAction.targetId",
          );
        if (
          ["melee", "shoot", "strategy"].includes(action.kind as string) &&
          action.targetId === undefined
        )
          invalid("tactical.lastAction.targetId");
        if (action.strategyId !== undefined || action.kind === "strategy")
          reference(
            action.strategyId,
            new Set(content.tactics.strategies.map((strategy) => strategy.id)),
            "tactical.lastAction.strategyId",
          );
        if (action.path !== undefined || action.kind === "move") {
          const path = list(action.path, "tactical.lastAction.path");
          if (path.length < 2) invalid("tactical.lastAction.path");
          for (const value of path) {
            const point = record(value, "tactical.lastAction.path.point");
            num(
              point.x,
              "tactical.lastAction.path.x",
              0,
              BOARD_COLUMNS - 1,
              true,
            );
            num(point.y, "tactical.lastAction.path.y", 0, boardRows - 1, true);
            num(point.cost, "tactical.lastAction.path.cost", 0);
          }
        }
      }
    } else if (military.activeBattleId === id) invalid(`${id}.tactical`);
  }
  for (const [id, value] of Object.entries(armies)) {
    const army = record(value, id);
    if (army.status === "battle" && !occupiedArmies.has(id))
      invalid(`${id}.status`);
  }
  const civic = record(w.civic, "civic");
  num(civic.seed, "civic.seed", 0, 4294967295, true);
  num(civic.nextEventId, "civic.nextEventId", 1, Infinity, true);
  const eventIds = new Set(content.events.map((e) => e.id));
  for (const value of list(civic.events, "civic.events")) {
    const event = record(value, "event");
    text(event.id, "event.id");
    reference(event.definitionId, eventIds, "event.definitionId");
    reference(event.nationId, nationIds, "event.nationId");
    num(event.daysLeft, "event.daysLeft", 1, Infinity, true);
  }
  for (const value of list(civic.log, "civic.log")) {
    const entry = record(value, "log");
    date(entry.date, "log.date");
    reference(entry.nationId, nationIds, "log.nationId");
    text(entry.text, "log.text");
  }
  validateSavedDiplomacy(w.diplomacy, content, w as unknown as WorldState);
  return w as unknown as WorldState;
}
