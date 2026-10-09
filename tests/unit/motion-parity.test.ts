import { it, expect } from "vitest";
import parity from "../fixtures/motion-parity.json";
import { Simulation } from "../../src/animation/simulation";
import { defaultConfig } from "../../src/animation/config";
it("preserves prototype walk/run poses after the strict TypeScript port", () => {
  for (const example of parity) {
    const s = new Simulation({
      ...defaultConfig,
      actor: example.actor === "mech" ? "mech" : "pilot",
      heading: example.heading,
      animation: example.fast ? "run" : "walk",
    });
    s.step(example.tick);
    const a = s.world.actor,
      p = a.pose();
    const actual = {
      x: a.x,
      y: a.y,
      yaw: a.yaw,
      speed: a.speed,
      base: p.base,
      legs: p.legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.f.p })),
    };
    expect(actual).toEqual(example.state);
  }
});
