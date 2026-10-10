import { Simulation } from "../animation/simulation";
import { defaultConfig, type RigConfig } from "../animation/config";
import { buildRig } from "../animation/rig";
import type { Input } from "../animation/types";
import type { Volume } from "../rendering/geometry";
import { paletteHex } from "./palette";
import type { MechSpec } from "./schema";

// Automated design review for Mech specs (npm run mech:check). Errors block
// approval; warnings need a human look. Thresholds are calibrated so the
// approved standard Mech passes with no findings.

export type Level = "error" | "warning";
export interface Finding {
  level: Level;
  check: string;
  message: string;
  component?: string;
}
export interface MechReport {
  id: string;
  name: string;
  status: MechSpec["status"];
  ok: boolean;
  findings: Finding[];
  metrics: {
    standingHipHeight: number;
    footprintRadius: number;
    maxKneeFlexion: number;
    /** Smallest leg slack while walking/running (thigh + shin − hip-to-ankle). */
    reachMargin: number;
    maxFragments: number;
    maxComparisons: number;
    medianBuildMs: number;
    p95BuildMs: number;
    sampledPoses: number;
  };
}

/** Boarding choreography (motion/world.ts) is authored for this cockpit. */
export const COCKPIT_INTERFACE = {
  centerZ: 60,
  front: -17.5,
  tolerance: 6,
  /** Ladder, hatch and canopy are centred: the cockpit must be too. */
  lateral: 3,
};
/** Standard ≈ 45 (hook tip bounding box). */
export const FOOTPRINT_LIMIT = 50;
/** Standard peaks ≈ 175 fragments / 19k pair checks; leave modest headroom. */
export const RENDER_BUDGET = { fragments: 260, comparisons: 30000 };
const CONTACT_TOLERANCE = 1;

const overlaps = (a: Volume, b: Volume, pad: number) =>
  (["x", "y", "z"] as const).every(
    (k) => a.min[k] - pad <= b.max[k] && b.min[k] - pad <= a.max[k],
  );

