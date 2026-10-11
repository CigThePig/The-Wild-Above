import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { it, expect } from "vitest";
import { Simulation, type Placement } from "../../src/animation/simulation";
import { defaultConfig, type RigConfig } from "../../src/animation/config";
import { buildRig } from "../../src/animation/rig";
import type { Input } from "../../src/animation/types";

// Exact geometry guard for refactors that must not change what is drawn
// (occlusion optimisation, data-driven specs). Regenerate only after the
// rendered change has been inspected: UPDATE_RIG_FIXTURE=1 npx vitest run rig-geometry
const fixturePath = new URL("../fixtures/rig-geometry.json", import.meta.url);
type Pose = {
  name: string;
  config: Partial<RigConfig>;
  isolated: boolean;
  placement?: Placement;
  run: (s: Simulation) => void;
};
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
function poses(): Pose[] {
  const out: Pose[] = [];
  for (const animation of ["run", "walk", "idle"] as const)
    for (const heading of [0, 45, 63, 89, 90, 135, 180, 225, 270, 315, 359])
      for (const time of animation === "idle" ? [0] : [0.35, 1.5])
        out.push({
          name: `mech ${animation} ${heading}° ${time}s`,
          config: { heading, animation },
          isolated: true,
          run: (s) => s.seek(time),
        });
  for (const heading of [0, 90, 150, 270])
    for (const time of [0.35, 1.5])
      out.push({
        name: `pilot run ${heading}° ${time}s`,
        config: { actor: "pilot", heading },
        isolated: true,
        run: (s) => s.seek(time),
      });
  const aim: Input = { x: 0.8, y: -0.2, aim: true, aimYaw: 2, fire: true };
  out.push({
    name: "mech aiming",
    config: { heading: 89 },
    isolated: true,
    run: (s) => s.step(60, aim),
  });
  // Exit then reboard, sampled through every boarding stage in the gameplay view.
  for (let frames = 0; frames <= 1500; frames += 10)
    out.push({
      name: `boarding +${frames}`,
      config: { animation: "idle", heading: 150 },
      isolated: false,
      run: (s) => {
        s.interact();
        const exitFrames = Math.min(frames, 700);
        s.step(exitFrames, {});
        if (frames > 700) {
          s.interact();
          s.step(frames - 700, {});
        }
      },
    });
  // Walk around the parked footprint near the field edge before climbing.
  for (let frames = 0; frames <= 300; frames += 10)
    out.push({
      name: `edge approach +${frames}`,
      config: { actor: "pilot", heading: 0, animation: "idle" },
      placement: { mech: { x: -400, y: -300 }, pilot: { x: -434, y: -300 } },
      isolated: false,
      run: (s) => {
        s.interact();
        s.step(frames, {});
      },
    });
  return out;
}
function measure() {
  return poses().map((pose) => {
    const s = new Simulation(
      { ...defaultConfig, ...pose.config },
      pose.placement,
    );
    pose.run(s);
    const rig = buildRig(s.world, s.config, pose.isolated);
    return {
      name: pose.name,
      stage: s.world.transition?.stage ?? null,
      shapes: rig.shapes.length,
      geometry: hash(
        rig.shapes.map((p) => [
          p.id,
          p.component,
          p.points,
          p.depth,
          p.color,
          p.alpha,
        ]),
      ),
      components: hash(rig.components),
      surfaces: hash(
        rig.surfaces.map((f) => [f.id, f.status, f.culled, f.fragments]),
      ),
      decisions: hash(rig.occlusion.decisions),
    };
  });
}
it("reproduces the reviewed rig geometry exactly", () => {
  const actual = measure();
  if (process.env.UPDATE_RIG_FIXTURE) {
    writeFileSync(fixturePath, JSON.stringify(actual, null, 2) + "\n");
    return;
  }
  const expected = JSON.parse(
    readFileSync(fixturePath, "utf8"),
  ) as typeof actual;
  expect(actual.map((p) => p.name)).toEqual(expected.map((p) => p.name));
  for (let i = 0; i < expected.length; i++)
    expect(actual[i], expected[i].name).toEqual(expected[i]);
}, 60000);
