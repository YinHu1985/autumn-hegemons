import { useCallback, useState } from "react";

/** A caller supplies its own eligible places and handles the confirmed location. */
export interface MapLocationRequest {
  title: string;
  description: string;
  eligibleCityIds: readonly string[];
  invalidReason?: (cityId: string) => string;
  onSelect: (cityId: string) => void;
  onCancel?: () => void;
}

export type RequestMapLocation = (request: MapLocationRequest) => void;

/** UI-only interaction state: choosing a location never issues a game command. */
export function useMapLocationSelection() {
  const [request, setRequest] = useState<MapLocationRequest | null>(null);
  const [error, setError] = useState("");

  const begin = useCallback((next: MapLocationRequest) => {
    setError("");
    setRequest(next);
  }, []);

  const cancel = useCallback(() => {
    setRequest(null);
    setError("");
    request?.onCancel?.();
  }, [request]);

  const choose = (cityId: string) => {
    if (!request) return;
    if (!request.eligibleCityIds.includes(cityId)) {
      setError(
        request.invalidReason?.(cityId) ??
          "此地不能用于当前操作，请选择标亮的城邑。",
      );
      return;
    }
    setRequest(null);
    setError("");
    request.onSelect(cityId);
  };

  return { request, error, begin, cancel, choose };
}
