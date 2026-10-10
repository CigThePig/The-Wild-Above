import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Geometry, project } from "../../src/rendering/geometry";
import {
  makeSurface,
  area,
  depthAt,
  type Surface,
  type DepthPlane,
} from "../../src/rendering/surfaces";
import { resolveOcclusion } from "../../src/rendering/occlusion";
import { Simulation } from "../../src/animation/simulation";
import { buildRig } from "../../src/animation/rig";
import { defaultConfig } from "../../src/animation/config";
import type { Point } from "../../src/animation/types";
const k = 0.72 ** 2 + 0.694 ** 2;
const rect = (x = 0, y = 0, w = 4, h = 4): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
function face(id: string, points: Point[], plane: DepthPlane): Surface {
  return makeSurface(
    id,
    id,
    points.map((p) => {
      const d = depthAt(plane, p);
      return {
        x: p.x,
        y: (0.72 * p.y + 0.694 * d) / k,
        z: (-0.694 * p.y + 0.72 * d) / k,
      };
    }),
    0xa5a082,
  );
}
// Independent winding-number inclusion. No resolver clipping helpers used.
function contains(poly: Point[], p: Point) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function oracle(surfaces: Surface[]) {
  const result = resolveOcclusion([], surfaces);
  expect(result.diagnostics).toEqual([]);
  for (let x = -5.137; x < 6; x += 0.173)
    for (let y = -5.093; y < 6; y += 0.191) {
      const p = { x, y };
      const source = surfaces
        .filter((s) => !s.culled && contains(s.points, p))
        .sort(
          (a, b) =>
            depthAt(a.plane, p) - depthAt(b.plane, p) ||
            a.id.localeCompare(b.id),
        );
      const visible = result.shapes.filter((s) => contains(s.points, p));
      expect(visible.length > 0).toBe(source.length > 0);
      if (source.length)
        expect((visible.at(-1)! as { source?: string }).source).toBe(
          source.at(-1)!.id,
        );
    }
  return result;
}
describe("semantic surfaces", () => {
  it("extrudes the original octagonal footprint with outward normals and stable IDs", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -Math.PI * 2, max: Math.PI * 2, noNaN: true }),
        (yaw) => {
          const g = new Geometry();
          g.component("mech.torso", "mech", "shape", { x: 10, y: 20, z: 40 });
          g.surfaceBlock(
            "mech.torso",
            { x: 10, y: 20, z: 40 },
            37,
            29,
            26,
            yaw,
            123,
            456,
          );
          expect(g.surfaces).toHaveLength(10);
          expect(new Set(g.surfaces.map((s) => s.id)).size).toBe(10);
          for (const s of g.surfaces) {
            expect(s.component).toBe("mech.torso");
            expect(Math.hypot(s.normal.x, s.normal.y, s.normal.z)).toBeCloseTo(
              1,
              10,
            );
            const center = s.world.reduce(
              (a, p) => ({
                x: a.x + p.x / s.world.length,
                y: a.y + p.y / s.world.length,
                z: a.z + p.z / s.world.length,
              }),
              { x: -10, y: -20, z: -40 },
            );
            expect(
              center.x * s.normal.x +
                center.y * s.normal.y +
                center.z * s.normal.z,
            ).toBeGreaterThan(0);
            s.world.forEach((p, i) => {
              expect(Object.values(p).every(Number.isFinite)).toBe(true);
              expect(s.points[i]).toMatchObject({
                x: project(p).x,
                y: project(p).y,
              });
              if (!s.culled)
                expect(depthAt(s.plane, s.points[i])).toBeCloseTo(
                  project(p).d,
                  7,
                );
            });
            if (!s.culled) expect(area(s.points)).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100, seed: 197 },
    );
  });
  it("culls reverse winding and safely handles degenerate / edge-on faces", () => {
    const s = face("a", rect(), { x: 0, y: 0, c: 0 });
    expect(makeSurface("b", "b", s.world.slice().reverse(), 0).culled).toBe(
      true,
    );
    expect(makeSurface("empty", "empty", [], 0).diagnostics).toContain(
      "invalid or nonplanar surface geometry",
    );
    const edge = makeSurface(
      "edge",
      "edge",
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 1 },
      ],
      0,
    );
    expect(edge.culled).toBe(true);
  });
});
describe("visible-region occlusion", () => {
  it("keeps disjoint surfaces and orders opaque overlap", () => {
    oracle([
      face("a", rect(-4, -4, 2, 2), { x: 0, y: 0, c: 0 }),
      face("b", rect(0, 0), { x: 0, y: 0, c: 1 }),
    ]);
    const result = oracle([
      face("a", rect(), { x: 0, y: 0, c: 0 }),
      face("b", rect(1, 1), { x: 0, y: 0, c: 1 }),
    ]);
    expect(result.decisions[0].front).toBe("b");
  });
  it("resolves crossings and preserves each source area without duplicate fragments", () => {
    const result = oracle([
      face("a", rect(), { x: 1, y: 0, c: 0 }),
      face("b", rect(), { x: -1, y: 0, c: 4 }),
    ]);
    expect(result.decisions[0].relation).toBe("crossing");
    for (const id of ["a", "b"])
      expect(
        result.fragments
          .filter((f) => f.source === id)
          .reduce((sum, s) => sum + Math.abs(area(s.points)), 0),
      ).toBeCloseTo(16, 9);
  });
  it("uses deterministic coplanar ties and tolerates sub-epsilon separation", () => {
    for (const d of [0, 1e-9, -1e-9]) {
      const a = face("a", rect(), { x: 0, y: 0, c: 0 }),
        b = face("b", rect(), { x: 0, y: 0, c: d });
      const first = resolveOcclusion([], [a, b]);
      expect(first.decisions[0].relation).toBe("coplanar");
      expect(first.shapes.at(-1)!.component).toBe("b");
      expect(resolveOcclusion([], [b, a]).shapes).toEqual(first.shapes);
    }
  });
  it("handles multiple mutually crossing planes with an independent sampled oracle", () => {
    oracle([
      face("a", rect(-4, -4, 8, 8), { x: 1, y: 0, c: 0 }),
      face("b", rect(-3, -3, 8, 8), { x: 0, y: 1, c: 0 }),
      face("c", rect(-2, -2, 7, 7), { x: -1, y: -1, c: 0 }),
    ]);
  });
  it("resolves a true three-surface ordering cycle with visible-region clipping", () => {
    const rod = (a: Point, b: Point) => {
      const length = Math.hypot(b.x - a.x, b.y - a.y),
        nx = (-(b.y - a.y) * 0.1) / length,
        ny = ((b.x - a.x) * 0.1) / length;
      return [
        { x: a.x - nx, y: a.y - ny },
        { x: b.x - nx, y: b.y - ny },
        { x: b.x + nx, y: b.y + ny },
        { x: a.x + nx, y: a.y + ny },
      ];
    };
    const result = oracle([
      face("a", rod({ x: -3, y: 1 }, { x: 3, y: 1 }), { x: 1, y: 0, c: 0 }),
      face("b", rod({ x: 2, y: 1.5 }, { x: -0.3, y: -2.5 }), {
        x: 0,
        y: 1,
        c: 0,
      }),
      face("c", rod({ x: -2, y: 1.5 }, { x: 0.3, y: -2.5 }), {
        x: 0,
        y: 2 / 3,
        c: -5 / 3,
      }),
    ]);
    expect(result.decisions.every((d) => d.relation === "ordered")).toBe(true);
    expect(result.method).toBe("visible-region-clipping");
  });
  it("reports budget exhaustion instead of claiming exact resolution", () => {
    const a = face("a", rect(), { x: 1, y: 0, c: 0 }),
      b = face("b", rect(1, 1, 2, 2), { x: -1, y: 0, c: 4 });
    const result = resolveOcclusion([], [a, b], 1);
    expect(result.diagnostics).toContain("fragment budget exceeded: a");
    expect(a.status).toBe("unresolved");
  });
  it("clips translucent surfaces by opaque coverage without letting them hide opaque surfaces", () => {
    const a = face("a", rect(), { x: 1, y: 0, c: 0 }),
      b = face("b", rect(), { x: 0, y: 0, c: 2 });
    b.alpha = 0.5;
    const result = resolveOcclusion([], [a, b]);
    expect(
      result.shapes
        .filter((s) => s.component === "a")
        .reduce((n, s) => n + area(s.points), 0),
    ).toBeCloseTo(16);
    expect(
      result.shapes
        .filter((s) => s.component === "b")
        .reduce((n, s) => n + area(s.points), 0),
    ).toBeCloseTo(8);
  });
});
it("keeps surface identity, valid geometry and resolved torso/shoulders across rotations and gait phases", () => {
  let ids: string[] | undefined;
  for (const time of [0.35, 1.5])
    for (const heading of [
      0, 45, 60, 61, 62, 63, 64, 65, 66, 86, 87, 88, 89, 90, 91, 92, 93, 94,
      180, 268, 269, 270, 271, 272, 273, 274, 359,
    ]) {
      const s = new Simulation({ ...defaultConfig, heading, animation: "run" });
      s.seek(time);
      const g = buildRig(s.world, s.config, true);
      expect(g.occlusion.diagnostics).toEqual([]);
      expect(g.surfaces.map((s) => s.id)).toEqual(
        (ids ??= g.surfaces.map((s) => s.id)),
      );
      expect(g.surfaces.every((s) => s.status !== "unresolved")).toBe(true);
      expect(
        g.shapes.every(
          (s) =>
            s.points.length >= 3 &&
            s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
        ),
      ).toBe(true);
      const again = buildRig(s.world, s.config, true);
      expect(again.shapes).toEqual(g.shapes);
    }
});
