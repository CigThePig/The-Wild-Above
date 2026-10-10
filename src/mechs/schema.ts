import { z } from "zod";
import { PALETTE_TOKENS } from "./palette";

// Data contract for Mech designs. Specs are JSON files in src/mechs/specs/
// that coding agents author and humans approve. Frames, units and limits are
// documented in docs/mechs/authoring.md; schemas/mech-spec.schema.json is
// generated from this file (npm run mech:schema).

const finite = z.number().finite();
const range = (min: number, max: number, description: string) =>
  z.number().finite().min(min).max(max).describe(description);
const vec3 = z
  .object({ x: finite, y: finite, z: finite })
  .strict()
  .describe(
    "Offset in the attachment frame, in Mech units: x right (outward for mirrored or per-side parts), y back (+) / front (−), z up.",
  );
const size3 = z
  .object({
    w: range(0.5, 120, "Width along x."),
    d: range(0.5, 120, "Depth along y."),
    h: range(0.5, 120, "Height along z."),
  })
  .strict()
  .describe("Bounding box the bevelled octagonal block footprint is cut from.");
const color = z
  .enum([...PALETTE_TOKENS, "paint"])
  .describe(
    "Palette token (src/mechs/palette.ts), or 'paint' for the live paint colour selected in Rig Lab.",
  );
const cap = color
  .optional()
  .describe(
    "Top face colour. Omitted: semantic blocks use the side colour; legacy blocks draw no separate cap.",
  );
const widths = z
  .tuple([
    range(0.5, 40, "Width at the start joint."),
    range(0.5, 40, "Width at the end joint."),
  ])
  .describe("Limb widths at its start and end.");
const block = z.object({ position: vec3, size: size3, color, cap }).strict();

const frame = z
  .enum(["body", "turret", "shoulder", "elbow", "wrist", "hip", "knee", "foot"])
  .describe(
    "body: hip centre, follows body yaw. turret: upper-body origin, follows turret yaw. shoulder/elbow/wrist: arm joints, turret yaw. hip/knee: leg joints, body yaw. foot: ankle joint, foot yaw. Joint frames always produce a left and a right copy.",
  );
const partBase = {
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,23}$/)
    .describe("Stable part ID; the component is mech.part.<id>[.left|.right]."),
  attach: frame,
  mirror: z
    .boolean()
    .default(false)
    .describe(
      "body/turret parts only: also place a copy reflected across the centre line.",
    ),
};
const part = z.discriminatedUnion("kind", [
  z
    .object({
      ...partBase,
      kind: z.literal("block"),
      position: vec3,
      size: size3,
      color,
      cap,
      surfaces: z
        .boolean()
        .default(true)
        .describe(
          "Resolve with exact semantic faces (better occlusion, more CPU). false uses one representative-depth silhouette.",
        ),
    })
    .strict(),
  z
    .object({
      ...partBase,
      kind: z.literal("limb"),
      from: vec3,
      to: vec3,
      width: widths,
      color,
    })
    .strict(),
]);

