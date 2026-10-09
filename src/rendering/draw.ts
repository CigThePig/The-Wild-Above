import type Phaser from "phaser";
import type { Geometry } from "./geometry";
import { project } from "./geometry";
export function drawRig(
  g: Phaser.GameObjects.Graphics,
  rig: Geometry,
  guides: boolean,
  selected: string,
) {
  g.clear();
  for (const s of rig.shapes) {
    g.fillStyle(s.color, s.alpha);
    g.beginPath();
    s.points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fillPath();
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
