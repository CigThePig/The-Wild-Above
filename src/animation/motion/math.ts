import type { Vec } from "../types";
export const clamp = (x: number, a: number, b: number) =>
    Math.max(a, Math.min(b, x)),
  mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const damping = (k: number, dt: number) => 1 - Math.exp(-k * dt),
  angle = (a: number, b: number) =>
    Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z }),
  add = (a: Vec, b: Vec) => vec(a.x + b.x, a.y + b.y, a.z + b.z),
  sub = (a: Vec, b: Vec) => vec(a.x - b.x, a.y - b.y, a.z - b.z),
  mul = (a: Vec, k: number) => vec(a.x * k, a.y * k, a.z * k),
  dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: Vec) => Math.hypot(a.x, a.y, a.z),
  norm = (a: Vec) => mul(a, 1 / (len(a) || 1));
export function rotate(p: Vec, yaw: number) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return vec(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}
export function solveLeg(hip: Vec, foot: Vec, forward: Vec) {
  const dvec = sub(foot, hip),
    raw = len(dvec),
    d = clamp(raw, 0.01, 46.999),
    axis = norm(dvec),
    a = (23 * 23 - 24 * 24 + d * d) / (2 * d),
    h = Math.sqrt(Math.max(0, 23 * 23 - a * a));
  let bend = sub(forward, mul(axis, dot(forward, axis)));
  if (len(bend) < 0.01) bend = vec(0, -1, 0);
  const knee = add(hip, add(mul(axis, a), mul(norm(bend), h)));
  return { knee, reach: raw };
}

export const rot = (x: number, y: number, a: number) => rotate(vec(x, y), a);
export const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: Vec, b: Vec, t: number) =>
  vec(mix(a.x, b.x, t), mix(a.y, b.y, t), mix(a.z, b.z, t));
