import { useState } from "react";
import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import type { Army } from "../../simulation/military-state";
import type { RequestMapLocation } from "../map/useMapLocationSelection";
import { AttackOrders } from "../AttackOrders";
import { ArmyRecruitment } from "./ArmyRecruitment";

/** Switching order tabs preserves both forms, including a pending map selection. */
export function ArmyOrders({
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
  const [tab, setTab] = useState<"recruitment" | "deployment">(
    army.units.length ? "deployment" : "recruitment",
  );
  const tabs = [
    { id: "recruitment", label: "征募部队" },
    { id: "deployment", label: "调度出征" },
  ] as const;
  return (
    <div className="army-orders-column">
      <div className="army-order-tabs" role="tablist" aria-label="军团行动">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            id={`${army.id}-${entry.id}-tab`}
            role="tab"
            aria-selected={tab === entry.id}
            aria-controls={`${army.id}-${entry.id}-panel`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div
        className="army-order-panel"
        role="tabpanel"
        id={`${army.id}-recruitment-panel`}
        aria-labelledby={`${army.id}-recruitment-tab`}
        hidden={tab !== "recruitment"}
      >
        <ArmyRecruitment
          content={content}
          world={world}
          nationId={nationId}
          army={army}
          run={run}
        />
      </div>
      <div
        className="army-order-panel"
        role="tabpanel"
        id={`${army.id}-deployment-panel`}
        aria-labelledby={`${army.id}-deployment-tab`}
        hidden={tab !== "deployment"}
      >
        <AttackOrders
          content={content}
          world={world}
          nationId={nationId}
          army={army}
          run={run}
          onRequestMapLocation={onRequestMapLocation}
        />
      </div>
    </div>
  );
}