export const mechSpecSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    id: z
      .string()
      .regex(/^[a-z][a-z0-9-]{1,31}$/)
      .describe("Stable ID used by config.mech. Never rename after approval."),
    name: z.string().min(1).max(60),
    status: z
      .enum(["draft", "approved"])
      .describe(
        "draft: tooling and Rig Lab only. A human approves the silhouette before gameplay use.",
      ),
    description: z.string().max(600).optional(),
    paint: z
      .enum(PALETTE_TOKENS)
      .describe("Paint colour applied when this Mech is selected."),
    legs: z
      .object({
        hipWidth: range(2, 40, "Hip joint distance from the centre line."),
        hipHeight: range(10, 120, "Hip height above ground when standing."),
        thigh: range(5, 80, "Hip-to-knee bone length."),
        shin: range(5, 80, "Knee-to-ankle bone length."),
        ankleHeight: range(
          0,
          20,
          "Ankle joint height above ground for a planted foot.",
        ),
        stance: z
          .object({
            width: range(2, 60, "Planted foot distance from the centre line."),
            forward: range(
              -20,
              20,
              "Planted foot offset along y (negative is forward).",
            ),
          })
          .strict(),
        stepLift: range(0, 40, "Peak foot lift of a step at stepHeight 1."),
        thighWidth: widths,
        thighColor: color,
        shinWidth: widths,
        shinColor: color,
        boot: z
          .object({
            lift: range(-10, 20, "Boot centre height above the ankle joint."),
            size: size3,
            color,
            cap,
          })
          .strict(),
        kneecap: z.object({ size: size3, color, cap }).strict().nullable(),
      })
      .strict(),
    gait: z
      .object({
        walkSpeed: range(10, 200, "Walking speed in units per second."),
        runSpeed: range(10, 300, "Running speed in units per second."),
        turnRate: range(0.2, 8, "Body turn rate in radians per second."),
        stepDuration: range(0.05, 1, "Walking swing duration in seconds."),
        runStepDuration: range(0.05, 1, "Running swing duration in seconds."),
        runStepAbove: range(
          0,
          300,
          "Speed above which runStepDuration applies.",
        ),
        bob: range(0, 10, "Body rise during a swing at bob 1."),
        landDip: range(0, 10, "Body dip when a foot lands."),
      })
      .strict(),
    pelvis: block.describe("Body frame block at the hips."),
    turret: z
      .object({
        height: range(
          10,
          200,
          "Upper-body frame origin height when the hips are at hipHeight.",
        ),
      })
      .strict(),
    torso: z
      .object({ size: size3, color, cap })
      .strict()
      .describe("Turret frame block centred on the upper-body origin."),
    pack: block.nullable().describe("Turret frame block, usually behind."),
    cockpit: block.describe(
      "Turret frame housing. Boarding choreography is fixed: keep it near the standard cockpit (mech:check enforces this).",
    ),
    canopy: z
      .object({
        halfWidth: range(0.5, 40, "Half width when facing the viewer."),
        front: z
          .number()
          .finite()
          .describe("Canopy plane y in the turret frame."),
        top: z.number().finite().describe("Top edge z."),
        bottom: z.number().finite().describe("Bottom edge z when closed."),
        open: z
          .object({ y: finite, z: finite })
          .strict()
          .describe("Bottom edge travel when the hatch is fully open."),
        color,
      })
      .strict(),
    arms: z
      .object({
        shoulder: vec3,
        elbow: vec3,
        wrist: vec3,
        upper: z.object({ width: widths, color }).strict(),
        lower: z.object({ width: widths, color }).strict(),
        armor: z
          .object({
            offset: vec3.describe("From the shoulder joint, x outward."),
            size: size3,
            color,
            cap,
          })
          .strict()
          .nullable(),
      })
      .strict()
      .describe("Right arm in the turret frame; the left arm mirrors it."),
    tools: z
      .object({
        barrel: block
          .nullable()
          .describe("Turret frame tool; recoils along y."),
        hook: z
          .object({
            points: z
              .array(z.tuple([finite, finite]))
              .min(3)
              .max(16)
              .describe("Flat outline as [x, y] pairs in the turret frame."),
            z: finite,
            anchor: z.object({ x: finite, y: finite }).strict(),
            color,
          })
          .strict()
          .nullable(),
      })
      .strict(),
    parts: z
      .array(part)
      .max(24)
      .default([])
      .describe("Additional blocks and limbs attached to named frames."),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const seen = new Set<string>();
    spec.parts.forEach((p, i) => {
      if (seen.has(p.id))
        ctx.addIssue({
          code: "custom",
          path: ["parts", i, "id"],
          message: `duplicate part id "${p.id}"`,
        });
      seen.add(p.id);
    });
    if (spec.gait.runSpeed < spec.gait.walkSpeed)
      ctx.addIssue({
        code: "custom",
        path: ["gait", "runSpeed"],
        message: "runSpeed must be at least walkSpeed",
      });
  });
export type MechSpec = z.infer<typeof mechSpecSchema>;
export type MechPart = MechSpec["parts"][number];
export type ColorRef = z.infer<typeof color>;

/** Parse untrusted spec data with readable, path-qualified errors. */
export function parseMechSpec(value: unknown): MechSpec {
  const result = mechSpecSchema.safeParse(value);
  if (!result.success) throw Error(z.prettifyError(result.error));
  return result.data;
}