export function checkMech(
  spec: MechSpec,
  options: { quick?: boolean } = {},
): MechReport {
  const findings: Finding[] = [];
  const counted = new Map<string, { finding: Finding; count: number }>();
  const report = (
    level: Level,
    check: string,
    message: string,
    component?: string,
  ) => {
    const key = `${level}\0${check}\0${message}\0${component ?? ""}`;
    const seen = counted.get(key);
    if (seen) seen.count++;
    else {
      const finding: Finding = { level, check, message };
      if (component) finding.component = component;
      counted.set(key, { finding, count: 1 });
      findings.push(finding);
    }
  };
  const config: RigConfig = {
    ...defaultConfig,
    color: paletteHex(spec.paint),
  };
  const simulate = (patch: Partial<RigConfig> = {}) =>
    new Simulation({ ...config, ...patch }, undefined, spec);
  const times: number[] = [];
  let maxFragments = 0,
    maxComparisons = 0,
    maxKneeFlexion = 0;
  // Budgets and timings describe the Mech alone; the boarding view adds the
  // pilot and ladder, which a spec does not control.
  const inspect = (s: Simulation, label: string, isolated = true) => {
    const start = performance.now();
    const rig = buildRig(s.world, s.config, isolated);
    if (isolated) {
      times.push(performance.now() - start);
      maxFragments = Math.max(maxFragments, rig.occlusion.stats.fragments);
      maxComparisons = Math.max(
        maxComparisons,
        rig.occlusion.stats.comparisons,
      );
    }
    for (const c of rig.components) {
      if (c.id.endsWith(".knee") && c.angle !== undefined)
        maxKneeFlexion = Math.max(maxKneeFlexion, 180 - c.angle);
      for (const issue of c.issues)
        report(
          issue.startsWith("non-finite") ? "error" : "warning",
          "rig",
          `${issue} (${label})`,
          c.id,
        );
    }
    for (const d of rig.occlusion.diagnostics)
      report("error", "occlusion", `${d} (${label})`);
    for (const surface of rig.surfaces)
      if (surface.status === "unresolved")
        report(
          "error",
          "occlusion",
          `unresolved surface (${label})`,
          surface.id,
        );
    return rig;
  };

  // Static leg reach: standing must leave the knee room to bend.
  const legs = spec.legs,
    standing = Math.hypot(
      legs.hipHeight - legs.ankleHeight,
      Math.hypot(legs.stance.width - legs.hipWidth, legs.stance.forward),
    ),
    maxReach = legs.thigh + legs.shin - 0.5,
    minReach = Math.abs(legs.thigh - legs.shin) + 1;
  if (standing > maxReach)
    report(
      "warning",
      "legs.reach",
      `standing needs ${standing.toFixed(1)} of leg but thigh+shin allows ${maxReach.toFixed(1)}; the hips will sit lower than hipHeight`,
    );
  if (standing < minReach)
    report(
      "error",
      "legs.reach",
      `standing hip-to-ankle distance ${standing.toFixed(1)} is shorter than the folded leg (${minReach.toFixed(1)}); lengthen hipHeight or balance thigh/shin`,
    );

  // Rest pose at heading 0: frames are axis-aligned, so volumes read directly.
  const rest = simulate({ heading: 0, animation: "idle" });
  const restRig = buildRig(rest.world, rest.config, true, { volumes: true });
  const base = rest.world.mech.pose().base;
  for (const c of restRig.components)
    for (const issue of c.issues)
      report("error", "rig", `${issue} (rest)`, c.id);
  for (const d of restRig.occlusion.diagnostics)
    report("error", "occlusion", `${d} (rest)`);
  const volumes = [...(restRig.volumes ?? [])].filter(
    ([id]) =>
      restRig.components.some((c) => c.id === id) && !id.includes(".ladder."),
  );
  let footprint = 0;
  for (const [id, v] of volumes) {
    // Limb bounds are approximate cylinders (a shin's sits ~1 below its boot),
    // so limbs fail on their centre line or on more than half their width.
    const sunk = v.limb
      ? Math.max(-(v.axisMinZ ?? 0), -v.min.z - (v.radius ?? 0) / 2)
      : -v.min.z;
    if (sunk > 0.5)
      report(
        "error",
        "ground",
        `extends ${sunk.toFixed(1)} below the ground`,
        id,
      );
    footprint = Math.max(
      footprint,
      Math.hypot(
        Math.max(Math.abs(v.min.x - base.x), Math.abs(v.max.x - base.x)),
        Math.max(Math.abs(v.min.y - base.y), Math.abs(v.max.y - base.y)),
      ),
    );
  }
  // Every part must chain back to the pelvis through touching parts; a
  // cluster of parts touching only each other still floats.
  const attached = new Set(
    volumes.filter(([id]) => id === "mech.pelvis").map(([id]) => id),
  );
  for (let grew = true; grew;) {
    grew = false;
    for (const [id, v] of volumes)
      if (
        !attached.has(id) &&
        volumes.some(
          ([other, w]) =>
            attached.has(other) && overlaps(v, w, CONTACT_TOLERANCE),
        )
      ) {
        attached.add(id);
        grew = true;
      }
  }
  for (const [id] of volumes)
    if (!attached.has(id))
      report(
        "error",
        "connectivity",
        "is not connected to the pelvis at rest, directly or through touching parts; attach it or move it into contact",
        id,
      );
  if (footprint > FOOTPRINT_LIMIT)
    report(
      "warning",
      "footprint",
      `reaches ${footprint.toFixed(1)} from the centre (limit ${FOOTPRINT_LIMIT}); the pilot's walk-around route and collision radius are fixed, so the pilot will clip through it`,
    );
  const cockpitZ =
      spec.turret.height + base.z - legs.hipHeight + spec.cockpit.position.z,
    cockpitFront = spec.cockpit.position.y - spec.cockpit.size.d / 2;
  // The canopy is part of the interface: the pilot climbs through it.
  const { canopy } = spec;
  if (
    Math.abs(canopy.front - cockpitFront) > COCKPIT_INTERFACE.lateral ||
    canopy.halfWidth < 6 ||
    canopy.open.y > 0 ||
    canopy.bottom + canopy.open.z < canopy.top
  )
    report(
      "error",
      "boarding",
      "canopy must sit on the cockpit face (within 3), be at least 12 wide, and open forward far enough that its lower edge rises to its closed top edge; otherwise the pilot climbs through a closed canopy",
      "mech.cockpit.hatch",
    );
  if (Math.abs(spec.cockpit.position.x) > COCKPIT_INTERFACE.lateral)
    report(
      "error",
      "boarding",
      `cockpit is ${spec.cockpit.position.x.toFixed(1)} off the centre line (limit ±${COCKPIT_INTERFACE.lateral}); the ladder, hatch and canopy are centred, so the pilot would climb beside it`,
      "mech.cockpit",
    );
  if (
    Math.abs(cockpitZ - COCKPIT_INTERFACE.centerZ) >
      COCKPIT_INTERFACE.tolerance ||
    Math.abs(cockpitFront - COCKPIT_INTERFACE.front) >
      COCKPIT_INTERFACE.tolerance
  )
    report(
      "error",
      "boarding",
      `cockpit centre height ${cockpitZ.toFixed(1)} / front ${cockpitFront.toFixed(1)} is outside ±${COCKPIT_INTERFACE.tolerance} of the fixed boarding interface (${COCKPIT_INTERFACE.centerZ} / ${COCKPIT_INTERFACE.front}); the ladder climb would miss the hatch`,
      "mech.cockpit",
    );

  // Legs must reach every foot target; past thigh + shin the IK clamps and the
  // drawn shin stretches to the foot.
  const legLength = legs.thigh + legs.shin;
  // Below |thigh − shin| the knee collapses onto the leg line (no lower clamp).
  const foldLength = Math.abs(legs.thigh - legs.shin);
  let reachMargin = Infinity,
    foldMargin = Infinity;
  const reachOf = (s: Simulation) => {
    let worst = Infinity;
    for (const l of s.world.mech.pose().legs) {
      worst = Math.min(worst, legLength - (l.reach ?? 0));
      foldMargin = Math.min(foldMargin, (l.reach ?? 0) - foldLength);
    }
    return worst;
  };

  // Locomotion sweeps: finite geometry, no diagnostics, planted feet stay put.
  const headings = options.quick
    ? [0, 135]
    : [0, 45, 90, 135, 180, 225, 270, 315];
  const every = options.quick ? 15 : 6;
  for (const animation of ["walk", "run"] as const)
    for (const heading of headings) {
      const s = simulate({ heading, animation });
      for (let frame = 1; frame <= 120; frame++) {
        const before = s.world.mech.feet.map((f) => ({
          swing: f.swing,
          p: { ...f.p },
        }));
        s.step(1);
        reachMargin = Math.min(reachMargin, reachOf(s));
        s.world.mech.feet.forEach((f, i) => {
          const b = before[i];
          if (
            !f.swing &&
            !b.swing &&
            (f.p.x !== b.p.x || f.p.y !== b.p.y || f.p.z !== b.p.z)
          )
            report(
              "error",
              "gait",
              `a planted foot slid during stance (${animation})`,
            );
        });
        if (frame >= 30 && frame % every === 0)
          inspect(s, `${animation} ${heading}°`);
      }
    }
  if (foldMargin < 0.001)
    report(
      "error",
      "legs.overfold",
      `an ankle comes ${(-foldMargin).toFixed(1)} closer to the hip than the folded leg allows (|thigh − shin| = ${foldLength.toFixed(1)}); balance thigh and shin or reduce stepLift/ankleHeight`,
    );
  if (reachMargin < 0.001)
    report(
      "error",
      "legs.overreach",
      `a foot target lies ${(-reachMargin).toFixed(1)} beyond thigh + shin while walking or running; lengthen the legs, lower hipHeight or reduce walkSpeed/runSpeed`,
    );
  // Rig Lab tuning goes up to speed and stride 1.25.
  let tunedMargin = Infinity;
  for (const heading of options.quick ? [0] : [0, 90, 180, 270]) {
    const s = simulate({
      heading,
      animation: "run",
      speed: 1.25,
      stride: 1.25,
    });
    for (let frame = 1; frame <= 120; frame++) {
      s.step(1);
      tunedMargin = Math.min(tunedMargin, reachOf(s));
    }
  }
  if (reachMargin >= 0.001 && tunedMargin < 0.001)
    report(
      "warning",
      "legs.overreach",
      `at Rig Lab's maximum speed/stride tuning a foot target lies ${(-tunedMargin).toFixed(1)} beyond thigh + shin`,
    );
  const turning = simulate({ heading: 0, animation: "idle" });
  const turn: Input = { turn: 1 };
  for (let frame = 1; frame <= 90; frame++) {
    turning.step(1, turn);
    if (frame % (every * 2) === 0) inspect(turning, "turning in place");
  }

  // Full exit and reboard in the gameplay view.
  const boarding = simulate({ heading: 150, animation: "idle" });
  const finish = (label: string, control: "foot" | "mech") => {
    let frames = 0;
    while (boarding.world.transition && frames < 1800) {
      boarding.step(1, {});
      if (++frames % 20 === 0) inspect(boarding, label, false);
    }
    if (boarding.world.transition || boarding.world.control !== control)
      report(
        "error",
        "boarding",
        `${label} did not finish (stage ${boarding.world.transition?.stage ?? "none"})`,
      );
  };
  if (!boarding.interact()) report("error", "boarding", "exit was refused");
  else finish("exit", "foot");
  if (!boarding.interact())
    report("error", "boarding", "reboarding was refused");
  else finish("reboard", "mech");

  if (maxFragments > RENDER_BUDGET.fragments)
    report(
      "warning",
      "performance",
      `${maxFragments} drawable fragments (budget ${RENDER_BUDGET.fragments}); prefer surfaces:false on small parts`,
    );
  if (maxComparisons > RENDER_BUDGET.comparisons)
    report(
      "warning",
      "performance",
      `${maxComparisons} occlusion pair checks (budget ${RENDER_BUDGET.comparisons})`,
    );
  for (const { finding, count } of counted.values())
    if (count > 1) finding.message += ` ×${count}`;
  const sorted = times.slice().sort((a, b) => a - b),
    at = (q: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    id: spec.id,
    name: spec.name,
    status: spec.status,
    ok: !findings.some((f) => f.level === "error"),
    findings,
    metrics: {
      standingHipHeight: base.z,
      footprintRadius: footprint,
      maxKneeFlexion,
      reachMargin,
      maxFragments,
      maxComparisons,
      medianBuildMs: at(0.5),
      p95BuildMs: at(0.95),
      sampledPoses: times.length,
    },
  };
}
