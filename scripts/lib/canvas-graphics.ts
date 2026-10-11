import type { SKRSContext2D } from "@napi-rs/canvas";
import type { RigCanvas } from "../../src/rendering/draw";

/** Projected world point at the centre of a viewport, and its zoom. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
const css = (color: number, alpha = 1) =>
  `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;

/**
 * Phaser Graphics calls replayed on a Node canvas, in the same projected
 * world coordinates, so drawRig/drawGround render identically off-browser.
 */
export class CanvasGraphics implements RigCanvas {
  private fillCss = css(0xffffff);
  private opaque = true;
  constructor(
    private ctx: SKRSContext2D,
    private camera: Camera,
    viewport: { x: number; y: number; width: number; height: number },
  ) {
    const { zoom } = camera;
    ctx.setTransform(
      zoom,
      0,
      0,
      zoom,
      viewport.x + viewport.width / 2 - camera.x * zoom,
      viewport.y + viewport.height / 2 - camera.y * zoom,
    );
    ctx.lineJoin = "round";
  }
  clear() {}
  fillStyle(color: number, alpha = 1) {
    this.fillCss = css(color, alpha);
    this.opaque = alpha >= 1;
    this.ctx.fillStyle = this.fillCss;
  }
  lineStyle(width: number, color: number, alpha = 1) {
    this.ctx.lineWidth = width;
    this.ctx.strokeStyle = css(color, alpha);
  }
  beginPath() {
    this.ctx.beginPath();
  }
  moveTo(x: number, y: number) {
    this.ctx.moveTo(x, y);
  }
  lineTo(x: number, y: number) {
    this.ctx.lineTo(x, y);
  }
  closePath() {
    this.ctx.closePath();
  }
  fillPath() {
    this.ctx.fill();
    // Canvas anti-aliasing leaves hairline gaps where clipped fragments share
    // an edge; Phaser's triangulated fills do not. A same-colour hairline
    // closes them. Translucent fills skip it to avoid doubled alpha.
    if (this.opaque) {
      const { strokeStyle, lineWidth } = this.ctx;
      this.ctx.strokeStyle = this.fillCss;
      this.ctx.lineWidth = 1.2 / this.camera.zoom;
      this.ctx.stroke();
      this.ctx.strokeStyle = strokeStyle;
      this.ctx.lineWidth = lineWidth;
    }
  }
  strokePath() {
    this.ctx.stroke();
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }
  fillCircle(x: number, y: number, radius: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }
  strokeCircle(x: number, y: number, radius: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }
  strokeRect(x: number, y: number, width: number, height: number) {
    this.ctx.strokeRect(x, y, width, height);
  }
}
