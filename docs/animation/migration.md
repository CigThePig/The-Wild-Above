# Motion migration and occlusion

## Source audit

The creator's supplied `PLUME_Running_and_Boarding_Source(1).zip` contained a plain JavaScript Canvas demo: `gear.js`, `pilot.js`, `styles.js`, `app.js`, bespoke QA scripts and comparison media. This archive name is provenance, not current branding.

Retained: acceleration damping, bounded turning, planted mech feet, predictive foot targets, alternating swing, analytic two-link IK, near-extended human legs, running cadence/arm swing, approach routing, staged hatch/climb/seating and reverse exit. The new renderer follows the chosen minimal B silhouette design. Weapon firing/range targets, style A/C and old DOM/event loop were not migrated as features.

Motion now lives in strict TypeScript modules in `src/animation/motion/`: math/IK, Mech gait, Pilot gait, boarding geometry and the world/transfer controller. The unchecked JS module and its unused range-combat/scenery superclass were removed. No facade cast, `allowJs`, lint exemption or `any` is needed for motion. A 48-state fixture captured from the previous implementation verifies exact walk/run root, knee and foot pose parity for both actors, three headings, two speeds and four timestamps.

Review corrections:

- Hatch-side ground positions retain preferred cardinal directions and use a bounded inward diagonal at corners. The previous out-of-bounds fallback is gone.
- Boarding approaches use a small visibility graph around the single circular footprint. Every segment stays in the convex field and outside radius 34. Ring/wall intersection nodes preserve paths from wall-adjacent starts. Unreachable approaches are rejected before a transition owns input; there is no straight-through fallback. This is a bounded approach solver, not a world pathfinding engine.
- Pilot collision response retains the previous valid position when radial separation would push through a field wall.
- Pilot components expose effective `opacity` as well as `visible`, including zero-opacity stages. Hidden components remain inspectable during transfer; opaque depth coverage by other shapes is not modeled as component visibility.
- Aim input is a typed and validated union: `aim: true` requires a finite `aimYaw`.
- Configuration edits are transactional. Playback beyond 60 seconds is rebuilt at tick 3600 on edit, with the new configuration. The bounded restart is explicit; edits never leave old world tuning paired with a new config.

## Separation

- Motion knows world coordinates and contacts, not Phaser, DOM or rendering.
- `Simulation` owns the 60 Hz step, validated configuration and reset/replay.
- `buildRig` translates actor poses into named components and renderer-independent polygons.
- `Geometry` projects and sorts primitives; `drawRig` submits them to Phaser Graphics.
- `FieldScene` owns game input, camera, lifecycle and performance timing.
- Development-only Rig Lab reads the same state as gameplay.

Axes: +x right, +y south, +z elevation. Heading 0 points north. Projection is `(x, .72*y-.694*z)`; depth is `.694*y+.72*z`. Hierarchy `local` values are translation offsets in world-aligned axes, **not** full parent-local rotation matrices. Current knee angle is the interior angle; the warning limit is flexion `180-angle`. The configurable limit reports violations; it does not clamp IK and break foot contact.

## Directional layering: targeted improvement, not a full solution

Old minimal rendering collapsed every entire limb/solid to one average-depth silhouette. Crossing two means reordered a whole limb. It also switched the full cockpit plate at `-cos(yaw) > .05` and the pilot nose at a separate hard threshold.

New limbs use eight overlapping opaque slices with stable IDs and per-slice depth. Equal-depth ties sort by stable ID. This localizes depth changes. Cockpit width goes continuously to zero at its tangent rather than switching a full-width plate. The pilot nose threshold was removed. Shapes remain flat filled and minimal; no cross-fade is used to hide occlusion errors.

Remaining limitations: broad torso, shoulder and foot silhouettes still use mean depth; intersecting silhouettes can therefore have incorrect overlap. The canopy tangent treatment is a 2D art approximation, not a physically correct surface. Limb slices do not solve cyclic occlusion or interpenetration. Joint markers deliberately draw on top for diagnosis. A general depth buffer, BSP engine or Boolean clipping system was not justified for two actors.

Use the 60–66° sweep, cardinal views and boarding captures before changing this. Order changes alone are not errors: disjoint polygons can reorder harmlessly. Inspect the pixels and component data together. Do not describe all turning glitches as solved.

## Extending actors

Add a pose adapter returning named world joints and a geometry builder using Geometry's block/limb/polygon methods. Register an ActorId/config choice and lab selector, then test finite geometry, deterministic replay and rendered cardinal/sweep views. Reuse gait only where anatomy warrants it: current motion controllers are biped-specific. Quadrupeds need a contact scheduler, not a copied mech class with four legs. Keep shared Geometry and Component contracts; do not invent a universal animation language first.
