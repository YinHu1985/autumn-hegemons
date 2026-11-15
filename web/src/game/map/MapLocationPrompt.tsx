import { useEffect, useRef } from "react";
import type { MapLocationRequest } from "./useMapLocationSelection";
import "./map-selection.css";

export function MapLocationPrompt({
  request,
  error,
  onCancel,
}: {
  request: MapLocationRequest;
  error: string;
  onCancel: () => void;
}) {
  const prompt = useRef<HTMLElement>(null);
  useEffect(() => {
    prompt.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      className="map-location-prompt"
      aria-label="地图地点选择"
      ref={prompt}
      tabIndex={-1}
    >
      <div>
        <small>地图点选 · 世界暂停</small>
        <h2>{request.title}</h2>
        <p>{request.description}</p>
        {error && (
          <p className="map-selection-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button onClick={onCancel}>
        取消选择 <kbd>Esc</kbd>
      </button>
    </section>
  );
}
