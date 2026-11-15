export interface MapPoint {
  x: number;
  y: number;
}

export interface MapSize {
  width: number;
  height: number;
}

export interface MapCamera extends MapPoint {
  zoom: number;
}

export interface MapInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** View preferences; omit to retain the strategic map's paper margins and zoom limits. */
export interface MapCameraPolicy {
  minZoom?: number;
  maxZoom?: number;
  /** Minimum zoom relative to fitting the entire world into the viewport. */
  minFitScale?: number;
  /** Edge-center lets every board edge reach the viewport centre without losing the map. */
  panBounds?: "paper" | "edge-center";
  /** Extra world-space padding around the points passed to fitCamera. */
  fitPadding?: MapSize;
}

export const DEFAULT_MAP_INSETS: MapInsets = {
  left: 36,
  right: 36,
  top: 76,
  bottom: 104,
};

/** Match the overlay HUD without coupling the camera to DOM measurements. */
export function overlayMapInsets(
  viewport: MapSize,
  leftPanelOpen: boolean,
): MapInsets {
  return {
    left: leftPanelOpen ? Math.min(360, viewport.width * 0.48) : 30,
    right: viewport.width >= 1000 ? 250 : viewport.width >= 760 ? 212 : 56,
    top: viewport.width < 760 ? 138 : 118,
    bottom: 145,
  };
}

export function mapFocusFrame(viewport: MapSize, insets: MapInsets) {
  const sx = Math.min(1, viewport.width / (insets.left + insets.right + 160));
  const sy = Math.min(1, viewport.height / (insets.top + insets.bottom + 160));
  const width = viewport.width - (insets.left + insets.right) * sx;
  const height = viewport.height - (insets.top + insets.bottom) * sy;
  return {
    width,
    height,
    x: insets.left * sx + width / 2,
    y: insets.top * sy + height / 2,
  };
}

export function mapZoomLimits(
  viewport: MapSize,
  world: MapSize,
  policy?: MapCameraPolicy,
) {
  const max = Math.max(0.1, policy?.maxZoom ?? 3);
  const min =
    policy?.minZoom ??
    Math.max(
      0.1,
      Math.min(viewport.width / world.width, viewport.height / world.height) *
        (policy?.minFitScale ?? 0.85),
    );
  return { min: Math.min(max, Math.max(0.1, min)), max };
}

/** Camera position is the world point at the centre of the viewport. */
export function cameraTranslation(camera: MapCamera, viewport: MapSize) {
  return {
    tx: viewport.width / 2 - camera.x * camera.zoom,
    ty: viewport.height / 2 - camera.y * camera.zoom,
  };
}

export function screenToWorld(
  point: MapPoint,
  camera: MapCamera,
  viewport: MapSize,
): MapPoint {
  return {
    x: camera.x + (point.x - viewport.width / 2) / camera.zoom,
    y: camera.y + (point.y - viewport.height / 2) / camera.zoom,
  };
}

/** Keep the map reachable, allowing a small paper margin at its edges. */
export function clampCamera(
  camera: MapCamera,
  viewport: MapSize,
  world: MapSize,
  insets?: MapInsets,
  policy?: MapCameraPolicy,
): MapCamera {
  const limits = mapZoomLimits(viewport, world, policy);
  const zoom = Math.max(limits.min, Math.min(limits.max, camera.zoom));
  const clampAxis = (
    value: number,
    screen: number,
    extent: number,
    start = 48,
    end = 48,
  ) => {
    if (policy?.panBounds === "edge-center")
      return Math.max(0, Math.min(extent, value));
    const minimum = Math.max(0, screen / 2 - Math.max(48, start)) / zoom;
    const maximum = extent - Math.max(0, screen / 2 - Math.max(48, end)) / zoom;
    return minimum > maximum
      ? extent / 2
      : Math.max(minimum, Math.min(maximum, value));
  };
  return {
    x: clampAxis(
      camera.x,
      viewport.width,
      world.width,
      insets?.left,
      insets?.right,
    ),
    y: clampAxis(
      camera.y,
      viewport.height,
      world.height,
      insets?.top,
      insets?.bottom,
    ),
    zoom,
  };
}

/** Preserve the world point under the cursor, except at the map's outer limits. */
export function zoomCamera(
  camera: MapCamera,
  factor: number,
  anchor: MapPoint,
  viewport: MapSize,
  world: MapSize,
  insets?: MapInsets,
  policy?: MapCameraPolicy,
): MapCamera {
  const limits = mapZoomLimits(viewport, world, policy);
  const zoom = Math.max(limits.min, Math.min(limits.max, camera.zoom * factor));
  const point = screenToWorld(anchor, camera, viewport);
  return clampCamera(
    {
      x: point.x - (anchor.x - viewport.width / 2) / zoom,
      y: point.y - (anchor.y - viewport.height / 2) / zoom,
      zoom,
    },
    viewport,
    world,
    insets,
    policy,
  );
}

/** Place an explicit search/roster target in the clear area between floating panels. */
export function focusCamera(
  camera: MapCamera,
  point: MapPoint,
  viewport: MapSize,
  world: MapSize,
  insets: MapInsets = DEFAULT_MAP_INSETS,
  policy?: MapCameraPolicy,
) {
  const frame = mapFocusFrame(viewport, insets);
  return clampCamera(
    {
      ...camera,
      x: point.x + (viewport.width / 2 - frame.x) / camera.zoom,
      y: point.y + (viewport.height / 2 - frame.y) / camera.zoom,
    },
    viewport,
    world,
    insets,
    policy,
  );
}

/** Fit cities into the unobscured frame, rather than behind the map HUD. */
export function fitCamera(
  points: readonly MapPoint[],
  viewport: MapSize,
  world: MapSize,
  insets: MapInsets = DEFAULT_MAP_INSETS,
  policy?: MapCameraPolicy,
): MapCamera {
  if (!points.length) {
    return clampCamera(
      {
        x: world.width / 2,
        y: world.height / 2,
        zoom: Math.min(
          viewport.width / world.width,
          viewport.height / world.height,
        ),
      },
      viewport,
      world,
      undefined,
      policy,
    );
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  // Reduce insets on small embedded previews instead of producing a negative frame.
  const frame = mapFocusFrame(viewport, insets);
  const limits = mapZoomLimits(viewport, world, policy);
  const zoom = Math.max(
    limits.min,
    Math.min(
      Math.min(2, limits.max),
      frame.width /
        Math.max(200, right - left + (policy?.fitPadding?.width ?? 110)),
      frame.height /
        Math.max(150, bottom - top + (policy?.fitPadding?.height ?? 100)),
    ),
  );
  return clampCamera(
    {
      x: (left + right) / 2 + (viewport.width / 2 - frame.x) / zoom,
      y: (top + bottom) / 2 + (viewport.height / 2 - frame.y) / zoom,
      zoom,
    },
    viewport,
    world,
    insets,
    policy,
  );
}
