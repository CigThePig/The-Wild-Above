# The Wild Above

Phase 0 foundation: a minimal 2D Phaser field scene and an inspectable procedural Rig Lab. Plume is the world's energy; vehicles are Mechs.

## Run

Node **22.12+**:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ to play, or http://127.0.0.1:5173/?lab for Rig Lab. For a phone on the same network: `npm run dev -- --host 0.0.0.0` and use your computer's LAN address.

**Play:** WASD/arrows move, Shift runs, Q/E turn, F or the button exits/boards. The touch joystick moves; push it outward to run. Walk near the Mech to board. Boarding temporarily owns movement. This scene tests locomotion and transfer, not combat or progression.

**Rig Lab:** select pilot/Mech, heading and gait; pause/step/seek; edit motion values; select named components to see contact, bounds, order and diagnostics; import/export validated JSON. Knee limit is a diagnostic flexion warning, not a physical constraint solver.

## Validate

```sh
npm run check
npx playwright install --with-deps chromium
npm run test:browser
# With npm run dev running in a second terminal:
npm run capture -- 60,61,62,63,64,65,66
npm run build
npm run preview
```

Captures, contact sheets and diagnostic JSON go in `artifacts/`. Screenshot baselines are committed and must be visually reviewed before updates. If using an already installed compatible Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. CI installs Playwright's pinned Chromium normally.

## What is here

- Phaser loop, cameras, Graphics, responsive field scene and Rex touch joystick.
- Retained world-space mech foot placement, human run gait, two-link IK and staged boarding/exiting.
- Typed component/geometry interfaces; stable names such as `mech.leg.right.knee`.
- Fixed-step replay, configuration/recording validation, dev-only `window.rigLab` automation.
- Tweakpane controls, Vitest property/unit tests, Playwright UI/visual tests and GitHub Actions.

## Scope and limits

This is a working development foundation, not a finished engine or game. Existing motion remains in one documented JS module behind TypeScript interfaces. Rendering follows the minimal prototype; subdivided limbs reduce coarse depth swaps but broad-body occlusion still needs work. World collision is the inherited range clamp and pilot/Mech separation, not a navigation system. The rig schema is reusable; motion controllers are currently biped-specific. There is no full rig editor, combat migration, quadruped, native mobile package or save system.

Mobile layout/input is browser-tested; real Android performance and thermal behavior are unverified. Production excludes Rig Lab automation. No project license has been chosen; dependency licenses remain applicable.

Start with [AGENTS.md](AGENTS.md), [automation workflow](docs/ai-workflow/rig-lab.md), [migration and rendering limits](docs/animation/migration.md), [dependency decisions](docs/decisions/001-stack.md), and [roadmap](docs/roadmap.md).
