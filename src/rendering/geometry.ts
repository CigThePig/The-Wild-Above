import type { Vec, Point, Shape, Component } from "../animation/types";
import { vec, add, rotate } from "../animation/motion/math";
import { makeSurface, type Surface } from "./surfaces";
import { resolveOcclusion, type OcclusionResult } from "./occlusion";
export { vec, add, rotate };
export const project = (p: Vec) => ({
  x: p.x,
  y: p.y * 0.72 - p.z * 0.694,
  d: p.y * 0.694 + p.z * 0.72,
});
export const mix = (a: Vec, b: Vec, t: number) =>
  vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
// Retained monotone-chain silhouette construction from the supplied renderer.
export function hull(points: Point[]): Point[] {
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y),
    cross = (o: Point, a: Point, b: Point) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x),
    lo: Point[] = [],
    hi: Point[] = [];
  for (const a of p) {
    while (lo.length > 1 && cross(lo.at(-2)!, lo.at(-1)!, a) <= 0) lo.pop();
    lo.push(a);
  }
  for (const a of p.slice().reverse()) {
    while (hi.length > 1 && cross(hi.at(-2)!, hi.at(-1)!, a) <= 0) hi.pop();
    hi.push(a);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function blockRings(p: Vec, w: number, d: number, h: number, yaw: number) {
  const plan = [
    [-w * 0.38, -d / 2],
    [w * 0.38, -d / 2],
    [w / 2, -d * 0.22],
    [w / 2, d * 0.32],
    [w * 0.32, d / 2],
    [-w * 0.32, d / 2],
    [-w / 2, d * 0.32],
    [-w / 2, -d * 0.22],
  ];
  return [-h / 2, h / 2].map((z) =>
    plan.map(([x, y]) => add(p, rotate(vec(x, y, z), yaw))),
  );
}
export class Geometry {
  shapes: Shape[] = [];
  components: Component[] = [];
  surfaces: Surface[] = [];
  occlusion!: OcclusionResult;
  generationMs = 0;
  private started = performance.now();
  component(
    id: string,
    parent: string | null,
    kind: Component["kind"],
    world: Vec,
    contact?: boolean,
  ) {
    const origin = this.components.find((c) => c.id === parent)?.world ?? vec();
    const c: Component = {
      id,
      parent,
      kind,
      world,
      local: vec(world.x - origin.x, world.y - origin.y, world.z - origin.z),
      contact,
      visible: true,
      opacity: 1,
      drawOrder: [],
      issues: [],
    };
    this.components.push(c);
    return c;
  }
  polygon(id: string, points: Vec[], color: number, bias = 0, alpha = 1) {
    this.shapes.push({
      id,
      component: id,
      points: points.map(project),
      depth:
        points.reduce((s, p) => s + project(p).d, 0) / points.length + bias,
      color,
      alpha,
    });
  }
  block(
    id: string,
    p: Vec,
    w: number,
    d: number,
    h: number,
    yaw: number,
    color: number,
    cap?: number,
  ) {
    const rings = blockRings(p, w, d, h, yaw);
    this.shapes.push({
      id,
      component: id,
      points: hull(rings.flat().map(project)),
      depth: project(p).d,
      color,
      alpha: 1,
    });
    if (cap !== undefined) {
      this.polygon(id + ".cap", rings[1], cap, 2);
      this.shapes.at(-1)!.component = id;
    }
  }
  surfaceBlock(
    id: string,
    p: Vec,
    w: number,
    d: number,
    h: number,
    yaw: number,
    color: number,
    cap = color,
  ) {
    const rings = blockRings(p, w, d, h, yaw);
    const face = (name: string, points: Vec[], fill: number) =>
      this.surfaces.push(makeSurface(`${id}.${name}`, id, points, fill));
    face("top", rings[1], cap);
    face("bottom", rings[0].slice().reverse(), color);
    const names = [
      "front",
      "bevel.0",
      "right",
      "bevel.1",
      "rear",
      "bevel.2",
      "left",
      "bevel.3",
    ];
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      face(
        names[i],
        [rings[0][i], rings[0][j], rings[1][j], rings[1][i]],
        color,
      );
    }
  }
  limb(id: string, a: Vec, b: Vec, wa: number, wb: number, color: number) {
    // Small opaque slices localize depth crossings; stable IDs break exact depth ties.
    for (let i = 0; i < 8; i++) {
      const t = i / 8,
        u = (i + 1) / 8,
        A = project(mix(a, b, t)),
        B = project(mix(a, b, u));
      const pts: Point[] = [];
      for (const [q, w] of [
        [A, wa + (wb - wa) * t],
        [B, wa + (wb - wa) * u],
      ] as const)
        for (let j = 0; j < 8; j++) {
          const angle = (j * Math.PI) / 4;
          pts.push({
            x: q.x + (Math.cos(angle) * w) / 2,
            y: q.y + (Math.sin(angle) * w) / 2,
          });
        }
      this.shapes.push({
        id: `${id}.slice.${i}`,
        component: id,
        points: hull(pts),
        depth: (A.d + B.d) / 2,
        color,
        alpha: 1,
      });
    }
  }
  finish() {
    this.generationMs = performance.now() - this.started;
    this.occlusion = resolveOcclusion(this.shapes, this.surfaces);
    this.shapes = this.occlusion.shapes;
    this.shapes.forEach((s, i) => {
      const c = this.components.find((c) => c.id === s.component);
      c?.drawOrder.push(i);
      if (s.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
        c?.issues.push("non-finite geometry");
    });
    for (const c of this.components) {
      if (Object.values(c.world).some((v) => !Number.isFinite(v)))
        c.issues.push("non-finite transform");
      const points = this.shapes
        .filter((s) => s.component === c.id)
        .flatMap((s) => s.points);
      if (points.length) {
        const xs = points.map((p) => p.x),
          ys = points.map((p) => p.y);
        c.bounds = {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        };
      }
    }
    return this;
  }
}
