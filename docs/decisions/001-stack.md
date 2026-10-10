# 001 — Small dependency set, preserved motion

Decision date: 2026-10-09; agent tooling added 2026-10-10. Exact installed versions are in package.json and package-lock.json. No project license has been selected.

## Accepted

| Tool                         | Purpose and evidence                                                                                                              | License / boundary                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Phaser 4.2.1                 | Official download page and npm stable agree. Owns scenes, loop, Graphics/WebGL, cameras, pointer/keyboard input and lifecycle.    | MIT. Native 2D rendering, no external renderer.                               |
| TypeScript / Vite            | Strict types for new code, local ESM development and production dead-code elimination.                                            | Apache-2.0 / MIT. Node >=22.12.                                               |
| Rex virtual joystick 1.80.20 | Single module import; published package modified March 2026; docs explicitly cover Phaser 4. Browser test exercises actual touch. | MIT. Requires the small Phaser-global adapter. No entire plugin suite loaded. |
| Tweakpane 4.0.5              | ESM parameter controls with shipped types.                                                                                        | MIT. Development-only dynamic import. @tweakpane/core is a type dependency.   |
| Zod                          | Validates configuration, imported recordings and external inputs.                                                                 | MIT. Pure data boundary, no engine dependency.                                |
| Vitest / fast-check          | Unit tests and targeted seeded IK / heading properties.                                                                           | MIT. Development only.                                                        |
| Playwright 1.58.2            | Actual browser interaction, precise screenshots and regression comparisons.                                                       | Apache-2.0. Pinned browser tooling for reproducibility.                       |
| pngjs / pixelmatch           | Contact sheets and neighboring-frame difference counts.                                                                           | MIT / ISC. Offline diagnostics only.                                          |
| ESLint / Prettier            | Linting and readable source, including formatting migrated code.                                                                  | MIT. Development only.                                                        |
| tsx 4.23.15                  | Runs TypeScript tooling (`look`, `mech:check`, `mech:schema`) against the same `src/` modules as the game.                        | MIT (esbuild MIT). Development only.                                          |
| @napi-rs/canvas 1.0.9        | Browserless PNG previews: replays `drawRig` on a Skia canvas; 0.03% pixel difference from Phaser on a matched pose.               | MIT, bundles Skia (BSD-3-Clause). Development only, prebuilt native binary.   |
| gifenc 1.0.3                 | Animated gait GIFs for human review (`look --gif`).                                                                               | MIT. Development only; tiny, no dependencies, stable since 2021.              |
| @playwright/mcp 0.0.82       | Agent-driven browser via `.mcp.json`; verified navigating, evaluating `window.rigLab` and screenshotting.                         | Apache-2.0. Development only; pre-1.0, nests its own Playwright build.        |
| chrome-devtools-mcp 1.10.1   | Agent access to console, network and performance traces via `.mcp.json`.                                                          | Apache-2.0. Development only; usage statistics and CrUX lookups disabled.     |

Keep dependency copyright and license notices in distributions. Phaser and bundled Rex code retain upstream notices. `npm run notices` produces the installed production dependency notice inventory. This is separate from ownership/licensing of the creator's code.

## Evaluated and deferred

| Candidate                              | Decision                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Earcut (ISC)                           | Phaser Graphics already triangulates polygons. A second direct triangulation dependency solves nothing here. Revisit if emitting indexed Mesh2D geometry.                                                                                                                                               |
| polygon-clipping (MIT)                 | Boolean polygon operations do not establish correct spatial occlusion by themselves. Project issues also point at a newer TypeScript successor. No current Boolean geometry requirement; not installed.                                                                                                 |
| Mesh2D / stencil / masks               | Phaser 4.2 provides these natively. Mesh2D explicitly has **no depth information**. Neither meshes nor masks automatically fix average-depth sorting. Start with Graphics, stable identities and subdivided limbs; profile before switching.                                                            |
| Phaser animation / tweens              | Good for sprite frames and UI effects. Gait depends on previous foot contacts; do not use independent tween clocks for it. Fixed-step simulation owns pose.                                                                                                                                             |
| Spine official Phaser runtime          | Existing supported integration, but runtime/editor licensing obligations require a commercial licensing decision. No dependency, editor or account required here.                                                                                                                                       |
| culori, Vitest browser mode, Storybook | Considered for the Mech authoring tools. Palette tokens make colour maths unnecessary, Playwright already covers in-browser tests, and `npm run look` replaces a component gallery. Not installed.                                                                                                      |
| LLM SDKs                               | Mechs are designed by coding agents at authoring time, not generated at runtime. A runtime generator would need a paid API key and approval.                                                                                                                                                            |
| Rive web (MIT runtime)                 | Active 2.44.1 package observed. Suitable for authored vector state machines; would require a new asset workflow and provides no replacement for existing world-space foot placement. Deferred.                                                                                                          |
| FULLIK                                 | Open-source iterative chain solver reviewed. No `fullik` npm package at the checked name; extra chain/3D integration adds complexity versus the existing tiny analytic two-link solvers. No demonstrated improvement. Not adopted; license/maintenance verification is required before future adoption. |
| XState (MIT)                           | Active 5.33.2 package observed. Useful for interruption-heavy boarding later, but current linear stages already work. Preserve them with round-trip tests before replacing the transition model.                                                                                                        |
| Capacitor (MIT)                        | Active 8.5.3 package observed. Browser-first code can be packaged later. Native projects, signing and plugins are unnecessary for this milestone.                                                                                                                                                       |

Deferred libraries have not been integration-tested and are not approved dependencies merely by appearing in this table.

## Primary references

- https://phaser.io/download (stable version)
- https://phaser.io/news/2026/06/phaser-v4-2-0-released (Mesh2D, stencil limitations)
- https://docs.phaser.io/phaser/concepts/gameobjects/graphics
- https://rexrainbow.github.io/phaser3-rex-notes/docs/site/virtualjoystick/
- https://tweakpane.github.io/docs/getting-started/
- https://esotericsoftware.com/spine-phaser and https://esotericsoftware.com/spine-editor-license
- https://rive.app/docs/runtimes/web/web-js
- https://github.com/mapbox/earcut and https://github.com/mfogel/polygon-clipping
- https://github.com/lo-th/fullik
- https://stately.ai/docs and https://capacitorjs.com/docs
- https://playwright.dev/docs/test-snapshots and https://vitest.dev/guide/

Package licensing/version metadata was also checked directly against npm and installed package manifests. Publication activity is evidence, not a guarantee of long-term maintenance.
