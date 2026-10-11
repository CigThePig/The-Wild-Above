import { createHash } from "node:crypto";
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
import {
  parseMechSpec,
  type MechSpec,
  type MechSpecInput,
} from "../../src/mechs/schema";

const variant = (change: (spec: MechSpecInput) => void): MechSpec => {
  const spec: MechSpecInput = structuredClone(STANDARD);
  spec.id = "variant";
  spec.status = "draft";
  change(spec);
  return parseMechSpec(spec);
};
const checks = (spec: MechSpec) =>
  checkMech(spec, { quick: true }).findings.map((f) => `${f.level}:${f.check}`);

// Key-sorted JSON: formatting may change, any field or value change may not.
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
        )
      : value;
const turnInPlace = (spec: MechSpec) => {
  const s = new Simulation(
    { ...defaultConfig, heading: 0, animation: "idle" },
    undefined,
    spec,
  );
  const before = s.world.mech.yaw;
  s.step(60, { turn: 1 });
  return s.world.mech.yaw - before;
};

describe("mech specs", () => {
  it("pins the approved standard spec's content", () => {
    const raw: unknown = JSON.parse(
      readFileSync(
        new URL("../../src/mechs/specs/standard.json", import.meta.url),
        "utf8",
      ),
    );
    // Editing standard.json is a reviewed visual change: update this only
    // with rendered evidence and human approval (AGENTS.md).
    expect(
      createHash("sha256")
        .update(JSON.stringify(canonical(raw)))
        .digest("hex"),
    ).toBe("09dda9f4cd1b19afcd24a37c12ec550d3ef5b733ded768f474b3e8b830a63e8c");
  });
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
    // An inverted canopy could otherwise pass the opening rule unopened.
    expect(() =>
      parseMechSpec({
        ...STANDARD,
        canopy: {
          ...STANDARD.canopy,
          top: -10,
          bottom: 7,
          open: { y: 0, z: 0 },
        },
      }),
    ).toThrow(/canopy.bottom must be below canopy.top/);
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
  it("rebuilds the world when the selected design is re-registered", () => {
    const first = variant((s) => {
      s.id = "replaced-preview";
    });
    registerMech(first);
    const sim = new Simulation(configForMech(defaultConfig, first.id));
    const second = registerMech(
      variant((s) => {
        s.id = "replaced-preview";
        s.torso.size.w = 44;
      }),
      true,
    );
    // Same ID and paint: the config does not change, the design does.
    sim.configure(configForMech(sim.config, second.id));
    expect(sim.world.mech.spec).toBe(second);
    expect(sim.world.mech.spec.torso.size.w).toBe(44);
  });
  it("turns in place at the design's own rate, capped by turnRate", () => {
    expect(turnInPlace(STANDARD)).toBeCloseTo(1.6, 6);
    expect(
      turnInPlace(
        variant((s) => {
          s.gait.turnRate = 2.6;
          s.gait.turnInPlaceRate = 2.4;
        }),
      ),
    ).toBeCloseTo(2.4, 6);
    expect(
      turnInPlace(
        variant((s) => {
          s.gait.turnInPlaceRate = 3;
        }),
      ),
    ).toBeCloseTo(STANDARD.gait.turnRate, 6);
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
    // Parts touching only each other still float.
    const cluster = variant((s) => {
      s.parts = [
        {
          id: "upper",
          attach: "turret",
          kind: "block",
          position: { x: 0, y: 0, z: 60 },
          size: { w: 4, d: 4, h: 4 },
          color: "bone",
          surfaces: false,
        },
        {
          id: "lower",
          attach: "turret",
          kind: "block",
          position: { x: 0, y: 0, z: 63 },
          size: { w: 4, d: 4, h: 4 },
          color: "bone",
          surfaces: false,
        },
      ];
    });
    expect(
      checkMech(cluster, { quick: true })
        .findings.filter((f) => f.check === "connectivity")
        .map((f) => f.component),
    ).toEqual(["mech.part.upper", "mech.part.lower"]);
    expect(
      checks(
        variant((s) => {
          s.cockpit.position.z += 20;
        }),
      ),
    ).toContain("error:boarding");
    // Ladder, hatch and canopy are centred, so the cockpit must be too.
    expect(
      checks(
        variant((s) => {
          s.cockpit.position.x = 13;
        }),
      ),
    ).toContain("error:boarding");
    // Limb parts are checked on their centre line, not skipped.
    expect(
      checks(
        variant((s) => {
          s.parts = [
            {
              id: "anchor",
              attach: "foot",
              kind: "limb",
              from: { x: 0, y: 0, z: 0 },
              to: { x: 0, y: 0, z: -15 },
              width: [3, 3],
              color: "slate",
            },
          ];
        }),
      ),
    ).toContain("error:ground");
    // A canopy that never opens while the pilot climbs through it.
    expect(
      checks(
        variant((s) => {
          s.canopy.open = { y: 0, z: 0 };
        }),
      ),
    ).toContain("error:boarding");
    // Asymmetric legs with a high step fold past |thigh − shin|.
    expect(
      checks(
        variant((s) => {
          s.legs.thigh = 30;
          s.legs.shin = 16;
          s.legs.stepLift = 30;
        }),
      ),
    ).toContain("error:legs.overfold");
    // Short legs at high speed: foot targets beyond thigh + shin.
    expect(
      checks(
        variant((s) => {
          s.legs.thigh = 18;
          s.legs.shin = 19;
          s.legs.hipHeight = 30;
          s.turret.height = 59 - 8;
          s.gait.walkSpeed = 120;
          s.gait.runSpeed = 200;
        }),
      ),
    ).toContain("error:legs.overreach");
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
