# Semantic surfaces and local occlusion

Motion still supplies world positions, IK, heading and boarding state. It has no triangulation or drawing-order dependency. `buildRig` creates stable logical components; `Geometry.surfaceBlock` extrudes the same octagonal footprint used by `block`. Torso, both shoulder armour blocks, pack, cockpit housing, pelvis and barrel use these faces. The related rigid parts were included because a mean-depth housing/pack can incorrectly cover the new torso faces. Boots, knees, limb slices, pilot and hook retain their existing artwork and approximate depth models.

## Geometry and coordinates

+x is right, +y south, +z up. Heading zero points north. Body/pelvis uses body yaw; upper body, armour and attached tools use turret yaw. Surface transforms follow those existing choices, including lean/bob, without altering motion or recordings.

Projection is `(x, .72*y - .694*z)` and depth is `.694*y + .72*z`. Larger depth is closer to the viewer. The camera direction toward the viewer is `(0, .694, .72)`. These constants are almost, but not exactly, a unit rotation: inverse projection and plane depth use `k=.72²+.694²` explicitly.

The footprint's outward winding yields ten faces: top, bottom, front, rear, left, right and four actual corner bevels. Side faces use the original body colour; the top uses the original cap colour. There are no new edge strokes, panels or highlights. Each `Surface` retains its component ID, world/projected vertices, outward unit normal, affine projected depth plane, material/alpha, facing dot product, culling state, overlap/occluder IDs, fragment IDs and diagnostics. Projected coordinates are independent of Phaser. `Fragment.source` points to the surface or legacy primitive; fragments never become logical components.

Applicable faces are culled when their outward normal faces away from the viewer or projected area is at most `1e-8` square world-projection units. An edge-on face shrinks continuously. Explicit `doubleSided` support exists for planar sheets. Nonplanar or invalid surfaces are rejected with diagnostics, rather than pretending their plane is exact. Legacy artwork bypasses backface culling entirely.

## Resolution

1. Reject pairs using projected bounds. Convex separation tests cheaply reject false bounds overlaps. Convex overlap clipping is needed when the depth relationship might change within the overlap.
2. Compare the two affine depth planes over that actual overlap. Linear depth differences attain their extrema at overlap vertices. Record consistently ordered, coplanar or crossing relationships. Depth tolerances are `1e-7` world-depth units, for numerical near-coincidence only; they are not anatomical biases.
3. Split crossing sources at the zero-depth-difference line. All resulting patches retain source identity and winding. Deterministic fragment suffixes describe the current decomposition; the same input gives the same IDs, but topology changes can change fragment suffixes across frames. Source IDs remain stable across rotation.
4. Establish overlap constraints between the fragments and topologically order them. Disjoint fragments use depth then codepoint ID as deterministic queue priority; that priority never replaces an overlap constraint. Coplanar ties put the lexically larger source ID in front. Opaque overdraw is allowed in this fast path, just as ordinary painter rendering allows it; same-source patches do not overlap in area.
5. A genuine cyclic order uses the same local geometry to subtract only regions covered by nearer opaque sources. Subtracting a convex region emits disjoint convex pieces, so even three-way cycles are resolved without recursion or a global BSP. Transparent composition also uses this path: clip faded artwork by nearer opaque coverage, then composite its surviving regions over opaque artwork. Transparent legacy-to-legacy ordering remains approximate.

The hook's existing concave silhouette is deterministically decomposed into ears for overlap operations; this does not alter its silhouette or make its representative depth physically exact. An uncut hook is still submitted as its original polygon. Relationships across separate patches are combined before splitting/order resolution.

Phaser 4 defaults to simplifying paths within one screen pixel. Rendering explicitly sets `pathDetailThreshold: 0`: simplification can independently discard a shared fragment vertex and open a visible seam. This keeps the exact resolved paths without inflating polygons or adding strokes.

Clipping shares the crossing coordinates between half-planes, removes adjacent duplicate points and drops zero-area pieces. Near-coplanar overlap gets a stable tie. No alpha fades repair opaque order errors. Per-source splitting is capped at 128 patches; the ordering path also caps total patches at 1,024 before falling back. Exhausting the clipping budget produces `unresolved` and a diagnostic. The actor has a fixed, small source count; this is not an unbounded scene renderer. Arbitrary self-intersecting polygons/holes, general concave semantic solids and exact transparent-solid intersections are outside its contract.

`status: visible` means a surface remains drawable after facing analysis/resolution. The fast ordering path can submit a fully covered surface; this flag is not a per-pixel visibility query. In the subtraction path, `hidden` means no region survives. Component `visible` and `opacity` continue to describe animation suppression/fades. Do not infer pixel coverage from either flag.

## Explicit approximations and art exception

Limb slices and other unmigrated silhouettes still use constant representative depth, not reconstructed volumetric planes. Decisions involving them expose `approximate: true`. Their existing limb-to-limb painter order is retained. Geometric clipping/order can improve their relationship to a torso face, but cannot prove anatomical depth at every point of a slice.

The cockpit canopy retains its continuous heading-dependent width collapse and legacy +15 depth bias. That existing artistic treatment is listed by `inspectOcclusion().exceptions`, with its component and rationale. It is localized to the hatch and testable through existing rotation/boarding controls. Its housing is geometric; its styled sheet is intentionally approximate. Pilot fades retain their existing staged transfer behaviour. No recording/configuration format changed.

## Adding a component

Create its logical `Component` with a stable ID and correct parent. Use `surfaceBlock` for this convex octagonal extrusion, or `makeSurface` for a convex, planar, consistently wound world-space face. Preserve the ID relationship; let `Geometry.finish` resolve it. Do not place heading thresholds in `drawRig`, alter IK to change layer order, or give fragments component identities. Test normals, planarity, projected depth and replay first, then inspect actual neighbouring browser frames. A genuinely different anatomy should drive later generalization.

## Inspection and evidence

See [Rig Lab](../ai-workflow/rig-lab.md) for APIs and [Phase 1 evidence](../evidence/surface-review.md) for captures/performance. Geometry generation, resolver and total rig submission timings are measured independently; resolver statistics include surfaces, legacy primitives, fragments, pair comparisons and draw vertices. Timings describe browser CPU submission, not GPU execution or physical Android performance.
