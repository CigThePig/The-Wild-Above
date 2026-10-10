import { expect, it } from "vitest";
import { Simulation } from "../../src/animation/simulation";
import { defaultConfig } from "../../src/animation/config";
import { buildRig } from "../../src/animation/rig";
import type { Input } from "../../src/animation/types";
it("exits at the west-facing northwest corner", () => {
  const s = new Simulation({ ...defaultConfig, animation: "idle" });
  const g = s.world.mech;
  g.x = -435;
  g.y = -330;
  g.yaw = g.turret = -Math.PI / 2;
  g.feet.forEach((f) => {
    f.p.x -= 435;
    f.p.y -= 330;
  });
  expect(s.interact()).toBe(true);
  const ground = s.world.transition!.ground;
  expect(Math.abs(ground.x)).toBeLessThanOrEqual(435);
  expect(Math.abs(ground.y)).toBeLessThanOrEqual(330);
  s.step(1800, {});
  expect(s.world.transition).toBeNull();
  expect(s.world.control).toBe("foot");
  expect(Math.abs(s.world.pilot.x)).toBeLessThanOrEqual(435);
  expect(Math.abs(s.world.pilot.y)).toBeLessThanOrEqual(330);
});
it("boards from west of a north-facing mech near the northwest edge", () => {
  const s = new Simulation({ ...defaultConfig, animation: "idle" });
  const g = s.world.mech;
  g.x = -400;
  g.y = -300;
  g.yaw = g.turret = 0;
  g.feet.forEach((f) => {
    f.p.x -= 400;
    f.p.y -= 300;
  });
  s.world.control = "foot";
  s.world.pilot.place(-434, -300, 0);
  expect(s.interact()).toBe(true);
  s.step(1800, {});
  expect(s.world.transition).toBeNull();
  expect(s.world.control).toBe("mech");
});
it("configuration edits work after 61 seconds", () => {
  const s = new Simulation();
  s.step(3600);
  s.step(60);
  expect(() => s.configure({ speed: 0.75 })).not.toThrow();
  expect(s.world.mech.tuning.speed).toBe(0.75);
});
it("invalid aiming is rejected before changing simulation", () => {
  const s = new Simulation(),
    before = s.snapshot();
  expect(() => s.step(1, { aim: true } as unknown as Input)).toThrow();
  expect(s.snapshot()).toEqual(before);
});
it("pilot fade opacity is exposed in the component contract", () => {
  const s = new Simulation({
    ...defaultConfig,
    actor: "pilot",
    animation: "idle",
  });
  s.world.pilot.visible = 0.25;
  const rig = buildRig(s.world, s.config, true);
  expect(
    rig.components
      .filter((c) => c.id.startsWith("pilot"))
      .every((c) => "opacity" in c && c.opacity === 0.25),
  ).toBe(true);
});

it("configuration edits beyond the horizon leave a coherent, reproducible state", () => {
  const s = new Simulation();
  s.step(3600);
  s.step(60);
  s.configure({ actor: "pilot", heading: 359, speed: 0.75 });
  expect(s.tick).toBe(3600);
  const fresh = new Simulation(s.config);
  fresh.seek(60);
  expect(s.snapshot()).toEqual(fresh.snapshot());
  const before = s.snapshot();
  expect(() => s.configure({ speed: -1 })).toThrow();
  expect(s.snapshot()).toEqual(before);
});

it("hidden and partially faded pilot components agree with shape opacity", () => {
  for (const opacity of [0, 0.001, 0.25, 0.75, 1]) {
    const s = new Simulation({
      ...defaultConfig,
      actor: "pilot",
      animation: "idle",
    });
    s.world.pilot.visible = opacity;
    const rig = buildRig(s.world, s.config, true);
    expect(
      rig.components.every(
        (c) => c.opacity === opacity && c.visible === opacity > 0,
      ),
    ).toBe(true);
    expect(rig.shapes.every((s) => s.alpha === opacity)).toBe(true);
  }
});

it("exits and reboards all four field corners with cardinal headings", () => {
  for (const [x, y] of [
    [-435, -330],
    [-435, 330],
    [435, -330],
    [435, 330],
  ])
    for (const heading of [0, 90, 180, 270]) {
      const s = new Simulation({
          ...defaultConfig,
          heading,
          animation: "idle",
        }),
        g = s.world.mech;
      g.x = x;
      g.y = y;
      g.feet.forEach((f) => {
        f.p.x += x;
        f.p.y += y;
      });
      expect(s.interact()).toBe(true);
      s.step(1200, {});
      expect(s.world.transition, `${x},${y},${heading} exit`).toBeNull();
      expect(s.world.control).toBe("foot");
      expect(Math.abs(s.world.pilot.x)).toBeLessThanOrEqual(435);
      expect(Math.abs(s.world.pilot.y)).toBeLessThanOrEqual(330);
      expect(s.interact()).toBe(true);
      s.step(1200, {});
      expect(s.world.transition, `${x},${y},${heading} board`).toBeNull();
      expect(s.world.control).toBe("mech");
    }
});

