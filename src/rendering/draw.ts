import type Phaser from "phaser";
import type { Geometry } from "./geometry";
import { project } from "./geometry";
export function drawRig(
  g: Phaser.GameObjects.Graphics,
  rig: Geometry,
  guides: boolean,
  selected: string,
  surfaceGuides = false,
  selectedSurface = "",
) {
  g.clear();
  for (const s of rig.shapes) {
    g.fillStyle(s.color, s.alpha);
    g.beginPath();
    s.points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fillPath();
  }
  if (surfaceGuides || selectedSurface) {
    const outline = (
      points: { x: number; y: number }[],
      color: number,
      alpha: number,
    ) => {
      if (points.length < 3) return;
      g.lineStyle(0.35, color, alpha);
      g.beginPath();
      points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.strokePath();
    };
    for (const s of rig.surfaces)
      if (surfaceGuides || s.id === selectedSurface) {
        outline(
          s.points,
          s.culled ? 0xeb7070 : 0x79dfb9,
          s.id === selectedSurface ? 1 : 0.35,
        );
        if (s.id === selectedSurface) {
          for (const f of rig.occlusion.fragments.filter(
            (f) => f.source === s.id,
          ))
            outline(f.points, 0xffd175, 1);
          const center = s.world.reduce(
            (a, p) => ({
              x: a.x + p.x / s.world.length,
              y: a.y + p.y / s.world.length,
              z: a.z + p.z / s.world.length,
            }),
            { x: 0, y: 0, z: 0 },
          );
          const a = project(center),
            b = project({
              x: center.x + s.normal.x * 8,
              y: center.y + s.normal.y * 8,
              z: center.z + s.normal.z * 8,
            });
          g.lineStyle(0.6, 0xffd175);
          g.lineBetween(a.x, a.y, b.x, b.y);
        }
      }
  }
  if (guides)
    for (const c of rig.components.filter(
      (c) => c.kind === "joint" && c.visible,
    )) {
      const p = project(c.world),
        parent = rig.components.find((r) => r.id === c.parent);
      if (parent?.kind === "joint") {
        const q = project(parent.world);
        g.lineStyle(0.5, 0x7ce7cf, 0.8);
        g.lineBetween(p.x, p.y, q.x, q.y);
      }
      g.fillStyle(c.contact ? 0xecc87b : 0x83e9d1);
      g.fillCircle(p.x, p.y, 0.9);
    }
  const c = rig.components.find((c) => c.id === selected);
  if (c) {
    const p = project(c.world);
    g.lineStyle(0.7, 0xffd175);
    g.strokeCircle(p.x, p.y, 2);
    if (c.bounds) {
      const b = c.bounds;
      g.strokeRect(b.x, b.y, b.width, b.height);
    }
  }
}
