# Reproduce an animation issue

Run `npm ci`, `npm run dev`, then open http://127.0.0.1:5173/?lab.

```js
window.rigLab.pause();
window.rigLab.selectActor("mech");
window.rigLab.setHeading(63);
window.rigLab.setAnimation("run");
window.rigLab.setAnimationTime(0.35);
const state = window.rigLab.inspect();
const knee = window.rigLab.inspectComponent("mech.leg.right.knee");
window.rigLab.step(1);
```

Methods are synchronous and can also be awaited. `setAnimationTime` resets and replays at 60 Hz, rounded to the nearest tick (0.35 = 21 ticks). It never changes an isolated clock on a stateful gait. Changing configuration also resets/replays to the current tick, capped at tick 3600 (60 seconds) after longer playback. That bounded restart is deliberate and atomic. Explicit seek is limited to 60 seconds. Near world boundaries, locomotion changes; use short captures for gait comparisons. Pause before automated experiments.

`configure(patch)` validates controls with Zod. `setIsolation(false)` displays both actors during a transfer; `setGuides(false)` hides linkage guides; `selectComponent("")` removes the highlight. `Component.opacity` records fade amount (0–1); `visible` is false at zero opacity or a culled surface, not a pixel-coverage test for depth occlusion. `exportConfig()` / `importConfig(json)` store rig parameters only. Selected component inspection includes polygon geometry. `inspect()` returns joints, bounds, visibility, order, warnings, tick, seed, configuration and full state. Seed 197 is reserved recording metadata; the removed scenery setup and current rig do not consume randomness.

For a gameplay/boarding reproduction:

```js
window.rigLab.pause();
window.rigLab.interact();
window.rigLab.advance(120, {}); // Explicit input, 120 fixed ticks
const recording = window.rigLab.recording();
window.rigLab.replay(recording);
```

Recordings contain initial config, optional initial actor placements, and ordered step/input/interact commands. Old recordings without placement use the default scene positions. `aim: true` must include a finite aimYaw in radians; invalid input is rejected before changing state. Replay validates a maximum of 36,000 frames and 36,001 commands, supporting changing analog input on every frame plus an interaction. Zero-frame steps do not enter the recording. Live gameplay can continue beyond the ten-minute replay budget, but `recording()` then raises an explicit error instead of exporting data that `replay()` would reject. Capture a shorter session after a reset. The time scrub is limited to 60 seconds while the separate read-only elapsed monitor shows longer playback; the time/paused controls synchronize during playback (throttled to roughly 10 Hz) and immediately on API pause/resume. Do not use animation seek to restore a boarding state; use recording/replay. Real-time simulation limits catch-up to 100 ms per render frame and reports dropped seconds; deterministic step/replay never drops steps. Recordings are session diagnostics, not a stable save-game format.

## Browser evidence

With dev server running in another terminal:

```sh
npm run capture
npm run capture -- 60,61,62,63,64,65,66
npm run capture:motion
```

Outputs in `artifacts/`: per-angle PNG + JSON, contact-sheet.png and sweep.json. The report includes order and visibility changes, pixel counts and geometry warnings. Frames in the sheet follow the angle list in row order. Pixel differences are not an artistic quality test.

`npm run test:browser` runs UI, touch/keyboard, boarding, and reviewed screenshot regression tests. Missing/different baselines fail. To intentionally revise them: capture the changed states, inspect actual and diff images, explain why, then explicitly run `npm run test:browser -- --update-snapshots` and review the resulting git diff. Never refresh baselines to make an unexplained failure disappear.

Production builds exclude `window.rigLab`, Tweakpane and the inspector implementation via `import.meta.env.DEV`. Production retains rendering and touch input. `/?lab` becomes normal gameplay in production.

## Reproduce a field-edge boarding case

```js
const config = {
  ...window.rigLab.inspect().config,
  actor: "pilot",
  heading: 0,
  animation: "idle",
};
window.rigLab.pause();
window.rigLab.setIsolation(false);
window.rigLab.replay({
  config,
  placement: { mech: { x: -400, y: -300 }, pilot: { x: -434, y: -300 } },
  commands: [],
});
window.rigLab.interact();
window.rigLab.advance(300, {});
```

`capture:motion` writes cropped actual frames, contact sheets, input recordings and report.json under artifacts/motion. It runs 120 simulated seconds per actor, 20 seconds of stationary turning per actor, full 360° sweeps at 0.35 and 1.5 seconds in 2° increments, and center/corner/edge boarding scenarios. Largest raster-delta pairs are retained for human review. This command intentionally takes longer than the smoke tests and does not update baselines. Its deterministic time is advanced by fixed ticks, not waiting two minutes per actor in real time.

## Surface inspection

```js
window.rigLab.pause();
window.rigLab.configure({ actor: "mech", heading: 89, animation: "run" });
window.rigLab.setAnimationTime(0.35);
window.rigLab.selectComponent("");
window.rigLab.selectSurface("mech.torso.top");
window.rigLab.setSurfaceGuides(true);
const face = window.rigLab.inspectSurface("mech.torso.top");
const resolution = window.rigLab.inspectOcclusion();
const cost = window.rigLab.inspectPerformance();
```

The surface selector and Surface boundaries toggle expose source outlines, culled faces in red, selected fragment boundaries and the selected world normal projected into the view. Occlusion warnings appear in the status bar while surface guides are enabled. These guides are off by default and gameplay never draws them. Component selection remains independent. Surface inspection returns world/projected geometry, normal, depth plane, facing dot product, culling, material/opacity, computed overlaps/occluders, fragments, method and relevant decisions. `inspectOcclusion` includes the actual resolver method/fallback reason, ambiguity diagnostics, approximate depth relationships and localized canopy exception. `inspect()` adds `surfaceStats`, `occlusionMethod`, and `occlusionDiagnostics` without changing existing fields. `inspectPerformance()` avoids cloning large geometry when sampling timings.

Face IDs are stable across headings. Fragment IDs are deterministic for identical inputs, with explicit `source`, but may change when the decomposition topology changes. `visible` does not guarantee uncovered pixels on the fast painter path; consult relationships and actual captures. Near-coplanar surfaces use documented geometric tolerances; approximation flags identify limb/silhouette relationships that cannot establish exact physical visibility.

With development servers running for the feature on 5173 and the original main on 5174, run `BASELINE_URL=http://127.0.0.1:5174 node scripts/capture-surfaces.mjs`. It writes narrow-angle before/after sheets at both gait phases and six-heading warmed CPU timing samples under `artifacts/surfaces`. Use separate Vite cache directories if the worktrees share node_modules. The benchmark baseline can expose the tiny `inspectPerformance: () => ({renderMs: scene.renderMs})` sampling shim; its rendering code stays unchanged. `CAPTURE_HEADINGS`, `CAPTURE_TIMES` and `CAPTURE_OUTPUT` optionally restrict or redirect captures. `capture:motion` now checks occlusion diagnostics too and retains overview sheets and per-heading surface workload for its full sweeps. Browser binaries can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

For a bug report retain config, exact heading/time or recording/placements, surface IDs, `inspectOcclusion()` output and actual adjacent screenshots. Examine the labelled before/after views, not only draw-order or raster-difference counts. Reproduce aiming with `advance(frames, {aim: true, aimYaw: radians})`; upper surfaces follow turret orientation independently from the pelvis.
