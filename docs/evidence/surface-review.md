# Phase 1 rendering evidence

Validated 2026-10-09 against main `56ce35a` (merged Phase 0 PR #1). The runtime preserves the minimalist silhouette, colours, motion calculations and recording/config formats. Torso and shoulder armour now resolve actual planar depth relationships; pack, cockpit housing, pelvis and barrel also use semantic faces because their mean-depth silhouettes otherwise conflict with the torso.

## Verification

- `npm run check`: strict TypeScript, ESLint, **35 unit/property tests**, production build passed.
- `npm run test:browser`: **9 tests passed** in standalone Chromium 153. Existing seven screenshot baselines passed unchanged; none were regenerated. Actual touch dragging on a mobile/high-DPI viewport, keyboard movement, boarding, review regressions, surface selection/diagnostics, aiming/replay and production API exclusion passed.
- Surface tests cover outward normals, original footprint, world/projected depth agreement, stable IDs, edge-on/reverse/degenerate geometry, coplanar ties, different local depth orders, bounded failures, transparency and a genuine three-surface ordering cycle. A separate winding-number/depth-sampled oracle checks the final front-most output, independently of the clipping implementation.
- Two full 360° sweeps per actor, at 0.35 and 1.5 seconds in 2° increments, produced **724 actual browser captures**. Every geometry/constraint/occlusion diagnostic was empty. Narrow-angle before/after captures include every requested integer around 60–66°, 86–94° and 268–274°, plus 359→0. All 54 new Mech narrow-angle states used geometric ordering with bounded splits and no unresolved cases.
- Two minutes of changing movement per actor and twenty seconds of stationary turns passed finite geometry/contact checks and exact recording replay. Center exit/reboarding, corner exit/reboarding and the previously reviewed edge approach completed, with staged pilot fades captured.

Local Playwright browser CDN downloads returned invalid archives. These runs used separately extracted Chromium 153 from the standalone Chromium distribution through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; no runtime dependency was added. CI continues to use Playwright's pinned Chromium. Mobile tests are **browser emulation**, not physical Android verification.

## Visual review

[Comparison at 0.35 seconds](surface-review/comparison-0.35.png) and [comparison at 1.5 seconds](surface-review/comparison-1.5.png) place original-main frames on the left and new frames on the right, labelled with heading and time. Torso/shoulder/arm regions no longer rely on a whole-volume representative depth. Rear armour, cockpit housing and tool relationships change locally where the surface depths warrant it. These are intentional overlap corrections, not new decorative panels.

The initial implementation exposed thin diagonal raster seams on the front/rear cap. Inspection of Phaser 4.2.1's `GraphicsWebGLRenderer` and `FillPath` showed default one-screen-pixel path simplification discarded small shared vertices. Setting `render.pathDetailThreshold: 0` removed the seams in actual recaptures without inflating geometry, adding strokes, changing opacity or introducing a depth bias. Reviewed full and narrow-angle views after this fix show continuous caps and connected armour, including 90°/270° side views. No whole-panel disappearance or inverted face was apparent in the inspected neighbouring frames.

Reviewed evidence includes:

- [Mech overview, phase 0.35](surface-review/mech-phase-0.35-overview.png) and [phase 1.5](surface-review/mech-phase-1.5-overview.png): headings 0, 30, …, 330 in row order.
- [Largest Mech changes, phase 0.35](surface-review/mech-phase-0.35-largest-deltas.png) and [phase 1.5](surface-review/mech-phase-1.5-largest-deltas.png): pairs before then after, ordered by raster delta. Their exact angles are in [motion-summary.json](surface-review/motion-summary.json). The largest phase-0.35 pairs include 90→92°, which was visually inspected; counts alone were not treated as correctness.
- [Running](surface-review/mech-run-sheet.png), [stationary turns](surface-review/mech-turn-sheet.png), [pilot phase 0.35](surface-review/pilot-phase-0.35-overview.png) and [pilot phase 1.5](surface-review/pilot-phase-1.5-overview.png).
- [Center boarding](surface-review/center-boarding-sheet.png), [corner boarding](surface-review/corner-boarding-sheet.png) and [edge approach](surface-review/edge-approach-boarding-sheet.png). Frames follow `boarding.samples` in the summary; some field-edge/top regions are cropped because the camera follows the controlled actor. Faded pilot emergence remains an intentional animation effect.

These observations support the targeted implementation; they do not prove anatomical correctness of every unchanged limb approximation or arbitrary future scene.

## Performance

The first clipping-only implementation measured about 5.6 ms median rig submission at 90°, versus 0.4 ms on Phase 0. Profiling identified clipping/temporary polygon work. The final implementation uses geometric fragment ordering for the common acyclic case, convex separation tests, lazy hidden-region cuts and reuse of intact half-plane inputs; clipping is reserved for cyclic/transparent fallback. No new engine or paid/runtime dependencies were introduced.

The final same-pose browser comparison used 80 warmups and 300 synchronous samples per heading, with both variants in the same Chromium process and equivalent viewport/pose. Baseline rendering remained unchanged; a minimal `inspectPerformance` sampling shim avoided large inspection clones. Values below are milliseconds of **CPU rig generation/resolution/Graphics command submission**; GPU execution happens later and is not measured by `renderMs`.

| Heading | Phase 0 median | Phase 1 median | Generation median | Resolver median | Phase 1 p95 |
| ------- | -------------: | -------------: | ----------------: | --------------: | ----------: |
| 0°      |            0.4 |            3.4 |               0.3 |             2.6 |         7.6 |
| 45°     |            0.4 |            3.5 |               0.3 |             3.0 |         6.4 |
| 63°     |            0.4 |            3.6 |               0.3 |             3.0 |         9.5 |
| 90°     |            0.3 |            2.4 |               0.3 |             1.9 |         3.6 |
| 180°    |            0.3 |            1.9 |               0.3 |             1.4 |         3.0 |
| 270°    |            0.4 |            2.2 |               0.3 |             1.8 |         4.0 |

This is a meaningful remaining CPU regression, despite optimization. The shared execution environment has scheduling/GC outliers (including the baseline); maxima are not device throughput claims. One actor's local solver is measured here, not an expedition with many animated actors. Physical Android CPU/GPU, battery/thermal behaviour and multi-actor budgets must be profiled before claiming device readiness.

Each Mech has **70 source faces** (seven blocks × ten faces, including culled faces). Full Mech sweeps peaked at **171 drawable fragments**, **8 patches from one source**, **17,903 pair checks** including fragment ordering/broad rejection, and **1,132 drawable vertices**. All 362 Mech sweep states used geometric ordering. The cyclic fallback is exercised by independent synthetic tests; transparent boarding exercises composition. Budgets did not trigger in these captures.

[report.json](surface-review/report.json) contains narrow-angle states and timing distributions; [timing-samples.json.gz](surface-review/timing-samples.json.gz) preserves raw timing samples. [motion-summary.json](surface-review/motion-summary.json) includes workload maxima and reproduction recordings; [motion-report.json.gz](surface-review/motion-report.json.gz) retains every sweep's deltas and workload. Captures are reproducible with the scripts described in Rig Lab documentation.

## Limits and next work

Limb slices, boots, knee blocks, hook and human artwork retain representative-depth approximations. The canopy's tangent width collapse and +15 artistic bias are explicit in the inspector. Exact local plane resolution is not a general scene depth buffer, and transparent legacy-to-legacy order is approximate. Fragment identities are reproducible for identical geometry but can change when split topology changes; component/surface identities remain stable. The next priority is physical Android and multi-actor profiling, then a targeted limb migration only if an observed defect justifies it.
