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
  let min = Infinity,
    max = -Infinity;
  for (const p of points) {
    const d = depthAt(line, p);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  if (positive ? min >= 0 : max <= 0) return points;
  if (positive ? max < 0 : min > 0) return [];
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
    return (p.x - q.x) ** 2 + (p.y - q.y) ** 2 > 1e-18;
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
  for (let i = 0; i < b.length && p.length >= 3; i++)
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
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const q of p) {
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y);
    maxY = Math.max(maxY, q.y);
  }
  return { minX, maxX, minY, maxY };
}
function convex(p: Point[]) {
  return p.every(
    (a, i) =>
      depthAt(edge(a, p[(i + 1) % p.length]), p[(i + 2) % p.length]) >=
      -AREA_EPS,
  );
}
function overlapsConvex(a: Point[], b: Point[]) {
  for (const [p, q] of [
    [a, b],
    [b, a],
  ])
    for (let i = 0; i < p.length; i++) {
      const e = edge(p[i], p[(i + 1) % p.length]);
      let max = -Infinity;
      for (const v of q) max = Math.max(max, depthAt(e, v));
      if (max <= AREA_EPS) return false;
    }
  return true;
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
  method: "geometric-order" | "visible-region-clipping";
  fallbackReason: string | null;
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
    drawVertices: number;
    legacyPrimitives: number;
  };
}
// The ordinary actor has an acyclic painter order after its true depth
// crossings are split. Avoid subtracting every hidden patch in that common case.
// A real ordering cycle falls back to visible-region subtraction below.
function orderFragments(
  candidates: Candidate[],
  decisions: OcclusionResult["decisions"],
  limit: number,
  work: { comparisons: number; reason: string },
): Fragment[] | null {
  if (candidates.some((c) => c.shape.alpha < 1 && c.shape.alpha > 0)) {
    work.reason = "transparent composition";
    return null;
  }
  const relations = new Map<string, OcclusionResult["decisions"][number]>();
  for (const d of decisions) {
    const key = `${d.a}\0${d.b}`,
      old = relations.get(key);
    relations.set(
      key,
      old && (old.front !== d.front || old.relation === "crossing")
        ? { ...d, relation: "crossing", front: null }
        : d,
    );
  }
  const lines = new Map<string, DepthPlane[]>();
  const byId = new Map(candidates.map((c) => [c.shape.id, c]));
  for (const d of relations.values())
    if (d.relation === "crossing") {
      const a = byId.get(d.a)!,
        b = byId.get(d.b)!;
      const line = {
        x: b.plane.x - a.plane.x,
        y: b.plane.y - a.plane.y,
        c: b.plane.c - a.plane.c,
      };
      for (const id of [d.a, d.b]) {
        const list = lines.get(id) ?? [];
        list.push(line);
        lines.set(id, list);
      }
    }
  const nodes: {
    fragment: Fragment;
    candidate: Candidate;
    bounds: ReturnType<typeof bounds>;
  }[] = [];
  for (const c of candidates) {
    let pieces = lines.has(c.shape.id) ? c.patches : [c.points];
    for (const line of lines.get(c.shape.id) ?? []) {
      pieces = pieces.flatMap((p) => {
        const ds = p.map((q) => depthAt(line, q));
        if (Math.min(...ds) >= -DEPTH_EPS || Math.max(...ds) <= DEPTH_EPS)
          return [p];
        return [halfPlane(p, line, true), halfPlane(p, line, false)].filter(
          valid,
        );
      });
      if (pieces.length > limit) {
        work.reason = "crossing split budget";
        return null;
      }
    }
    if (nodes.length + pieces.length > 1024) {
      work.reason = "total split budget";
      return null;
    }
    pieces.forEach((points, i) =>
      nodes.push({
        candidate: c,
        bounds: bounds(points),
        fragment: {
          id: pieces.length === 1 ? c.shape.id : `${c.shape.id}.fragment.${i}`,
          source: c.shape.id,
          component: c.shape.component,
          color: c.shape.color,
          alpha: c.shape.alpha,
          points,
          depth:
            points.reduce((sum, p) => sum + depthAt(c.plane, p), 0) /
            points.length,
        },
      }),
    );
  }
  const edges = nodes.map(() => [] as number[]),
    incoming = nodes.map(() => 0);
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      if (a.candidate === b.candidate) continue;
      work.comparisons++;
      if (
        a.bounds.maxX <= b.bounds.minX ||
        b.bounds.maxX <= a.bounds.minX ||
        a.bounds.maxY <= b.bounds.minY ||
        b.bounds.maxY <= a.bounds.minY
      )
        continue;
      const delta = {
        x: b.candidate.plane.x - a.candidate.plane.x,
        y: b.candidate.plane.y - a.candidate.plane.y,
        c: b.candidate.plane.c - a.candidate.plane.c,
      };
      let frontB: boolean;
      if (!a.candidate.surface && !b.candidate.surface)
        frontB =
          b.fragment.depth > a.fragment.depth ||
          (b.fragment.depth === a.fragment.depth &&
            b.fragment.id > a.fragment.id);
      else {
        const original = relations.get(
          `${a.fragment.source}\0${b.fragment.source}`,
        );
        if (!original) continue;
        if (original.relation !== "crossing") {
          const aa = convex(a.fragment.points)
            ? [a.fragment.points]
            : a.candidate.patches;
          const bb = convex(b.fragment.points)
            ? [b.fragment.points]
            : b.candidate.patches;
          if (!aa.some((pa) => bb.some((pb) => overlapsConvex(pa, pb))))
            continue;
          frontB = original.front === b.fragment.source;
        } else {
          // Convex semantic faces / split fragments. Concave uncut legacy hook is
          // decomposed only for the actual overlap test, without changing its drawing.
          const aa = convex(a.fragment.points)
            ? [a.fragment.points]
            : a.candidate.patches;
          const bb = convex(b.fragment.points)
            ? [b.fragment.points]
            : b.candidate.patches;
          const overlap = aa.flatMap((pa) =>
            bb.flatMap((pb) => intersect(pa, pb)),
          );
          if (!overlap.length) continue;
          const ds = overlap.map((p) => depthAt(delta, p)),
            lo = Math.min(...ds),
            hi = Math.max(...ds);
          if (lo < -DEPTH_EPS && hi > DEPTH_EPS) return null;
          frontB =
            lo >= -DEPTH_EPS && hi <= DEPTH_EPS
              ? b.fragment.source > a.fragment.source
              : hi > DEPTH_EPS;
        }
      }
      const from = frontB ? i : j,
        to = frontB ? j : i;
      edges[from].push(to);
      incoming[to]++;
    }
  const ready = nodes.map((_, i) => i).filter((i) => !incoming[i]),
    out: Fragment[] = [];
  const compare = (a: number, b: number) =>
    nodes[a].fragment.depth - nodes[b].fragment.depth ||
    (nodes[a].fragment.id < nodes[b].fragment.id ? -1 : 1);
  while (ready.length) {
    ready.sort(compare);
    const i = ready.shift()!;
    out.push(nodes[i].fragment);
    for (const j of edges[i]) if (--incoming[j] === 0) ready.push(j);
  }
  return out.length === nodes.length ? out : null;
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
  const diagnostics: string[] = surfaces.flatMap((s) =>
      s.diagnostics.map((d) => `${s.id}: ${d}`),
    ),
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
  const pending: {
    target: Candidate;
    occluder: Candidate;
    pa: Point[];
    pb: Point[];
    delta: DepthPlane;
    positive: boolean;
    crossing: boolean;
    overlap?: Point[];
  }[] = [];
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
          const delta = {
            x: b.plane.x - a.plane.x,
            y: b.plane.y - a.plane.y,
            c: b.plane.c - a.plane.c,
          };
          const values = pa.map((p) => depthAt(delta, p));
          let lo = Math.min(...values),
            hi = Math.max(...values),
            overlap: Point[] | undefined;
          if (lo >= -DEPTH_EPS || hi <= DEPTH_EPS) {
            if (!overlapsConvex(pa, pb)) continue;
          } else {
            overlap = intersect(pa, pb);
            if (!valid(overlap)) continue;
            const ds = overlap.map((p) => depthAt(delta, p));
            lo = Math.min(...ds);
            hi = Math.max(...ds);
          }
          overlaps++;
          a.surface?.overlaps.push(b.shape.id);
          b.surface?.overlaps.push(a.shape.id);
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
          const queue = (
            target: Candidate,
            occluder: Candidate,
            positive: boolean,
          ) => {
            if (occluder.shape.alpha < 1) return;
            pending.push({
              target,
              occluder,
              pa,
              pb,
              delta,
              positive,
              crossing: relation === "crossing",
              overlap,
            });
            target.surface?.occluders.push(occluder.shape.id);
          };
          if (bFront) queue(a, b, true);
          if (aFront) queue(b, a, false);
        }
    }
  const work = { comparisons: 0, reason: "ordering cycle" };
  const ordered = orderFragments(candidates, decisions, limit, work);
  comparisons += work.comparisons;
  if (ordered) {
    for (const c of candidates)
      if (c.surface) {
        c.surface.fragments = ordered
          .filter((f) => f.source === c.shape.id)
          .map((f) => f.id);
        c.surface.status = c.surface.fragments.length ? "visible" : "hidden";
      }
    return {
      method: "geometric-order",
      fallbackReason: null,
      shapes: ordered,
      fragments: ordered,
      decisions,
      diagnostics,
      stats: {
        drawVertices: ordered.reduce((n, s) => n + s.points.length, 0),
        legacyPrimitives: legacy.length,
        sourceSurfaces: surfaces.length,
        fragments: ordered.length,
        comparisons,
        overlaps,
        maxFragments: Math.max(
          0,
          ...candidates.map(
            (c) => ordered.filter((f) => f.source === c.shape.id).length,
          ),
        ),
        resolutionMs: performance.now() - start,
      },
    };
  }
  for (const p of pending) {
    const overlap = p.overlap ?? intersect(p.pa, p.pb);
    const region = p.crossing
      ? halfPlane(overlap, p.delta, p.positive)
      : overlap;
    if (!valid(region)) continue;
    const list = cuts.get(p.target) ?? [];
    list.push(region);
    cuts.set(p.target, list);
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
    method: "visible-region-clipping",
    fallbackReason: work.reason,
    shapes,
    fragments,
    decisions,
    diagnostics,
    stats: {
      drawVertices: shapes.reduce((n, s) => n + s.points.length, 0),
      legacyPrimitives: legacy.length,
      sourceSurfaces: surfaces.length,
      fragments: fragments.length,
      comparisons,
      overlaps,
      maxFragments,
      resolutionMs: performance.now() - start,
    },
  };
}
