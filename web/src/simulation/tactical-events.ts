import type { Battle, TacticalAction, TacticalUnit } from "./military-state";

/** A replay cue, never an input to combat calculations. */
export function recordTacticalAction(
  battle: Battle,
  action: Omit<TacticalAction, "sequence">,
) {
  const tactical = battle.tactical!;
  tactical.lastAction = {
    ...action,
    sequence: (tactical.lastAction?.sequence ?? 0) + 1,
  };
}

/** Detailed messages require an explicit observation audience; global announcements use both. */
export function tacticalLog(
  battle: Battle,
  message: string,
  audience: readonly TacticalUnit["side"][] = ["attacker", "defender"],
) {
  const tactical = battle.tactical!;
  tactical.log = [message, ...tactical.log].slice(0, 30);
  // Old snapshots start a new observed journal, never copy their omniscient history.
  tactical.observedLog ??= { attacker: [], defender: [] };
  for (const side of audience)
    tactical.observedLog[side] = [message, ...tactical.observedLog[side]].slice(
      0,
      30,
    );
}
