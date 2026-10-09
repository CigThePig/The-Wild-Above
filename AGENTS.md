# The Wild Above — working rules

Minimalist top-down 2D action RPG: underground human settlements, hostile surface, Plume energy, pilotable Mechs. The game is The Wild Above; Plume is energy; machines are Mechs.

Use simple silhouettes, restrained palettes and flat geometric art. Animation supplies sophistication. Do not add detailed textures, sprite pipelines or 3D assets to solve a rig problem.

Stack: Phaser 4.2.1, TypeScript, Vite; Tweakpane lab; Zod data boundaries; Vitest/fast-check and Playwright. Phaser owns loop, input, scenes, camera and rendering. The temporary migrated JS motion island is explicitly documented; new code must be typed. Motion cannot depend on DOM/Phaser. Pose/component data and geometry stay independent of Graphics.

## Commands

- Node >=22.12; `npm ci`; `npm run dev` (localhost:5173); play at `/`, Rig Lab at `/?lab`.
- `npm run check`: typecheck, lint, unit tests and production build.
- `npx playwright install --with-deps chromium`, then `npm run test:browser`.
- With dev server running, `npm run capture -- 60,61,62,63,64,65,66`.
- `npm run format`; `npm run notices` to refresh third-party license notices after dependency changes.

**Agents must inspect the rendered output of visual changes. Successful compilation is not sufficient evidence that an animation works.**

Read docs/animation/migration.md and docs/ai-workflow/rig-lab.md before changing motion. Use window.rigLab pause/selectActor/setHeading/setAnimationTime/inspectComponent and screenshots. Reproduce a bug before changing algorithms. Include a finite-geometry/continuity or replay check alongside rendered evidence. Never blindly regenerate visual baselines.

Add new actors through pose adapters and shared Geometry/Component interfaces; prove a real new anatomy before generalizing gait. Preserve stable component IDs. Changes to schema or projection must document migration/reproduction implications. Full parent rotation transforms are not implemented: local positions are world-aligned offsets.

User approval is required for paid tools/services, accounts, choosing the project's license, destructive history operations, or a change to the visual direction. Ordinary reversible engineering/test work does not require approval. Never force-push. Do not add cloud credentials to routine tests. Preserve upstream copyright/license notices.

Docs: README (run/use), docs/decisions/001-stack.md (dependencies), docs/animation/migration.md (boundaries/limits), docs/ai-workflow/rig-lab.md (automation), docs/roadmap.md (next work).
