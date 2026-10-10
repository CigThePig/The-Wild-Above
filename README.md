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
npm run mech:check
npm run look            # browserless Mech sheets in artifacts/look/
npx playwright install --with-deps chromium
npm run test:browser
# With npm run dev running in a second terminal:
npm run capture -- 60,61,62,63,64,65,66
npm run capture:motion
npm run build
npm run preview
```

Captures, contact sheets and diagnostic JSON go in `artifacts/`. Screenshot baselines are committed and must be visually reviewed before updates. If using an already installed compatible Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. CI installs Playwright's pinned Chromium normally.

## Designing Mechs

Mechs are validated JSON specs (`src/mechs/specs/`) that coding agents can author. `npm run mech:check` reviews a design, and `npm run look` renders labelled turnaround, gait and boarding sheets (plus `--compare <git-ref>` before/after images) without a browser. The Rig Lab design selector and `window.rigLab.previewMech` show designs live. Drafts need human approval before gameplay use. See [authoring Mechs](docs/mechs/authoring.md).

For agents: `.mcp.json` provides Playwright MCP and Chrome DevTools MCP on the test Chromium. In Claude Code cloud sessions a SessionStart hook installs dependencies and points Playwright at the image's Chromium.

## What is here

- Phaser loop, cameras, Graphics, responsive field scene and Rex touch joystick.
- Retained world-space mech foot placement, human run gait, two-link IK and staged boarding/exiting.
- Typed component/geometry interfaces; stable names such as `mech.leg.right.knee`.
- Data-driven Mech specs with a palette, extra parts on body/turret/joint/bone frames, automated design checks and browserless previews.
- Fixed-step replay, configuration/recording validation, dev-only `window.rigLab` automation.
- Tweakpane controls, Vitest property/unit tests, Playwright UI/visual tests and GitHub Actions.

## Scope and limits

This is a working development foundation, not a finished engine or game. Motion is fully typed, with a fixture protecting the migrated walk/run poses. Rendering follows the minimal prototype; subdivided limbs reduce coarse depth swaps but broad-body occlusion still needs work. World collision remains a field clamp and pilot/Mech separation; bounded boarding routes avoid the parked footprint. The rig schema is reusable; motion controllers are currently biped-specific. There is no full rig editor, combat migration, quadruped, native mobile package or save system.

Mobile layout/input is browser-tested; real Android performance and thermal behavior are unverified. Production excludes Rig Lab automation. No project license has been chosen; dependency licenses remain applicable.

Start with [AGENTS.md](AGENTS.md), [authoring Mechs](docs/mechs/authoring.md), [automation workflow](docs/ai-workflow/rig-lab.md), [migration and rendering limits](docs/animation/migration.md), [dependency decisions](docs/decisions/001-stack.md), and [roadmap](docs/roadmap.md).

## GitHub Pages

The [Publish GitHub Pages](.github/workflows/deploy-pages.yml) workflow checks the Pages-specific build on pull requests, then automatically deploys the production game after changes land on `main`. PR builds never replace the live site. The expected URL is https://cigthepig.github.io/The-Wild-Above/.

Before the first deployment, select **Settings → Pages → Build and deployment → Source: GitHub Actions** for this repository. Afterward, merging to `main` publishes automatically. The workflow also supports manually redeploying `main` using **Actions → Publish GitHub Pages → Run workflow**.

GitHub Pages serves this repository beneath `/The-Wild-Above/`, so the workflow uses the Vite base-path flag. To reproduce its build locally:

```sh
npm ci
npm run build -- --base=/The-Wild-Above/
```

The hosted build is the playable demo only. Rig Lab and its inspection automation are intentionally development-only.
