import { useMemo, type ReactNode } from "react";
import { useMapCamera } from "./map/useMapCamera";
import {
  mapZoomLimits,
  type MapCameraPolicy,
  type MapPoint,
} from "./map/camera";
import "./tactical-camera.css";

// One edge length keeps cells square at every zoom. Staggering shifts odd columns only.
const CELL_EDGE = 96;
const CAMERA_POLICY: MapCameraPolicy = {
  panBounds: "edge-center",
  minFitScale: 0.65,
  maxZoom: 2.5,
  fitPadding: { width: 0, height: 0 },
};
const FRAME_INSETS = { left: 16, right: 16, top: 16, bottom: 16 };

/** The board and every combat effect share one transform; HUD windows stay outside it. */
export function TacticalMapViewport({
  columns,
  rows,
  focusPoint,
  children,
}: {
  columns: number;
  rows: number;
  focusPoint?: MapPoint;
  children: ReactNode;
}) {
  const width = columns * CELL_EDGE;
  const height = rows * CELL_EDGE;
  const corners = useMemo(
    () => [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    [width, height],
  );
  const { host, camera, size, tx, ty, viewportProps, zoomBy, fit, focus } =
    useMapCamera({
      width,
      height,
      initialPoints: corners,
      getInsets: () => FRAME_INSETS,
      policy: CAMERA_POLICY,
    });
  const limits = mapZoomLimits(size, { width, height }, CAMERA_POLICY);

  return (
    <div className="tactical-map-shell">
      <div
        ref={host}
        className="tactical-map-viewport"
        tabIndex={0}
        aria-label="战场视野，滚轮缩放，拖动或方向键平移"
        {...viewportProps}
      >
        <div
          className="tactical-camera-plane"
          style={{
            width,
            height,
            transform: `translate(${tx}px, ${ty}px) scale(${camera.zoom})`,
          }}
        >
          {children}
        </div>
      </div>
      <nav
        className="tactical-camera-controls"
        aria-label="战场视野控制"
        data-map-control
      >
        <button
          type="button"
          onClick={() => fit(corners)}
          title="显示完整棋盘并重置视野"
        >
          全图
        </button>
        <button
          type="button"
          disabled={!focusPoint}
          onClick={() => {
            if (focusPoint)
              focus(focusPoint.x * CELL_EDGE, focusPoint.y * CELL_EDGE);
          }}
          title="将当前行动或选中的部队移到视口中央"
        >
          当前部队
        </button>
        <button
          type="button"
          aria-label="缩小战场"
          disabled={camera.zoom <= limits.min + 0.001}
          onClick={() => zoomBy(1 / 1.2)}
        >
          −
        </button>
        <output aria-label="战场缩放比例">
          {Math.round(camera.zoom * 100)}%
        </output>
        <button
          type="button"
          aria-label="放大战场"
          disabled={camera.zoom >= limits.max - 0.001}
          onClick={() => zoomBy(1.2)}
        >
          ＋
        </button>
        <span>滚轮缩放 · 拖动平移</span>
      </nav>
    </div>
  );
}
