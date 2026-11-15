/** Reference C's odd-q layout: every odd column is lowered by half a row. */
export interface TacticalPosition {
  x: number;
  y: number;
}
function cube(position: TacticalPosition) {
  const q = position.x;
  const r = position.y - (q - (q & 1)) / 2;
  return { q, r, s: -q - r };
}
function roundedOffset(value: ReturnType<typeof cube>): TacticalPosition {
  let q = Math.round(value.q),
    r = Math.round(value.r),
    s = Math.round(value.s);
  const dq = Math.abs(q - value.q),
    dr = Math.abs(r - value.r),
    ds = Math.abs(s - value.s);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  else s = -q - r;
  return { x: q, y: r + (q - (q & 1)) / 2 };
}

/** Includes both ends. Opposite nudges cover both sides of a ray on a hex edge. */
export function hexLine(
  a: TacticalPosition,
  b: TacticalPosition,
  nudge = 1e-6,
): TacticalPosition[] {
  const length = hexDistance(a, b);
  if (!Number.isFinite(length)) return [];
  if (!length) return [{ x: a.x, y: a.y }];
  const first = cube(a),
    second = cube(b);
  return Array.from({ length: length + 1 }, (_, index) => {
    const fraction = index / length;
    return roundedOffset({
      q: first.q + (second.q - first.q) * fraction + nudge,
      r: first.r + (second.r - first.r) * fraction + nudge,
      s: first.s + (second.s - first.s) * fraction - 2 * nudge,
    });
  });
}
export function hexDistance(a: TacticalPosition, b: TacticalPosition) {
  if (![a.x, a.y, b.x, b.y].every(Number.isInteger)) return Infinity;
  const first = cube(a),
    second = cube(b);
  return Math.max(
    Math.abs(first.q - second.q),
    Math.abs(first.r - second.r),
    Math.abs(first.s - second.s),
  );
}
export function hexNeighbors(
  position: TacticalPosition,
  columns: number,
  rows: number,
): TacticalPosition[] {
  const { x, y } = position;
  const candidates =
    x % 2 === 1
      ? [
          [x, y - 1],
          [x, y + 1],
          [x - 1, y],
          [x - 1, y + 1],
          [x + 1, y],
          [x + 1, y + 1],
        ]
      : [
          [x, y - 1],
          [x, y + 1],
          [x - 1, y - 1],
          [x - 1, y],
          [x + 1, y - 1],
          [x + 1, y],
        ];
  return candidates
    .filter(([nx, ny]) => nx >= 0 && nx < columns && ny >= 0 && ny < rows)
    .map(([x, y]) => ({ x, y }));
}
