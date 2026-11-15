import { useEffect, useRef, useState } from "react";
import type { Content } from "../definitions/types";
import type { TacticalAction } from "../simulation/military-state";
import type { WorldState } from "../simulation/state";
import {
  advanceTacticalTime,
  stepTacticalAutomation,
} from "../simulation/military";
import { controllingStatus } from "../simulation/military-tactics";

export interface TacticalPlaybackFrame {
  action: TacticalAction;
  progress: number;
  before: WorldState;
  after: WorldState;
}

interface PendingAction extends TacticalPlaybackFrame {
  elapsed: number;
  duration: number;
}

interface Options {
  content: Content;
  world: WorldState;
  battleId: string;
  nationId: string;
  suspended: boolean;
  onWorld: (world: WorldState) => void;
}

/** Owns presentation time only. Commands and initiative are still resolved by the simulation.
 * A command is committed after its animation; replacing the world cancels any pending commit.
 */
export function useTacticalPlayback(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const pending = useRef<PendingAction | null>(null);
  const fault = useRef(false);
  const [frame, setFrame] = useState<TacticalPlaybackFrame | null>(null);
  const [message, setMessage] = useState("");
  const [hidden, setHidden] = useState(() => document.hidden);

  const commit = (world: WorldState) => {
    const current = latest.current;
    latest.current = { ...current, world };
    current.onWorld(world);
  };

  const stage = (before: WorldState, after: WorldState) => {
    const { battleId, content } = latest.current;
    const oldAction = before.military.battles[battleId]?.tactical?.lastAction;
    const action = after.military.battles[battleId]?.tactical?.lastAction;
    if (!action || action.sequence === oldAction?.sequence) {
      commit(after);
      return;
    }
    const timings = content.tactics.presentation;
    const duration =
      action.kind === "move"
        ? Math.max(1, (action.path?.length ?? 2) - 1) * timings.moveStepMs
        : ["melee", "shoot", "strategy"].includes(action.kind)
          ? timings.attackMs
          : timings.pauseMs;
    pending.current = {
      before,
      after,
      action,
      progress: 0,
      elapsed: 0,
      duration,
    };
    setFrame(pending.current);
  };

  const run = (command: (world: WorldState) => WorldState) => {
    if (pending.current || latest.current.suspended || document.hidden)
      return false;
    try {
      const before = latest.current.world;
      stage(before, command(before));
      setMessage("");
      fault.current = false;
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return false;
    }
  };
  const callbacks = useRef({ stage, commit });
  callbacks.current = { stage, commit };

  useEffect(() => {
    if (pending.current && pending.current.before !== options.world) {
      pending.current = null;
      setFrame(null);
    }
    fault.current = false;
  }, [options.world]);

  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    let handle = 0;
    let last = performance.now();
    let accumulated = 0;
    const tick = (now: number) => {
      handle = requestAnimationFrame(tick);
      const elapsed = Math.min(80, Math.max(0, now - last));
      last = now;
      const current = latest.current;
      if (current.suspended || document.hidden || fault.current) {
        accumulated = 0;
        return;
      }
      const animation = pending.current;
      if (animation) {
        // A save load/new game may replace state before React runs the effect above.
        if (animation.before !== current.world) {
          pending.current = null;
          setFrame(null);
          return;
        }
        animation.elapsed += elapsed;
        if (animation.elapsed >= animation.duration) {
          pending.current = null;
          setFrame(null);
          callbacks.current.commit(animation.after);
        } else {
          setFrame({
            ...animation,
            progress: animation.elapsed / animation.duration,
          });
        }
        accumulated = 0;
        return;
      }
      const battle = current.world.military.battles[current.battleId];
      const tactical = battle?.tactical;
      if (!tactical || tactical.phase !== "combat") return;
      const active = tactical.units.find(
        (unit) => unit.id === tactical.activeUnitId,
      );
      try {
        if (!active) {
          accumulated += elapsed;
          // Updating at 30 Hz keeps all UI meters in lockstep with the authoritative clock.
          if (accumulated < 32) return;
          const delta =
            (accumulated / 1000) *
            current.content.tactics.presentation.clockUnitsPerSecond;
          accumulated = 0;
          callbacks.current.commit(
            advanceTacticalTime(
              current.content,
              current.world,
              current.battleId,
              delta,
            ),
          );
        } else {
          accumulated = 0;
          const ownSide =
            battle.attackerId === current.nationId ? "attacker" : "defender";
          if (
            active.side !== ownSide ||
            active.actionPoints <= 0 ||
            controllingStatus(battle, active) ||
            active.morale <= 8 ||
            active.cadre + active.levy <= 0
          ) {
            callbacks.current.stage(
              current.world,
              stepTacticalAutomation(
                current.content,
                current.world,
                current.battleId,
                current.nationId,
              ),
            );
          }
        }
      } catch (error) {
        fault.current = true;
        setMessage(error instanceof Error ? error.message : String(error));
      }
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      document.removeEventListener("visibilitychange", visibility);
      pending.current = null;
    };
  }, []);

  // A replaced world must not display even one frame of a previous battle's intelligence.
  const currentFrame = frame?.before === options.world ? frame : null;
  return {
    frame: currentFrame,
    run,
    message,
    clearMessage: () => setMessage(""),
    busy: !!currentFrame,
    paused: options.suspended || hidden,
  };
}
