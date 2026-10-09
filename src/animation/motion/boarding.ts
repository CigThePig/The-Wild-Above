import type { Vec } from "../types";
import { vec } from "./math";
export const FIELD = { minX: -435, maxX: 435, minY: -330, maxY: 330 };
export const MECH_CLEARANCE = 34;
export const inField = (p: Vec, margin = 0) =>
  p.x >= FIELD.minX + margin &&
  p.x <= FIELD.maxX - margin &&
  p.y >= FIELD.minY + margin &&
  p.y <= FIELD.maxY - margin;
export function segmentClear(
  a: Vec,
  b: Vec,
  center: Vec,
  radius = MECH_CLEARANCE,
) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    den = dx * dx + dy * dy,
    t = Math.max(
      0,
      Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / (den || 1)),
    );
  return (
    Math.hypot(a.x + t * dx - center.x, a.y + t * dy - center.y) >=
    radius - 1e-7
  );
}
/** Small visibility graph for one circular footprint inside a convex field.
 * Boundary/ring intersections preserve routes from points exactly on a wall.
 * This is boarding approach geometry, not a general world navigation system. */
export function boardingRoute(
  start: Vec,
  goal: Vec,
  center: Vec,
): Vec[] | null {
  if (!inField(start) || !inField(goal)) return null;
  const nodes: Vec[] = [{ ...start }, { ...goal }],
    r = 38;
  const add = (p: Vec) => {
    if (
      inField(p) &&
      Math.hypot(p.x - center.x, p.y - center.y) >= MECH_CLEARANCE - 1e-7 &&
      !nodes.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < 1e-6)
    )
      nodes.push(p);
  };
  for (let i = 0; i < 64; i++) {
    const a = (i * Math.PI) / 32;
    add(vec(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r));
  }
  for (const p of [start, goal]) {
    const a = Math.atan2(p.y - center.y, p.x - center.x);
    add(vec(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r));
  }
  for (const x of [FIELD.minX, FIELD.maxX]) {
    const dx = x - center.x;
    if (Math.abs(dx) <= r) {
      const h = Math.sqrt(r * r - dx * dx);
      add(vec(x, center.y + h));
      add(vec(x, center.y - h));
    }
  }
  for (const y of [FIELD.minY, FIELD.maxY]) {
    const dy = y - center.y;
    if (Math.abs(dy) <= r) {
      const h = Math.sqrt(r * r - dy * dy);
      add(vec(center.x + h, y));
      add(vec(center.x - h, y));
    }
  }
  const distances = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    visited = new Set<number>();
  distances[0] = 0;
  while (visited.size < nodes.length) {
    let best = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!visited.has(i) && (best < 0 || distances[i] < distances[best]))
        best = i;
    if (best < 0 || !Number.isFinite(distances[best])) return null;
    if (best === 1) break;
    visited.add(best);
    for (let i = 0; i < nodes.length; i++) {
      if (
        visited.has(i) ||
        i === best ||
        !segmentClear(nodes[best], nodes[i], center)
      )
        continue;
      const d =
        distances[best] +
        Math.hypot(nodes[best].x - nodes[i].x, nodes[best].y - nodes[i].y);
      if (d < distances[i]) {
        distances[i] = d;
        previous[i] = best;
      }
    }
  }
  const path: Vec[] = [];
  for (let i = 1; i !== 0; i = previous[i]) {
    if (i < 0) return null;
    path.unshift(nodes[i]);
  }
  return path;
}

/** Resolve the footprint without projecting the pilot through the field wall. */
export function separatePilot(point: Vec, previous: Vec, center: Vec): Vec {
  const dx = point.x - center.x,
    dy = point.y - center.y,
    d = Math.hypot(dx, dy);
  if (d >= MECH_CLEARANCE) return point;
  const projected =
    d > 0.001
      ? vec(
          center.x + (dx / d) * MECH_CLEARANCE,
          center.y + (dy / d) * MECH_CLEARANCE,
        )
      : vec(center.x + MECH_CLEARANCE, center.y);
  if (inField(projected)) return projected;
  // Retain the last valid position when the radial collision response crosses a wall.
  if (
    inField(previous) &&
    Math.hypot(previous.x - center.x, previous.y - center.y) >=
      MECH_CLEARANCE - 1e-7
  )
    return previous;
  // Only needed for invalid external starting placements; move toward the field interior.
  const inward = Math.atan2(-center.y, -center.x);
  return vec(
    center.x + Math.cos(inward) * MECH_CLEARANCE,
    center.y + Math.sin(inward) * MECH_CLEARANCE,
  );
}