it("pilot collision response stays inside the field wall", () => {
  const s = new Simulation({
    ...defaultConfig,
    actor: "pilot",
    animation: "idle",
  });
  s.world.mech.x = -400;
  s.world.mech.y = -300;
  s.world.pilot.place(-435, -300, 0);
  for (let i = 0; i < 300; i++) {
    s.step(1, { x: 1 });
    expect(s.world.pilot.x).toBeGreaterThanOrEqual(-435);
    expect(s.world.pilot.y).toBeGreaterThanOrEqual(-330);
    expect(
      Math.hypot(s.world.pilot.x + 400, s.world.pilot.y + 300),
    ).toBeGreaterThanOrEqual(34 - 1e-7);
  }
});

it("boards from reachable positions around the near-edge footprint", () => {
  for (const [x, y] of [
    [-400, -300],
    [-400, 300],
    [400, -300],
    [400, 300],
  ])
    for (const heading of [0, 180])
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8,
          px = x + Math.cos(a) * 34,
          py = y + Math.sin(a) * 34;
        if (Math.abs(px) > 435 || Math.abs(py) > 330) continue;
        const s = new Simulation(
          { ...defaultConfig, heading, actor: "pilot", animation: "idle" },
          { mech: { x, y }, pilot: { x: px, y: py } },
        );
        expect(s.interact(), `start ${x},${y},${heading},${i}`).toBe(true);
        s.step(1800, {});
        expect(
          s.world.transition,
          `finish ${x},${y},${heading},${i}`,
        ).toBeNull();
        expect(s.world.control).toBe("mech");
      }
}, 30000);

it("replays a different input on each of more than 3,600 consecutive frames", () => {
  const live = new Simulation({ ...defaultConfig, animation: "idle" });
  for (let frame = 0; frame < 3601; frame++)
    live.step(1, { x: frame % 2 ? 1 : -1 });
  const captured = live.recording();
  expect(captured.commands).toHaveLength(3601);
  const restored = new Simulation();
  restored.replay(captured);
  expect(restored.snapshot()).toEqual(live.snapshot());
});

it("never exports an over-budget session as an invalid recording", () => {
  const sim = new Simulation({ ...defaultConfig, animation: "idle" });
  for (let i = 0; i < 10; i++) sim.step(3600, {});
  expect(() => sim.recording()).not.toThrow();
  sim.step(1, {});
  expect(() => sim.recording()).toThrow(/36,000-frame replay limit/);
  // The live world is still allowed to continue advancing.
  expect(sim.tick).toBe(36001);
  expect(sim.commands.length).toBeLessThanOrEqual(36001);
});

it("does not record zero-frame no-ops", () => {
  const sim = new Simulation();
  for (let i = 0; i < 100; i++) sim.step(0, { x: i % 2 ? 1 : -1 });
  expect(sim.recording().commands).toEqual([]);
  expect(sim.tick).toBe(0);
});

it("render-only edits keep a manual session; motion edits replay its own inputs", () => {
  const session = () => {
    const s = new Simulation({ ...defaultConfig, animation: "idle" });
    s.step(30, { x: 1 });
    s.interact();
    s.step(600, {});
    return s;
  };
  const s = session(),
    before = s.snapshot();
  expect(s.world.control).toBe("foot");
  s.configure({ color: "#34413b", kneeLimit: 120 });
  expect(s.snapshot().world).toEqual(before.world);
  expect(s.tick).toBe(630);
  // Same commands under the new tuning, not the config-derived autopilot.
  s.configure({ speed: 0.75 });
  const expected = new Simulation({
    ...defaultConfig,
    animation: "idle",
    speed: 0.75,
  });
  expected.step(30, { x: 1 });
  expected.interact();
  expected.step(600, {});
  expect(s.tick).toBe(630);
  expect(s.world.control).toBe("foot");
  expect(s.snapshot().world).toEqual(expected.snapshot().world);
  expect(s.recording().commands).toEqual(expected.recording().commands);
});

it("a blocked boarding approach recovers instead of owning input forever", () => {
  const s = new Simulation(
    { ...defaultConfig, actor: "pilot", heading: 0, animation: "idle" },
    { mech: { x: 0, y: 0 }, pilot: { x: 60, y: 20 } },
  );
  s.world.pilot.tuning.speed = 0; // The pilot cannot walk the route.
  expect(s.interact()).toBe(true);
  s.step(1800, {});
  expect(s.world.transition?.stage).toBe("approach");
  // Approach snaps at 30 s; the walk to the ladder (step) snaps 30 s later.
  s.step(3600, {});
  expect(s.world.transition).toBeNull();
  expect(s.world.control).toBe("mech");
  expect(s.world.interactionFailure).toMatch(/"step".*snapped/);
});

it("production sessions can skip the unused command log", () => {
  const s = new Simulation();
  s.recordCommands = false;
  s.step(120, { x: 1 });
  expect(s.commands).toEqual([]);
  expect(() => s.recording()).toThrow(/disabled/);
});
