import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import pixelmatch from "pixelmatch";
import gifenc from "gifenc";
import { drawGround, drawRig } from "../../src/rendering/draw";
import { project, type Geometry } from "../../src/rendering/geometry";
import type { RigConfig } from "../../src/animation/config";
import type { Placement, Simulation } from "../../src/animation/simulation";
import { CanvasGraphics, type Camera } from "./canvas-graphics";
import { simulate, type Design, type Engine } from "./engine";

export const BACKGROUND = "#263934";
const LABEL = 18;

/** A deterministic state to render: configuration, then fixed-tick steps. */
export interface Pose {
  group: string;
  label: string;
  patch: Partial<RigConfig>;
  run: (s: Simulation) => void;
  /** false: gameplay view with pilot and ladder during boarding. */
  isolated: boolean;
  placement?: Placement;
}
export interface Shot {
  pose: Pose;
  rig: Geometry;
  center: { x: number; y: number };
  issues: string[];
}
export interface DrawOptions {
  guides: boolean;
  surfaces: boolean;
}

export function shoot(engine: Engine, design: Design, pose: Pose): Shot {
  const s = simulate(engine, design, pose.patch, pose.placement);
  pose.run(s);
  const rig = engine.rig.buildRig(s.world, s.config, pose.isolated);
  // Follow the Mech like Rig Lab: centre on its body, 40 units up.
  const c = project({ x: s.world.mech.x, y: s.world.mech.y, z: 40 });
  const issues = [
    ...rig.components.flatMap((k) => k.issues.map((i) => `${k.id}: ${i}`)),
    ...rig.occlusion.diagnostics,
  ];
  return { pose, rig, center: { x: c.x, y: c.y }, issues };
}

/** One zoom for every cell, so proportions compare across poses and refs. */
export function fitZoom(
  shots: Shot[],
  cell: { w: number; h: number },
  max = 3.2,
) {
  let dx = 1,
    dy = 1;
  for (const s of shots)
    for (const shape of s.rig.shapes)
      if (shape.alpha > 0)
        for (const p of shape.points) {
          dx = Math.max(dx, Math.abs(p.x - s.center.x));
          dy = Math.max(dy, Math.abs(p.y - s.center.y));
        }
  return Math.min(max, (cell.w / 2 - 8) / dx, ((cell.h - LABEL) / 2 - 6) / dy);
}

export function drawCell(
  ctx: SKRSContext2D,
  shot: Shot,
  rect: { x: number; y: number; w: number; h: number },
  zoom: number,
  options: DrawOptions,
  label = shot.pose.label,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const camera: Camera = { ...shot.center, zoom };
  const g = new CanvasGraphics(ctx, camera, {
    x: rect.x,
    y: rect.y + LABEL,
    width: rect.w,
    height: rect.h - LABEL,
  });
  drawGround(g);
  drawRig(g, shot.rig, options.guides, "", options.surfaces, "");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#d6dfcb";
  ctx.fillText(label, rect.x + 6, rect.y + 13);
  if (shot.issues.length) {
    ctx.fillStyle = "#ffbb93";
    ctx.fillText(
      `! ${shot.issues.length} issue${shot.issues.length > 1 ? "s" : ""}`,
      rect.x + 6,
      rect.y + rect.h - 6,
    );
  }
  ctx.strokeStyle = "#52675a";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.restore();
}

export interface Section {
  title: string;
  shots: Shot[];
}
/** Labelled contact sheet: header lines, then one titled grid per section. */
export function sheet(
  header: string[],
  sections: Section[],
  cell: { w: number; h: number },
  cols: number,
  zoom: number,
  options: DrawOptions,
): Canvas {
  const headerH = 10 + header.length * 18,
    titleH = 24;
  const rows = sections.map((s) => Math.ceil(s.shots.length / cols));
  const height =
    headerH + sections.reduce((h, _, i) => h + titleH + rows[i] * cell.h, 0);
  const canvas = createCanvas(cols * cell.w, height),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#142925";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "14px sans-serif";
  header.forEach((line, i) => {
    ctx.fillStyle =
      i === 0 ? "#e9edd7" : line.startsWith("ERROR") ? "#ffbb93" : "#b8cbb3";
    ctx.fillText(line, 8, 20 + i * 18);
  });
  let y = headerH;
  sections.forEach((section, i) => {
    ctx.font = "13px sans-serif";
    ctx.fillStyle = "#cae5c4";
    ctx.fillText(section.title, 8, y + 17);
    y += titleH;
    section.shots.forEach((shot, j) =>
      drawCell(
        ctx,
        shot,
        {
          x: (j % cols) * cell.w,
          y: y + Math.floor(j / cols) * cell.h,
          w: cell.w,
          h: cell.h,
        },
        zoom,
        options,
      ),
    );
    y += rows[i] * cell.h;
  });
  return canvas;
}

/** Render one shot into its own canvas (for pixel comparison and GIF frames). */
export function cellCanvas(
  shot: Shot,
  cell: { w: number; h: number },
  zoom: number,
  options: DrawOptions,
  label?: string,
) {
  const canvas = createCanvas(cell.w, cell.h);
  drawCell(
    canvas.getContext("2d"),
    shot,
    { x: 0, y: 0, ...cell },
    zoom,
    options,
    label,
  );
  return canvas;
}

export function diffCanvas(a: Canvas, b: Canvas) {
  const { width, height } = a,
    out = createCanvas(width, height),
    ctx = out.getContext("2d");
  const diff = ctx.createImageData(width, height);
  const pixels = pixelmatch(
    a.getContext("2d").getImageData(0, 0, width, height).data,
    b.getContext("2d").getImageData(0, 0, width, height).data,
    diff.data,
    width,
    height,
    { threshold: 0.1 },
  );
  ctx.putImageData(diff, 0, 0);
  return { canvas: out, pixels };
}

export function gif(frames: Canvas[], delay: number) {
  const encoder = gifenc.GIFEncoder();
  for (const frame of frames) {
    const data = frame
      .getContext("2d")
      .getImageData(0, 0, frame.width, frame.height).data;
    const palette = gifenc.quantize(data, 64);
    encoder.writeFrame(
      gifenc.applyPalette(data, palette),
      frame.width,
      frame.height,
      { palette, delay },
    );
  }
  encoder.finish();
  return encoder.bytes();
}
