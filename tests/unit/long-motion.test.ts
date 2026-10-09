import { it, expect } from "vitest";
import { Simulation } from "../../src/animation/simulation";
import { defaultConfig } from "../../src/animation/config";
import { buildRig } from "../../src/animation/rig";
import type { Input } from "../../src/animation/types";
it("120 seconds of changing movement remains finite, grounded and exactly replayable", () => {
  for (const actor of ["mech", "pilot"] as const) {
    const s = new Simulation({ ...defaultConfig, actor });
    for (let group = 0; group < 600; group++) {
      const t = group * 0.2,
        input: Input = {
          x: Math.cos(t * 0.75),
          y: Math.sin(t * 0.75),
          fast: true,
        };
      for (let frame = 0; frame < 12; frame++) {
        const feet = structuredClone(s.world.mech.feet);
        s.step(1, input);
        s.world.mech.feet.forEach((f, i) => {
          if (!f.swing && !feet[i].swing) expect(f.p).toEqual(feet[i].p);
        });
      }
      const rig = buildRig(s.world, s.config, true);
      expect(rig.components.flatMap((c) => c.issues)).toEqual([]);
      expect(
        rig.shapes.every(
          (s) =>
            Number.isFinite(s.depth) &&
            s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
        ),
      ).toBe(true);
    }
    const b = new Simulation();
    b.replay(s.recording());
    expect(b.snapshot()).toEqual(s.snapshot());
    expect(s.tick).toBe(7200);
  }
}, 30000);
it("multiple stationary rotations maintain finite IK and continuous root/heading", () => {
  for (const actor of ["mech", "pilot"] as const) {
    const s = new Simulation({ ...defaultConfig, actor, animation: "idle" });
    let previous = s.world.actor.yaw;
    for (let i = 0; i < 1200; i++) {
      s.step(1, { turn: 1 });
      expect(Math.abs(s.world.actor.yaw - previous)).toBeLessThan(0.12);
      previous = s.world.actor.yaw;
      if (i % 10 === 0)
        expect(
          buildRig(s.world, s.config, true).components.flatMap((c) => c.issues),
        ).toEqual([]);
    }
  }
});
