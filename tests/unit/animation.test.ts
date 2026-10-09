import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Simulation } from "../../src/animation/simulation";
import { defaultConfig, configSchema } from "../../src/animation/config";
import { buildRig } from "../../src/animation/rig";
import { solveLeg } from "../../src/animation/legacy/motion.js";

describe("configuration", () => {
  it("rejects invalid and unknown values", () => {
    for (const patch of [
      { heading: NaN },
      { speed: -1 },
      { stride: 10 },
      { version: 2 },
      { unexpected: true },
    ])
      expect(
        configSchema.safeParse({ ...defaultConfig, ...patch }).success,
      ).toBe(false);
  });
});
describe("motion", () => {
  it("replays stateful planted feet deterministically", () => {
    const a = new Simulation();
    a.step(120);
    const b = new Simulation();
    b.seek(2);
    expect(a.snapshot()).toEqual(b.snapshot());
    a.seek(0.35);
    b.seek(0.35);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
  it("enforces bounded deterministic seeks", () => {
    const s = new Simulation();
    expect(() => s.seek(NaN)).toThrow();
    expect(() => s.step(0.5)).toThrow();
    expect(() => s.seek(61)).toThrow();
  });
  it("analytic IK keeps bone lengths for reachable targets", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10, max: 10, noNaN: true }),
        fc.double({ min: -10, max: 10, noNaN: true }),
        (x, y) => {
          const hip = { x: 0, y: 0, z: 38 },
            foot = { x, y, z: 3 },
            k = solveLeg(hip, foot, { x: 0, y: -1, z: 0 }).knee;
          expect(Math.hypot(k.x, k.y, k.z - 38)).toBeCloseTo(23, 5);
          expect(Math.hypot(k.x - x, k.y - y, k.z - 3)).toBeCloseTo(24, 5);
        },
      ),
      { seed: 197, numRuns: 100 },
    );
  });
  it("produces finite structured rigs across headings and times", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 359 }),
        fc.integer({ min: 0, max: 120 }),
        (heading, frames) => {
          for (const actor of ["pilot", "mech"] as const) {
            const s = new Simulation({ ...defaultConfig, heading, actor });
            s.step(frames);
            const rig = buildRig(s.world, s.config, true);
            expect(rig.components.flatMap((c) => c.issues)).toEqual([]);
            expect(new Set(rig.components.map((c) => c.id)).size).toBe(
              rig.components.length,
            );
            expect(rig.shapes.every((p) => Number.isFinite(p.depth))).toBe(
              true,
            );
          }
        },
      ),
      { seed: 197, numRuns: 60 },
    );
  });
  it("keeps planted mech feet stationary during stance", () => {
    const s = new Simulation();
    for (let i = 0; i < 120; i++) {
      const feet = structuredClone(s.world.mech.feet);
      s.step();
      s.world.mech.feet.forEach((f, j) => {
        if (!f.swing && !feet[j].swing) expect(f.p).toEqual(feet[j].p);
      });
    }
  });
  it("exits, boards, and returns control without getting stuck", () => {
    const s = new Simulation({ ...defaultConfig, animation: "idle" });
    expect(s.world.interact()).toBe(true);
    s.step(900, {});
    expect(s.world.transition).toBeNull();
    expect(s.world.control).toBe("foot");
    expect(s.world.nearby).toBe(true);
    expect(s.world.interact()).toBe(true);
    s.step(1200, {});
    expect(s.world.transition).toBeNull();
    expect(s.world.control).toBe("mech");
  });
  it("bounds neighboring-angle joint displacement", () => {
    let previous: ReturnType<typeof buildRig> | undefined;
    for (let heading = 60; heading <= 66; heading++) {
      const s = new Simulation({ ...defaultConfig, heading });
      s.seek(0.35);
      const rig = buildRig(s.world, s.config, true);
      if (previous)
        for (const c of rig.components.filter((c) => c.kind === "joint")) {
          const p = previous.components.find((p) => p.id === c.id)!;
          expect(
            Math.hypot(
              c.world.x - p.world.x,
              c.world.y - p.world.y,
              c.world.z - p.world.z,
            ),
          ).toBeLessThan(3);
        }
      previous = rig;
    }
  });
});

it("replays recorded movement and boarding inputs exactly", () => {
  const a = new Simulation({ ...defaultConfig, animation: "idle" });
  a.step(20, { x: 1 });
  a.interact();
  a.step(180, {});
  const saved = a.snapshot(),
    recording = a.recording(),
    b = new Simulation();
  b.replay(recording);
  expect(b.snapshot()).toEqual(saved);
  expect(() =>
    b.replay({
      config: defaultConfig,
      commands: [{ kind: "step", frames: 1, input: { x: NaN } }],
    }),
  ).toThrow();
});
