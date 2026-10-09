# Motion typing and Codex review follow-up

2026-10-09. This supplements the initial Phase 0 evidence.

All five Codex findings on PR #1 have regression coverage: unreachable corner exits, blocked edge approaches, configuration edits after the seek horizon, pilot fade inspection, and aiming without an angle. Corner exits use an inward reachable door; approaches use a bounded visibility graph around the parked Mech. Unreachable routes reject interaction before taking control. Components now expose effective opacity, and invalid aim inputs reject before simulation mutation. Configuration edits build a replacement atomically and deliberately restart at at most 60 seconds.

The JavaScript motion island is gone. Math/IK, Mech, pilot, boarding geometry and world transitions are separate strict TypeScript modules. Forty-eight pre-migration motion samples match exactly, including root motion and hip/knee/foot positions. Existing visual baselines pass without regeneration.

Validation passed:

- TypeScript, ESLint, 22 Vitest tests and the production build.
- Six Playwright scenarios, including mobile keyboard/boarding, actual touch input, production API exclusion and the reviewed failures through the public Rig Lab interface.
- Two minutes of changing movement per actor (7,200 fixed ticks each), planted Mech foot checks, finite geometry/IK diagnostics and exact recording replay.
- Twenty seconds of stationary turning per actor.
- Four complete angular sweeps: Mech and pilot at 0.35 and 1.5 seconds, every 2 degrees, including 358→0. All 724 rendered states had empty geometry/constraint diagnostics. Adjacent raster differences, visibility and draw-order changes are recorded, rather than treated as automatic artistic pass/fail thresholds.
- Center exit/reboarding, exact-corner exit/reboarding, and the reviewed opposite-side edge approach completed. Separate unit coverage exercises all four corners/cardinal headings and reachable near-edge starting positions.

The actual run sheets, turning sheets, largest-difference pairs and boarding sheets were inspected. No whole-leg pop was apparent in the inspected pairs. The largest Mech differences occurred around the thin side views (88→90 and 270→272); draw-order changes still occur. Broad torso plates still use average depth, so these checks do **not** prove correct occlusion for every pose. Splitting broad torso geometry remains the next rendering priority. Boarding remains a staged movement sequence rather than articulated hand/ladder contact.

Reproduce with `npm run dev` in one terminal and `npm run capture:motion` in another. Full output goes to ignored `artifacts/motion/`. Selected review artifacts are committed in [motion-review/](motion-review/), including the machine-readable [report](motion-review/report.json). Run sheets are chronological at 0, 5, 15, 30, 60, 90 and 120 seconds. Difference sheets show the three largest neighboring pairs in descending order, before then after. Boarding sheets follow the `samples` order in the report; fade opacity and recording inputs are included there.

Local browser execution used separately extracted Chromium 133 because the Playwright CDN returned invalid archives in this environment. CI uses Playwright's pinned Chromium normally. No physical Android, thermal, or native deployment testing was performed.
