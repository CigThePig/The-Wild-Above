# Next milestones

1. **Animation parity and occlusion:** motion typing, unused code removal, longer replay/turn checks and boarding review fixes are complete. Phase 1 semantic torso/shoulder geometry and local depth resolution are complete; remaining silhouette approximations need targeted evidence before further migration.
2. **Real Android validation:** profile a representative midrange phone, touch cancellation/multitouch, heat, orientation and cutouts. Canvas runs at CSS-pixel resolution as a deliberate GPU budget cap; measure whether selective high-DPI scaling is worth it. FPS shown in emulation is not device certification.
3. **Stronger rig data:** full local transforms, geometric constraints, configurable dimensions and a second mech variant. Human-approved silhouettes; retain named joints and independent geometry.
4. **Boarding robustness:** interruption/cancel states, obstructed approach paths and world collisions. Consider XState when branching complexity warrants it.
5. **First expedition slice:** small outdoor map, one readable enemy, mobile targeting and one combat loop. Use Phaser physics where needed; do not build a physics engine.
6. **New anatomy:** one quadruped contact controller to test the rig contracts before generalizing further. Capacitor packaging follows device measurements and a meaningful playable slice.

## Phase 1

Completed: semantic octagonal block faces for torso/shoulders and adjacent rigid Mech components; camera-facing culling; actual planar overlap depth comparisons; bounded crossing splits and cyclic visible-region resolution; stable source IDs; machine-readable surface/fragment diagnostics and development overlays. See animation/semantic-surfaces.md and evidence/surface-review.md.

Remaining: physical Android profiling and multiple-actor workload measurements; true volumetric limb geometry only if an observed defect warrants it; exact transparency ordering for more complex overlapping transparent artwork. The human rig, IK, gameplay and recording formats are preserved. This system is local actor rendering, not a general world depth buffer.
