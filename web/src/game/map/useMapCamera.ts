import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import {
  cameraTranslation,
  clampCamera,
  fitCamera,
  focusCamera,
  DEFAULT_MAP_INSETS,
  zoomCamera,
} from "./camera";
import type {
  MapCamera,
  MapPoint,
  MapSize,
  MapInsets,
  MapCameraPolicy,
} from "./camera";

interface CameraOptions extends MapSize {
  initialPoints: readonly MapPoint[];
  getInsets?: (viewport: MapSize) => MapInsets;
  policy?: MapCameraPolicy;
}

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  camera: MapCamera;
  moved: boolean;
}

/** Only controls the view: dragging and zooming never issue simulation commands. */
export function useMapCamera({
  width,
  height,
  initialPoints,
  getInsets,
  policy,
}: CameraOptions) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<MapSize>({ width: 0, height: 0 });
  const [camera, setCamera] = useState<MapCamera>({
    x: width / 2,
    y: height / 2,
    zoom: 1,
  });
  const initialized = useRef(false);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const insets = getInsets?.(size) ?? DEFAULT_MAP_INSETS;
  const current = useRef({
    camera,
    size,
    world: { width, height },
    insets,
    policy,
  });
  current.current = { camera, size, world: { width, height }, insets, policy };

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0) setSize({ width: w, height: h });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!size.width || !size.height) return;
    if (!initialized.current && initialPoints.length) {
      setCamera(
        fitCamera(
          initialPoints,
          size,
          { width, height },
          current.current.insets,
          current.current.policy,
        ),
      );
      initialized.current = true;
    } else if (initialized.current) {
      setCamera((previous) =>
        clampCamera(
          previous,
          size,
          { width, height },
          current.current.insets,
          current.current.policy,
        ),
      );
    }
    // initialPoints is used once; normal simulation updates must not refocus the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    size.width,
    size.height,
    width,
    height,
    initialPoints.length,
    policy?.minZoom,
    policy?.maxZoom,
    policy?.minFitScale,
    policy?.panBounds,
  ]);

  const zoomBy = (factor: number, anchor?: MapPoint) => {
    const { size: viewport, world, insets, policy } = current.current;
    setCamera((previous) =>
      zoomCamera(
        previous,
        factor,
        anchor ?? { x: viewport.width / 2, y: viewport.height / 2 },
        viewport,
        world,
        insets,
        policy,
      ),
    );
  };

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const units =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      const factor = Math.exp(
        -Math.max(-100, Math.min(100, event.deltaY * units)) * 0.0025,
      );
      zoomBy(factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  const panTo = (x: number, y: number) => {
    const { size: viewport, world, insets, policy } = current.current;
    setCamera((previous) =>
      clampCamera({ ...previous, x, y }, viewport, world, insets, policy),
    );
  };

  const focus = (x: number, y: number, overrideInsets?: MapInsets) => {
    const { size: viewport, world, insets, policy } = current.current;
    setCamera((previous) =>
      focusCamera(
        previous,
        { x, y },
        viewport,
        world,
        overrideInsets ?? insets,
        policy,
      ),
    );
  };

  const fit = (points: readonly MapPoint[]) => {
    const { size: viewport, world, insets, policy } = current.current;
    setCamera(fitCamera(points, viewport, world, insets, policy));
  };

  const viewportProps: HTMLAttributes<HTMLDivElement> = {
    onPointerDown(event) {
      if (event.button !== 0 || !event.isPrimary) return;
      const target = event.target as Element;
      if (target.closest("input,select,textarea,[data-map-control]")) return;
      suppressClick.current = false;
      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        camera: current.current.camera,
        moved: false,
      };
    },
    onPointerMove(event) {
      const movement = drag.current;
      if (!movement || event.pointerId !== movement.pointerId) return;
      // A release outside the viewport can occur before pointer capture starts.
      if (event.buttons === 0) {
        drag.current = null;
        return;
      }
      const dx = event.clientX - movement.startX;
      const dy = event.clientY - movement.startY;
      if (!movement.moved && Math.hypot(dx, dy) < 5) return;
      if (!movement.moved) {
        movement.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      const { size: viewport, world, insets, policy } = current.current;
      setCamera(
        clampCamera(
          {
            ...movement.camera,
            x: movement.camera.x - dx / movement.camera.zoom,
            y: movement.camera.y - dy / movement.camera.zoom,
          },
          viewport,
          world,
          insets,
          policy,
        ),
      );
    },
    onPointerUp(event) {
      if (drag.current?.pointerId !== event.pointerId) return;
      suppressClick.current = drag.current.moved;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    onPointerCancel(event) {
      if (drag.current?.pointerId === event.pointerId) drag.current = null;
      suppressClick.current = false;
    },
    onClickCapture(event) {
      if (!suppressClick.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick.current = false;
    },
    onKeyDown(event) {
      if ((event.target as Element).closest("input,select,textarea")) return;
      const movement: Record<string, [number, number]> = {
        ArrowLeft: [-70, 0],
        ArrowRight: [70, 0],
        ArrowUp: [0, -70],
        ArrowDown: [0, 70],
      };
      if (movement[event.key]) {
        event.preventDefault();
        const [dx, dy] = movement[event.key];
        const view = current.current.camera;
        panTo(view.x + dx / view.zoom, view.y + dy / view.zoom);
      } else if (["+", "="].includes(event.key)) {
        event.preventDefault();
        zoomBy(1.2);
      } else if (event.key === "-") {
        event.preventDefault();
        zoomBy(1 / 1.2);
      }
    },
  };

  return {
    host,
    camera,
    size,
    ...cameraTranslation(camera, size),
    focus,
    panTo,
    fit,
    zoomBy,
    viewportProps,
  };
}
