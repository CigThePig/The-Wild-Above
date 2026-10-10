import type { Point, Shape } from "../animation/types";
import {
  area,
  AREA_EPS,
  DEPTH_EPS,
  depthAt,
  type DepthPlane,
  type Surface,
  type Fragment,
} from "./surfaces";

// Convex clipping, with the exact same crossing point shared by both halves.
export function halfPlane(
  points: Point[],
  line: DepthPlane,
  positive: boolean,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const da = depthAt(line, a),
      db = depthAt(line, b);
    const inside = positive ? da >= 0 : da <= 0,
      next = positive ? db >= 0 : db <= 0;
    if (inside) out.push(a);
    if (inside !== next) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  // Remove adjacent duplicates to keep Phaser triangulation well-conditioned.
  return out.filter((p, i) => {
    const q = out[(i + out.length - 1) % out.length];
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-9;
  });
}
function edge(a: Point, b: Point): DepthPlane {
  return { x: a.y - b.y, y: b.x - a.x, c: b.y * a.x - b.x * a.y };
}
function ccw(p: Point[]) {
  return area(p) < 0 ? p.slice().reverse() : p;
}
function valid(p: Point[]) {
  return p.length >= 3 && Math.abs(area(p)) > AREA_EPS;
}
function intersect(a: Point[], b: Point[]) {
  let p = a;
  for (let i = 0; i < b.length && valid(p); i++)
    p = halfPlane(p, edge(b[i], b[(i + 1) % b.length]), true);
  return valid(p) ? p : [];
}
function subtract(a: Point[], b: Point[]) {
  if (!valid(intersect(a, b))) return [a];
  const out: Point[][] = [];
  let rest = a;
  for (let i = 0; i < b.length && valid(rest); i++) {
    const line = edge(b[i], b[(i + 1) % b.length]);
    const outside = halfPlane(rest, line, false);
    if (valid(outside)) out.push(outside);
    rest = halfPlane(rest, line, true);
  }
  return out;
}
function bounds(p: Point[]) {
  return {
    minX: Math.min(...p.map((q) => q.x)),
    maxX: Math.max(...p.map((q) => q.x)),
    minY: Math.min(...p.map((q) => q.y)),
    maxY: Math.max(...p.map((q) => q.y)),
  };
}
function convex(p: Point[]) {
  return p.every(
    (a, i) =>
      depthAt(edge(a, p[(i + 1) % p.length]), p[(i + 2) % p.length]) >=
      -AREA_EPS,
  );
}
interface Candidate {
  shape: Shape;
  points: Point[];
  plane: DepthPlane;
  bounds: ReturnType<typeof bounds>;
  surface?: Surface;
  patches: Point[][];
}
// Small deterministic ear decomposition for the existing concave hook. No holes.
function patches(points: Point[]): Point[][] {
  if (convex(points)) return [points];
  const rest = points.slice(),
    out: Point[][] = [];
  while (rest.length > 3) {
    const index = rest.findIndex((b, i) => {
      const a = rest[(i + rest.length - 1) % rest.length],
        c = rest[(i + 1) % rest.length];
      if (depthAt(edge(a, b), c) <= AREA_EPS) return false;
      return !rest.some(
        (p, j) =>
          j !== i &&
          j !== (i + rest.length - 1) % rest.length &&
          j !== (i + 1) % rest.length &&
          [edge(a, b), edge(b, c), edge(c, a)].every(
            (e) => depthAt(e, p) >= -AREA_EPS,
          ),
      );
    });
    if (index < 0) return [];
    out.push([
      rest[(index + rest.length - 1) % rest.length],
      rest[index],
      rest[(index + 1) % rest.length],
    ]);
    rest.splice(index, 1);
  }
  if (valid(rest)) out.push(rest);
  return out;
}
export interface OcclusionResult {
  shapes: Shape[];
  fragments: Fragment[];
  decisions: {
    a: string;
    b: string;
    relation: "crossing" | "ordered" | "coplanar";
    front: string | null;
    approximate: boolean;
  }[];
  diagnostics: string[];
  stats: {
    sourceSurfaces: number;
    fragments: number;
    comparisons: number;
    overlaps: number;
    maxFragments: number;
    resolutionMs: number;
  };
}
// Visible-region subtraction resolves even painter-order cycles. No recursive BSP.
// Limits are failure guards, never a claim that an incomplete resolution is exact.
export function resolveOcclusion(
  legacy: Shape[],
  surfaces: Surface[],
  limit = 128,
): OcclusionResult {
  const start = performance.now();
  for (const s of surfaces) {
    s.overlaps = [];
    s.occluders = [];
    s.fragments = [];
    s.diagnostics = s.diagnostics.filter(
      (d) => d !== "fragment budget exceeded",
    );
    s.status = s.culled ? "culled" : "visible";
  }
  const diagnostics: string[] = [],
    decisions: OcclusionResult["decisions"] = [];
  const candidates: Candidate[] = [
    ...legacy.map((shape) => ({
      shape,
      points: ccw(shape.points),
      plane: { x: 0, y: 0, c: shape.depth },
      bounds: bounds(shape.points),
      patches: patches(ccw(shape.points)),
    })),
    ...surfaces
      .filter((s) => !s.culled)
      .map((s) => ({
        shape: s,
        points: ccw(s.points),
        plane: s.plane,
        bounds: bounds(s.points),
        surface: s,
        patches: patches(ccw(s.points)),
      })),
  ].filter((c) => valid(c.points));
  candidates.sort((a, b) =>
    a.shape.id < b.shape.id ? -1 : a.shape.id > b.shape.id ? 1 : 0,
  );
  const cuts = new Map<Candidate, Point[][]>();
  let comparisons = 0,
    overlaps = 0;
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i],
        b = candidates[j];
      if (!a.surface && !b.surface && a.shape.alpha < 1 === b.shape.alpha < 1)
        continue; // Preserve unrelated approximation ordering.
      comparisons++;
      if (
        a.bounds.maxX <= b.bounds.minX ||
        b.bounds.maxX <= a.bounds.minX ||
        a.bounds.maxY <= b.bounds.minY ||
        b.bounds.maxY <= a.bounds.minY
      )
        continue;
      if (!a.patches.length || !b.patches.length) {
        diagnostics.push(
          `unsupported nonconvex overlap: ${a.shape.id} / ${b.shape.id}`,
        );
        continue;
      }
      for (const pa of a.patches)
        for (const pb of b.patches) {
          const overlap = intersect(pa, pb);
          if (!valid(overlap)) continue;
          overlaps++;
          a.surface?.overlaps.push(b.shape.id);
          b.surface?.overlaps.push(a.shape.id);
          const delta = {
            x: b.plane.x - a.plane.x,
            y: b.plane.y - a.plane.y,
            c: b.plane.c - a.plane.c,
          };
          const ds = overlap.map((p) => depthAt(delta, p)),
            lo = Math.min(...ds),
            hi = Math.max(...ds);
          const tie = lo >= -DEPTH_EPS && hi <= DEPTH_EPS;
          const relation = tie
            ? "coplanar"
            : lo < -DEPTH_EPS && hi > DEPTH_EPS
              ? "crossing"
              : "ordered";
          const bFront = tie ? true : lo >= -DEPTH_EPS || hi > DEPTH_EPS;
          const aFront = !tie && (hi <= DEPTH_EPS || lo < -DEPTH_EPS);
          decisions.push({
            a: a.shape.id,
            b: b.shape.id,
            relation,
            front:
              relation === "crossing" ? null : bFront ? b.shape.id : a.shape.id,
            approximate: !a.surface || !b.surface,
          });
          const cut = (
            target: Candidate,
            occluder: Candidate,
            region: Point[],
          ) => {
            if (occluder.shape.alpha < 1 || !valid(region)) return;
            const list = cuts.get(target) ?? [];
            list.push(region);
            cuts.set(target, list);
            target.surface?.occluders.push(occluder.shape.id);
          };
          if (bFront)
            cut(
              a,
              b,
              relation === "crossing"
                ? halfPlane(overlap, delta, true)
                : overlap,
            );
          if (aFront)
            cut(
              b,
              a,
              relation === "crossing"
                ? halfPlane(overlap, delta, false)
                : overlap,
            );
        }
    }
  const shapes: Shape[] = [],
    fragments: Fragment[] = [];
  let maxFragments = 0;
  for (const c of candidates) {
    let pieces = cuts.has(c) ? c.patches : [c.points];
    let unresolved = false;
    for (const cut of cuts.get(c) ?? []) {
      const next = pieces.flatMap((p) => subtract(p, cut));
      if (next.length > limit) {
        unresolved = true;
        diagnostics.push(`fragment budget exceeded: ${c.shape.id}`);
        break;
      }
      pieces = next;
    }
    maxFragments = Math.max(maxFragments, pieces.length);
    if (c.surface) {
      c.surface.status = unresolved
        ? "unresolved"
        : pieces.length
          ? "visible"
          : "hidden";
      if (unresolved) c.surface.diagnostics.push("fragment budget exceeded");
    }
    pieces.forEach((points, i) => {
      const f: Fragment = {
        component: c.shape.component,
        color: c.shape.color,
        alpha: c.shape.alpha,
        id:
          pieces.length === 1 && !cuts.has(c)
            ? c.shape.id
            : `${c.shape.id}.fragment.${i}`,
        source: c.shape.id,
        points,
        depth:
          points.reduce((s, p) => s + depthAt(c.plane, p), 0) / points.length,
      };
      // Preserve original representative-depth sorting between untouched legacy shapes.
      fragments.push(f);
      shapes.push(f);
      c.surface?.fragments.push(f.id);
    });
  }
  // Translucent approximations are clipped by all nearer opaque surfaces first,
  // then composited over the remaining opaque regions. No opaque cross-fading.
  shapes.sort(
    (a, b) =>
      Number(a.alpha < 1) - Number(b.alpha < 1) ||
      a.depth - b.depth ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return {
    shapes,
    fragments,
    decisions,
    diagnostics,
    stats: {
      sourceSurfaces: surfaces.length,
      fragments: fragments.length,
      comparisons,
      overlaps,
      maxFragments,
      resolutionMs: performance.now() - start,
    },
  };
}
