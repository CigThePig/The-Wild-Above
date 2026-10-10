# Authoring Mechs

A Mech is a JSON spec in `src/mechs/specs/`. The spec holds dimensions, gait constants, colours and extra parts. Motion, IK, occlusion and boarding code are shared. Coding agents author specs; a human approves the silhouette.

- Contract: `src/mechs/schema.ts` (Zod). Generated JSON Schema: `schemas/mech-spec.schema.json`, referenced by each spec's `$schema` so editors validate while typing.
- Registry: `src/mechs/index.ts`. Rig Lab and tooling can also load unregistered drafts.
- Examples: `standard.json` (approved; the reviewed machine) and `strider.json` (draft, built with these tools).

## The loop

```sh
cp src/mechs/specs/standard.json src/mechs/specs/my-mech.json   # set id, name, status "draft"
npm run mech:check -- src/mechs/specs/my-mech.json             # design review, exits 1 on errors
npm run look -- src/mechs/specs/my-mech.json                   # artifacts/look/my-mech/sheet.png
```

Open `sheet.png` (and `report.json`) after every change. Successful checks are not evidence that it looks right. When it reads well:

1. Add it to the import list in `src/mechs/index.ts`. A unit test then runs `mech:check` on every registered spec.
2. Confirm in the browser: Rig Lab design selector, or `window.rigLab.selectMech(id)` through a browser MCP server.
3. Run `npm run check`.
4. Leave `status: "draft"`. A human reviews `look --gif --boarding` output and sets `approved`.

Never edit `standard.json` in place. It is guarded byte-for-byte by `tests/fixtures/rig-geometry.json` and `motion-parity.json`; changing it is a reviewed visual change, not an authoring step.

## Coordinates and frames

Mech units; +x right, +y back (south at heading 0), +z up. **Front is −y.** Each part sits in a frame:

| Frame                                   | Origin                                                           | Yaw           | Copies                    |
| --------------------------------------- | ---------------------------------------------------------------- | ------------- | ------------------------- |
| `body`                                  | hip centre (`legs.hipHeight` when standing)                      | body          | one, or two with `mirror` |
| `turret`                                | upper-body origin (`turret.height` when hips are at `hipHeight`) | turret (aims) | one, or two with `mirror` |
| `shoulder`, `elbow`, `wrist`            | arm joint                                                        | turret        | left + right              |
| `hip`, `knee` / `foot`                  | leg joint / ankle                                                | body / foot   | left + right              |
| `upper-arm`, `forearm`, `thigh`, `shin` | point `along` the bone (0 upper joint, 1 lower)                  | turret / body | left + right              |

Per-side and mirrored parts use x as "outward". Offsets rotate with yaw only. They do not tilt with a bone: there are no parent rotation transforms (AGENTS.md). Blocks are always upright octagonal prisms. For plates that follow a sloped limb, use a `limb` part on a bone frame with `along` for `from` and `alongTo` for `to`.

Core sections: `legs` (IK lengths, stance, widths, boots, optional kneecaps), `gait` (speeds, turn rate, step timing, bob), `pelvis` (body frame), `turret.height`, `torso`, optional `pack`, `cockpit`, `canopy` (continuous width collapse; hatch travel), `arms` (right arm; left mirrors), `tools` (optional `barrel` and concave `hook` outline), and `parts` (up to 24 extra blocks/limbs). Component IDs are stable: core parts keep their existing names, and extras are `mech.part.<id>[.left|.right]`.

## Colours

Specs use palette tokens (`src/mechs/palette.ts`): `sand`, `bone`, `slate`, `glass`, `ochre`, `straw`, all taken from existing art. `paint` is the live Rig Lab paint, initialised from the spec's `paint` token when the Mech is selected. Adding a token changes the visual direction and needs human approval.

## What `mech:check` enforces

Errors block approval; warnings need a human look. The standard Mech has no findings.

- **legs.reach**: standing must leave the knee room to bend (warning), and must not be shorter than the folded leg (error).
- **connectivity**: every part must touch another at rest; floating parts are errors.
- **ground**: solid parts must not sink below the ground at rest.
- **footprint**: radius ≤ 50. The pilot's route ring and collision radius are fixed, so wider bodies clip the pilot.
- **boarding**: the cockpit centre must stay within 6 of height 60 and its front within 6 of y −17.5. The ladder and seat choreography in `motion/world.ts` is authored for that cockpit and is not yet parameterised.
- **rig / occlusion / gait**: walk and run sweeps at eight headings plus turning in place, with finite geometry, no occlusion diagnostics or unresolved surfaces, and planted feet that never slide.
- A full exit and reboard must finish.
- **performance**: fragments ≤ 260 and occlusion pair checks ≤ 30,000 for the Mech alone. The standard peaks at 171 / 17,904. Each semantic block adds ten faces; use `"surfaces": false` on small parts.

`--quick` samples fewer poses; `--json` prints the full report including metrics.

## Seeing it: `npm run look`

`npm run look -- --help` lists options. Typical uses:

```sh
npm run look                                        # every registered Mech
npm run look -- strider --gif --boarding            # + gait.gif, + every boarding stage
npm run look -- strider --compare HEAD              # what my uncommitted edit changed
npm run look -- strider --compare main              # what this branch changed
npm run look -- strider --headings 180,135 --gait none --zoom 5 --focus 16 --cell 300x320 --guides
```

Outputs go to `artifacts/look/<id>/`:

- `sheet.png`: turnaround, gait filmstrip, optional boarding; labelled, with a `mech:check` summary in the header.
- `report.json`: check results, per-pose diagnostics and the output list.
- `compare.png` and `before.png`: the changed poses, largest first, as before/after/difference columns.
- `gait.gif`: for humans.

The renderer replays the game's own `drawRig`/`drawGround` calls on a Node canvas. Against a Phaser capture of the same pose, 0.03% of pixels differ. `--compare` rebuilds the simulation and rig code from the git ref, so it measures geometry and motion changes, not drawing-code changes. The browser remains the final check (`npm run test:browser`, capture scripts, MCP screenshots).

## Live in the browser

`npm run dev`, then `/?lab`. The design selector lists registered Mechs; drafts are marked. Automation (development only):

```js
window.rigLab.listMechs();
window.rigLab.previewMech(specObjectOrJsonText); // validate + register in this tab, then select
window.rigLab.selectMech("strider");
window.rigLab.checkMech(); // same report as mech:check --quick
window.rigLab.inspect().mech;
```

Editing a registered spec file hot-reloads through Vite.

`.mcp.json` registers two browser MCP servers through `scripts/mcp/browser-mcp.mjs`. Both run the pinned devDependencies headless on the test Chromium, with software WebGL.

- **`playwright`**: navigate, click, evaluate (`browser_evaluate` with `window.rigLab`) and screenshot.
- **`chrome-devtools`**: console, network, performance traces. Open a page with `new_page`, then pass its `pageId`. Usage statistics and CrUX lookups are disabled.

`.claude/settings.json` enables both for Claude Code.

## Pitfalls that look shows

- **Joint-frame offsets are world-aligned**: a block "below the knee" floats in front of a sloped shin. Use bone frames.
- **Limb parts use one representative depth per slice**: a plate on a foreshortened limb must stand off about 5–6 units, or neighbouring slices draw over it. Head-on, foreshortened limbs can still hide it.
- **Turret height and leg length interact**: raising `hipHeight` without `turret.height` sinks the torso into the pelvis; mech:check's boarding interface catches cockpits that move.
