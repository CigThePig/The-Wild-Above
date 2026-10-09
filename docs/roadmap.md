# Next milestones

1. **Animation parity and occlusion:** compare longer runs/turns and each boarding stage against the supplied prototype; fix broad torso/shoulder overlaps using explicit geometry splitting where the captures justify it. Fully type the retained motion classes and remove unused range combat code.
2. **Real Android validation:** profile a representative midrange phone, touch cancellation/multitouch, heat, orientation and cutouts. Canvas runs at CSS-pixel resolution as a deliberate GPU budget cap; measure whether selective high-DPI scaling is worth it. FPS shown in emulation is not device certification.
3. **Stronger rig data:** full local transforms, geometric constraints, configurable dimensions and a second mech variant. Human-approved silhouettes; retain named joints and independent geometry.
4. **Boarding robustness:** interruption/cancel states, obstructed approach paths and world collisions. Consider XState when branching complexity warrants it.
5. **First expedition slice:** small outdoor map, one readable enemy, mobile targeting and one combat loop. Use Phaser physics where needed; do not build a physics engine.
6. **New anatomy:** one quadruped contact controller to test the rig contracts before generalizing further. Capacitor packaging follows device measurements and a meaningful playable slice.
