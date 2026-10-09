import type { World, Input, BoardingTransition, BoardingStage } from "../types";
import { boardingRoute, inField } from "./boarding";
import { Mech } from "./mech";
import { Pilot } from "./pilot";
import { vec, rot, clamp, angle, smooth, lerp } from "./math";
export class PilotWorld implements World {
  mech = new Mech();
  pilot = new Pilot();
  control: World["control"] = "mech";
  transition: BoardingTransition | null = null;
  time = 0;
  interactionFailure: string | null = null;
  reset() {
    this.mech.reset();
    this.time = 0;
    this.interactionFailure = null;
    this.pilot = new Pilot();
    this.control = "mech";
    this.transition = null;
    this.mech.hatch = 0;
  }
  get actor() {
    return this.control === "foot" ? this.pilot : this.mech;
  }
  get nearby() {
    return (
      Math.hypot(this.pilot.x - this.mech.x, this.pilot.y - this.mech.y) < 86
    );
  }
  local(x: number, y: number, z = 0, a = this.mech.turret) {
    const o = rot(x, y, a);
    return vec(this.mech.x + o.x, this.mech.y + o.y, z);
  }
  door() {
    // Keep preferred hatch directions, then use an inward diagonal at corners.
    const inward = Math.atan2(-this.mech.x, this.mech.y);
    for (const yaw of [
      this.mech.turret,
      this.mech.turret + Math.PI / 2,
      this.mech.turret - Math.PI / 2,
      this.mech.turret + Math.PI,
      inward,
    ]) {
      const p = this.local(0, -52, 0, yaw);
      if (inField(p, 5)) return p;
    }
    throw Error("No reachable hatch-side ground point");
  }
  interact() {
    if (this.transition || (this.control === "foot" && !this.nearby))
      return false;
    const ground = this.door(),
      yaw = Math.atan2(ground.x - this.mech.x, -(ground.y - this.mech.y));
    const tr: BoardingTransition = {
      exiting: this.control === "mech",
      stage: "park",
      t: 0,
      yaw,
      ground,
      path: [],
    };
    if (!tr.exiting && !this.route(tr)) {
      this.interactionFailure = "No clear boarding approach";
      return false;
    }
    this.interactionFailure = null;
    this.transition = tr;
    this.mech.vx = this.mech.vy = this.mech.speed = 0;
    return true;
  }
  route(tr: BoardingTransition): boolean {
    const path = boardingRoute(
      vec(this.pilot.x, this.pilot.y),
      tr.ground,
      vec(this.mech.x, this.mech.y),
    );
    if (!path) return false;
    tr.path = path;
    return true;
  }
  transferPose(u: number) {
    const p = this.pilot,
      g = this.mech,
      a = g.turret; // u=0 grounded, u=1 at hatch
    const root = this.local(0, -39 + u * 10, u * 32);
    p.x = root.x;
    p.y = root.y;
    p.yaw = a + Math.PI;
    p.lift = root.z;
    p.speed = 0;
    p.crouch = 0;
    p.climbing = 1;
    p.visible = 1;
    const rung = (side: number, height: number) =>
      this.local(side * 4, -36 + height * 0.2, height);
    const cycle = u * 4,
      step = Math.floor(cycle),
      part = smooth(cycle - step);
    const feet = [-1, 1].map((side, i) => {
      const active = step % 2 === i,
        level = active ? Math.max(0, (step - 1) * 8) : step * 8,
        target = (step + 1) * 8;
      return rung(
        side,
        Math.min(32, active ? level + (target - level) * part : level) + 1,
      );
    });
    // Each hand stays on its rung while the opposite hand reaches to the next.
    const hands = [-1, 1].map((side, i) => {
      const completed = Math.floor((step + 1 - i) / 2),
        level = 21 + i * 8 + completed * 16;
      return rung(
        side * 1.6,
        Math.min(53, level + (step % 2 === i ? part * 16 : 0)),
      );
    });
    p.contacts = { feet, hands };
  }
  update(dt: number, input: Input) {
    if (this.control === "mech" && !this.transition) {
      this.time += dt;
      this.mech.update(dt, input);
      this.mech.hatch = Math.max(0, this.mech.hatch - dt * 4);
      return;
    }
    const tr = this.transition;
    if (tr && tr.stage === "park") {
      this.mech.yaw += clamp(angle(this.mech.yaw, tr.yaw), -dt * 2.1, dt * 2.1);
    }
    this.time += dt;
    this.mech.update(dt, {});
    if (!tr) {
      this.pilot.update(dt, input, this.mech);
      this.mech.hatch = Math.max(0, this.mech.hatch - dt * 3);
      return;
    }
    tr.t += dt;
    const next = (stage: BoardingStage) => {
      tr.stage = stage;
      tr.t = 0;
    };
    const p = this.pilot;
    if (tr.stage === "park") {
      this.mech.turret = this.mech.yaw;
      if (
        Math.abs(angle(this.mech.yaw, tr.yaw)) < 0.02 &&
        !this.mech.feet.some((f) => f.swing)
      ) {
        this.mech.turret = tr.yaw;
        if (tr.exiting) {
          p.place(this.mech.x, this.mech.y, tr.yaw + Math.PI);
          p.visible = 0;
          next("open");
        } else {
          next("approach");
        }
      }
    } else if (tr.stage === "approach") {
      const target = tr.path[0],
        dx = target.x - p.x,
        dy = target.y - p.y,
        d = Math.hypot(dx, dy);
      if (d < 2) {
        tr.path.shift();
        if (!tr.path.length) {
          p.place(tr.ground.x, tr.ground.y, tr.yaw + Math.PI);
          next("open");
        }
      } else p.update(dt, { x: dx / d, y: dy / d }, this.mech);
    } else if (tr.stage === "open") {
      this.mech.hatch = smooth(tr.t / 0.4);
      if (tr.t >= 0.4) next(tr.exiting ? "emerge" : "step");
    } else if (tr.stage === "step") {
      const q = this.local(0, -39),
        dx = q.x - p.x,
        dy = q.y - p.y,
        d = Math.hypot(dx, dy);
      p.update(
        dt,
        { x: dx / Math.max(d, 3), y: dy / Math.max(d, 3) },
        this.mech,
      );
      if (d < 1.5) {
        p.place(q.x, q.y, tr.yaw + Math.PI);
        next("climb");
      }
    } else if (tr.stage === "climb") {
      this.transferPose(clamp(tr.t / 1.6, 0, 1));
      if (tr.t >= 1.6) next("seat");
    } else if (tr.stage === "seat" || tr.stage === "emerge") {
      const q = smooth(tr.t / 0.5),
        u = tr.stage === "seat" ? q : 1 - q;
      this.transferPose(1);
      const root = lerp(this.local(0, -29, 32), this.local(0, -12, 32), u);
      p.x = root.x;
      p.y = root.y;
      p.crouch = u * 7;
      p.visible = 1 - smooth((u - 0.45) / 0.55);
      if (tr.t >= 0.5) {
        if (tr.stage === "seat") next("close");
        else next("descend");
      }
    } else if (tr.stage === "descend") {
      this.transferPose(1 - clamp(tr.t / 1.6, 0, 1));
      if (tr.t >= 1.6) {
        const q = this.local(0, -39);
        p.place(q.x, q.y, tr.yaw + Math.PI);
        next("land");
      }
    } else if (tr.stage === "land") {
      const dx = tr.ground.x - p.x,
        dy = tr.ground.y - p.y,
        d = Math.hypot(dx, dy);
      p.update(
        dt,
        { x: dx / Math.max(d, 3), y: dy / Math.max(d, 3) },
        this.mech,
      );
      p.crouch = Math.max(0, 1 - tr.t * 4);
      if (d < 1.5) {
        p.place(tr.ground.x, tr.ground.y, tr.yaw);
        next("close");
      }
    } else if (tr.stage === "close") {
      this.mech.hatch = 1 - smooth(tr.t / 0.4);
      if (tr.t >= 0.4) {
        this.control = tr.exiting ? "foot" : "mech";
        this.transition = null;
        p.contacts = null;
        p.crouch = 0;
        p.lift = 0;
        p.visible = 1;
      }
    }
  }
}
