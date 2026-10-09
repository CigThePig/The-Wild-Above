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

Methods are synchronous and can also be awaited. `setAnimationTime` resets and replays at 60 Hz, rounded to the nearest tick (0.35 = 21 ticks). It never changes an isolated clock on a stateful gait. Changing configuration also resets/replays to the current tick. Seek is limited to 60 seconds. Near world boundaries, locomotion changes; use short captures for gait comparisons. Pause before automated experiments.

`configure(patch)` validates controls with Zod. `exportConfig()` / `importConfig(json)` store rig parameters only. Selected component inspection includes polygon geometry. `inspect()` returns joints, bounds, visibility, order, warnings, tick, seed, configuration and full state. Seed 197 belongs to retained deterministic scenery setup; the rig does not consume randomness.

For a gameplay/boarding reproduction:

```js
window.rigLab.pause();
window.rigLab.interact();
window.rigLab.advance(120, {}); // Explicit input, 120 fixed ticks
const recording = window.rigLab.recording();
window.rigLab.replay(recording);
```

Recordings contain initial config and ordered step/input/interact commands. Replay validates a maximum of 36,000 steps / 3,600 commands. Do not use animation seek to restore a boarding state; use recording/replay. Real-time simulation limits catch-up to 100 ms per render frame and reports dropped seconds; deterministic step/replay never drops steps. Recordings are session diagnostics, not a stable save-game format.

## Browser evidence

With dev server running in another terminal:

```sh
npm run capture
npm run capture -- 60,61,62,63,64,65,66
```

Outputs in `artifacts/`: per-angle PNG + JSON, contact-sheet.png and sweep.json. The report includes order and visibility changes, pixel counts and geometry warnings. Frames in the sheet follow the angle list in row order. Pixel differences are not an artistic quality test.

`npm run test:browser` runs UI, touch/keyboard, boarding, and reviewed screenshot regression tests. Missing/different baselines fail. To intentionally revise them: capture the changed states, inspect actual and diff images, explain why, then explicitly run `npm run test:browser -- --update-snapshots` and review the resulting git diff. Never refresh baselines to make an unexplained failure disappear.

Production builds exclude `window.rigLab`, Tweakpane and the inspector implementation via `import.meta.env.DEV`. Production retains rendering and touch input. `/?lab` becomes normal gameplay in production.
