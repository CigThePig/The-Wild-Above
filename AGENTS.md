# The Wild Above — working rules

Minimalist top-down 2D action RPG: underground human settlements, hostile surface, Plume energy, pilotable Mechs. The game is The Wild Above; Plume is energy; machines are Mechs.

Use simple silhouettes, restrained palettes and flat geometric art. Animation supplies sophistication. Do not add detailed textures, sprite pipelines or 3D assets to solve a rig problem.

Stack: Phaser 4.2.1, TypeScript, Vite; Tweakpane lab; Zod data boundaries; Vitest/fast-check and Playwright. Phaser owns loop, input, scenes, camera and rendering. All motion and new runtime code must compile as strict TypeScript; do not reintroduce an unchecked motion island. Motion cannot depend on DOM/Phaser. Pose/component data and geometry stay independent of Graphics.

## Commands

- Node >=22.12; `npm ci`; `npm run dev` (localhost:5173); play at `/`, Rig Lab at `/?lab`.
- `npm run check`: typecheck, lint, format check, unit tests and production build.
- `npm run look` renders labelled PNG sheets of every Mech to `artifacts/look/<id>/` in about two seconds, no browser or dev server. Open the PNGs. `--compare main` (or `HEAD`) adds before/after/difference images.
- `npm run mech:check` runs automated design checks; `npm run mech:schema` regenerates `schemas/mech-spec.schema.json` after editing `src/mechs/schema.ts`.
- `npx playwright install --with-deps chromium`, then `npm run test:browser`. Claude Code cloud sessions: the SessionStart hook exports `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when the pinned browser is missing.
- With dev server running, `npm run capture -- 60,61,62,63,64,65,66`.
- With the dev server running, `npm run capture:motion` checks longer locomotion, turns, multiple gait phases and full boarding stages. Inspect largest-delta pairs; pixel counts are not artistic verdicts.
- `npm run format`; `npm run notices` to refresh third-party license notices after dependency changes.

**Agents must inspect the rendered output of visual changes. Successful compilation is not sufficient evidence that an animation works.**

Read docs/animation/migration.md and docs/ai-workflow/rig-lab.md before changing motion. Use window.rigLab pause/selectActor/setHeading/setAnimationTime/inspectComponent and screenshots. Reproduce a bug before changing algorithms. Include a finite-geometry/continuity or replay check alongside rendered evidence. Never blindly regenerate visual baselines.

## Designing Mechs

Mechs are JSON specs in `src/mechs/specs/`, validated by Zod (`src/mechs/schema.ts`) and documented in docs/mechs/authoring.md. Loop: copy a spec with `status: "draft"` → `npm run mech:check -- path.json` → `npm run look -- path.json` and inspect the sheet (use `--focus/--zoom/--guides` for close-ups, `--boarding` for transfers, `--compare HEAD` for edits) → register it in `src/mechs/index.ts` → confirm in the Rig Lab or a browser MCP server. Use palette tokens only; a new colour is a visual-direction change. Only a human sets `status: "approved"`; gameplay must not use drafts. Do not edit `standard.json` in place: it is guarded byte-for-byte by tests/fixtures/rig-geometry.json and motion-parity.json. Boarding choreography is fixed to the standard cockpit; mech:check enforces the interface. `.mcp.json` provides Playwright MCP and Chrome DevTools MCP on the test Chromium for interactive checks (`window.rigLab.previewMech/selectMech/checkMech`).

Add new actors through pose adapters and shared Geometry/Component interfaces; prove a real new anatomy before generalizing gait. Preserve stable component IDs. Changes to schema or projection must document migration/reproduction implications. Full parent rotation transforms are not implemented: local positions are world-aligned offsets.

User approval is required for paid tools/services, accounts, choosing the project's license, destructive history operations, or a change to the visual direction. Ordinary reversible engineering/test work does not require approval. Never force-push. Do not add cloud credentials to routine tests. Preserve upstream copyright/license notices.

Docs: README (run/use), docs/decisions/001-stack.md (dependencies), docs/animation/migration.md (boundaries/limits), docs/ai-workflow/rig-lab.md (automation), docs/roadmap.md (next work).
