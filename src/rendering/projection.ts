import type { Vec } from "../animation/types";

// The one fixed camera. +x right, +y south, +z up; larger depth is nearer.
// Screen y = .72*y - .694*z and depth d = .694*y + .72*z. The pair is close
// to, but not exactly, a unit rotation: plane maths must use K, not 1.
export const TILT = { y: 0.72, z: 0.694 } as const;
/** Unit-ish direction from the scene toward the viewer. */
export const VIEW = { x: 0, y: TILT.z, z: TILT.y } as const;
export const K = TILT.y ** 2 + TILT.z ** 2;
export const project = (p: Vec) => ({
  x: p.x,
  y: p.y * TILT.y - p.z * TILT.z,
  d: p.y * TILT.z + p.z * TILT.y,
});
