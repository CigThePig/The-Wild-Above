import type { Vec, Point, Shape } from "../animation/types";
import { K, TILT, VIEW, project } from "./projection";
export { VIEW };

export interface DepthPlane {
  x: number;
  y: number;
  c: number;
}
export interface Surface {
  id: string;
  component: string;
  world: Vec[];
  points: Point[];
  normal: Vec;
  plane: DepthPlane;
  depth: number;
  color: number;
  alpha: number;
  facing: number;
  doubleSided: boolean;
  culled: boolean;
  status: "visible" | "hidden" | "culled" | "unresolved";
  overlaps: string[];
  occluders: string[];
  fragments: string[];
  diagnostics: string[];
}
export interface Fragment extends Shape {
  source: string;
}
export const AREA_EPS = 1e-8;
export const DEPTH_EPS = 1e-7;
export function area(p: Point[]) {
  return (
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + a.x * b.y - b.x * a.y;
    }, 0) / 2
  );
}
export function depthAt(p: DepthPlane, q: Point) {
  return p.x * q.x + p.y * q.y + p.c;
}
// The projection is orthogonal only up to K=.72²+.694²; do not assume K=1.
export function makeSurface(
  id: string,
  component: string,
  world: Vec[],
  color: number,
  alpha = 1,
  doubleSided = false,
): Surface {
  const points = world.map(project);
  const a = world[0] ?? { x: 0, y: 0, z: 0 },
    b = world[1] ?? a,
    c = world[2] ?? a;
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
    v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const n = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };
  const len = Math.hypot(n.x, n.y, n.z);
  const normal = {
    x: n.x / (len || 1),
    y: n.y / (len || 1),
    z: n.z / (len || 1),
  };
  const facing = normal.y * VIEW.y + normal.z * VIEW.z;
  const plane =
    Math.abs(facing) > 1e-12
      ? {
          x: (-normal.x * K) / facing,
          y: -(normal.y * TILT.y - normal.z * TILT.z) / facing,
          c: ((normal.x * a.x + normal.y * a.y + normal.z * a.z) * K) / facing,
        }
      : { x: 0, y: 0, c: 0 };
  const invalid =
    world.length < 3 ||
    world.some((p) => !Object.values(p).every(Number.isFinite)) ||
    len < 1e-12 ||
    world.some(
      (p) =>
        Math.abs(
          normal.x * (p.x - a.x) +
            normal.y * (p.y - a.y) +
            normal.z * (p.z - a.z),
        ) > 1e-7,
    );
  const diagnostics = invalid ? ["invalid or nonplanar surface geometry"] : [];
  const culled =
    invalid ||
    (!doubleSided && facing <= 0) ||
    Math.abs(area(points)) <= AREA_EPS;
  return {
    id,
    component,
    world,
    points,
    normal,
    plane,
    depth: points.reduce((s, p) => s + p.d, 0) / (points.length || 1),
    color,
    alpha,
    facing,
    doubleSided,
    culled,
    status: culled ? "culled" : "visible",
    overlaps: [],
    occluders: [],
    fragments: [],
    diagnostics,
  };
}
