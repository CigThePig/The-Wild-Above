import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { Simulation } from "../../src/animation/simulation";
import { configSchema, defaultConfig } from "../../src/animation/config";
import { buildRig } from "../../src/animation/rig";
import {
  STANDARD,
  configForMech,
  getMech,
  listMechs,
  registerMech,
} from "../../src/mechs";
import { checkMech } from "../../src/mechs/check";
import { mechJsonSchema } from "../../src/mechs/json-schema";
import { parseMechSpec, type MechSpec } from "../../src/mechs/schema";

const variant = (change: (spec: MechSpec) => void): MechSpec => {
  const spec = structuredClone(STANDARD);
  spec.id = "variant";
  spec.status = "draft";
  change(spec);
  return parseMechSpec(spec);
};
const checks = (spec: MechSpec) =>
  checkMech(spec, { quick: true }).findings.map((f) => `${f.level}:${f.check}`);

describe("mech specs", () => {
  it("keeps the generated JSON Schema in sync with the Zod schema", () => {
    const committed: unknown = JSON.parse(
      readFileSync(
        new URL("../../schemas/mech-spec.schema.json", import.meta.url),
        "utf8",
      ),
    );
    // Run npm run mech:schema after changing src/mechs/schema.ts.
    expect(committed).toEqual(mechJsonSchema());
  });
  it("passes every registered spec through the design checks", () => {
    for (const spec of listMechs()) {
      const report = checkMech(spec, { quick: true });
      expect(
        report.findings.filter((f) => f.level === "error"),
        spec.id,
      ).toEqual([]);
      if (spec.status === "approved")
        expect(report.findings, spec.id).toEqual([]);
    }
  });
  it("rejects malformed specs with readable paths", () => {
    const bad = structuredClone(STANDARD) as unknown as Record<string, unknown>;
    bad.paint = "crimson";
    expect(() => parseMechSpec(bad)).toThrow(/paint/);
    expect(() => parseMechSpec({ ...STANDARD, extra: 1 })).toThrow();
    const part = {
      id: "fin",
      attach: "turret",
      kind: "block",
      position: { x: 0, y: 10, z: 14 },
      size: { w: 2, d: 8, h: 6 },
      color: "slate",
    };
    expect(() => parseMechSpec({ ...STANDARD, parts: [part, part] })).toThrow(
      /duplicate part id/,
    );
  });
  it("selects registered Mechs through config and rejects unknown IDs", () => {
    expect(
      configSchema.safeParse({ ...defaultConfig, mech: "nope" }).success,
    ).toBe(false);
    expect(() => getMech("nope")).toThrow(/Unknown mech/);
    const config = configForMech(defaultConfig, "standard");
    expect(config).toMatchObject({ mech: "standard", color: "#a5a082" });
    expect(new Simulation(config).world.mech.spec).toBe(STANDARD);
    expect(() => registerMech(STANDARD)).toThrow(/already registered/);
  });
  it("mirrors extra parts with stable IDs and joint parents", () => {
    const spec = variant((s) => {
      s.parts = [
        {
          id: "fin",
          attach: "turret",
          mirror: true,
          kind: "block",
          position: { x: 10, y: 10, z: 14 },
          size: { w: 2, d: 8, h: 6 },
          color: "slate",
          surfaces: false,
        },
        {
          id: "antenna",
          attach: "turret",
          mirror: false,
          kind: "limb",
          from: { x: -8, y: 10, z: 13 },
          to: { x: -8, y: 14, z: 30 },
          width: [1.5, 1],
          color: "bone",
        },
        {
          id: "shin-guard",
          attach: "knee",
          mirror: false,
          kind: "block",
          position: { x: 0, y: -6, z: -8 },
          size: { w: 8, d: 3, h: 12 },
          color: "paint",
          surfaces: true,
        },
      ];
    });
    // Heading 0 at rest: the turret frame is axis-aligned with the world.
    const s = new Simulation(
      { ...defaultConfig, heading: 0, animation: "idle" },
      undefined,
      spec,
    );
    const rig = buildRig(s.world, s.config, true);
    const parents = Object.fromEntries(
      rig.components
        .filter((c) => c.id.startsWith("mech.part."))
        .map((c) => [c.id, c.parent]),
    );
    expect(parents).toEqual({
      "mech.part.fin.left": "mech.torso",
      "mech.part.fin.right": "mech.torso",
      "mech.part.antenna": "mech.torso",
      "mech.part.shin-guard.left": "mech.leg.left.knee",
      "mech.part.shin-guard.right": "mech.leg.right.knee",
    });
    const fin = (id: string) => rig.components.find((c) => c.id === id)!.local;
    expect(fin("mech.part.fin.left").x).toBeCloseTo(
      -fin("mech.part.fin.right").x,
      6,
    );
    expect(
      rig.surfaces.some((f) => f.component === "mech.part.shin-guard.left"),
    ).toBe(true);
    expect(checks(spec).filter((c) => c.startsWith("error"))).toEqual([]);
  });
  it("flags floating parts, misplaced cockpits, buried parts and short legs", () => {
    expect(
      checks(
        variant((s) => {
          s.parts = [
            {
              id: "orbit",
              attach: "turret",
              mirror: false,
              kind: "block",
              position: { x: 0, y: 0, z: 40 },
              size: { w: 4, d: 4, h: 4 },
              color: "bone",
              surfaces: false,
            },
          ];
        }),
      ),
    ).toContain("error:connectivity");
    expect(
      checks(
        variant((s) => {
          s.cockpit.position.z += 20;
        }),
      ),
    ).toContain("error:boarding");
    expect(
      checks(
        variant((s) => {
          s.parts = [
            {
              id: "spike",
              attach: "foot",
              mirror: false,
              kind: "block",
              position: { x: 0, y: 0, z: -6 },
              size: { w: 3, d: 3, h: 6 },
              color: "slate",
              surfaces: false,
            },
          ];
        }),
      ),
    ).toContain("error:ground");
    expect(
      checks(
        variant((s) => {
          s.legs.hipHeight = 60;
          s.turret.height = 81;
        }),
      ),
    ).toContain("warning:legs.reach");
  }, 30000);
});
