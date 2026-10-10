import { FIELD } from "./boarding";
import type { MechActor, Tuning, Input, Vec, Foot } from "../types";
import { STANDARD, type MechSpec } from "../../mechs";
import { vec, rotate, add, mix, damping, clamp, angle, solveLeg } from "./math";
interface MechFoot extends Foot {
  swing: boolean;
  t: number;
  duration: number;
  start: Vec | null;
  target: Vec | null;
  startYaw: number;
  targetYaw: number;
  desired: Vec;
}
export class Mech implements MechActor {
  // Private so snapshots (JSON) hold motion state, not the whole design.
  readonly #spec: MechSpec;
  x = 0;
  y = 90;
  vx = 0;
  vy = 0;
  yaw = 2.7;
  turret = 2.7;
  recoil = 0;
  land = 0;
  speed = 0;
  next = 0;
  shift = 0;
  hatch = 0;
  lean = vec();
  tuning: Tuning = { speed: 1, stride: 1, stepHeight: 1, bob: 1 };
  feet: MechFoot[] = [];
  constructor(spec: MechSpec = STANDARD) {
    this.#spec = spec;
    this.reset();
  }
  get spec() {
    return this.#spec;
  }
  reset() {
    this.tuning = { speed: 1, stride: 1, stepHeight: 1, bob: 1 };
    this.x = 0;
    this.y = 90;
    this.vx = 0;
    this.vy = 0;
    this.yaw = 2.7;
    this.turret = 2.7;
    this.recoil = 0;
    this.land = 0;
    this.speed = 0;
    this.next = 0;
    this.shift = 0;
    this.hatch = 0;
    this.lean = vec();
    const { stance, ankleHeight } = this.spec.legs;
    this.feet = [-1, 1].map((side) => {
      const p = rotate(
        vec(side * stance.width, stance.forward, ankleHeight),
        this.yaw,
      );
      return {
        side,
        p: add(vec(this.x, this.y, 0), p),
        yaw: this.yaw,
        start: null,
        startYaw: this.yaw,
        targetYaw: this.yaw,
        desired: { ...p },
        target: null,
        t: 0,
        duration: 0.22,
        swing: false,
      };
    });
  }
  update(dt: number, input: Input) {
    dt = Math.min(dt, 1 / 30);
    const { legs, gait } = this.spec;
    let ix = input.x || 0,
      iy = input.y || 0,
      m = Math.hypot(ix, iy);
    if (m > 1) {
      ix /= m;
      iy /= m;
      m = 1;
    }
    const rate =
      (input.fast ? gait.runSpeed : gait.walkSpeed) * this.tuning.speed;
    const oldvx = this.vx,
      oldvy = this.vy;
    this.vx = mix(this.vx, ix * rate, damping(m ? 7 : 10, dt));
    this.vy = mix(this.vy, iy * rate, damping(m ? 7 : 10, dt));
    if (m < 0.01 && Math.hypot(this.vx, this.vy) < 0.15) this.vx = this.vy = 0;
    this.x = clamp(this.x + this.vx * dt, FIELD.minX, FIELD.maxX);
    this.y = clamp(this.y + this.vy * dt, FIELD.minY, FIELD.maxY);
    this.speed = Math.hypot(this.vx, this.vy);
    let desired = this.yaw;
    if (this.speed > 2) desired = Math.atan2(this.vx, -this.vy);
    else if (input.turn) desired += input.turn * dt * 1.6;
    else if (input.aim && Math.abs(angle(this.yaw, input.aimYaw)) > 0.95)
      desired = input.aimYaw - clamp(angle(this.yaw, input.aimYaw), -0.7, 0.7);
    this.yaw += clamp(
      angle(this.yaw, desired),
      -gait.turnRate * dt,
      gait.turnRate * dt,
    );
    const targetTurret = input.aim
      ? this.yaw + clamp(angle(this.yaw, input.aimYaw), -1.15, 1.15)
      : this.yaw;
    this.turret += angle(this.turret, targetTurret) * damping(11, dt);
    this.recoil *= Math.exp(-15 * dt);
    this.land *= Math.exp(-13 * dt);
    this.lean.x = mix(
      this.lean.x,
      clamp(((this.vx - oldvx) / dt) * 0.008, -1.8, 1.8),
      damping(8, dt),
    );
    this.lean.y = mix(
      this.lean.y,
      clamp(((this.vy - oldvy) / dt) * 0.008, -1.8, 1.8),
      damping(8, dt),
    );
    let active = false;
    for (const f of this.feet) {
      if (!f.swing) continue;
      active = true;
      if (!f.start || !f.target) throw Error("Swing foot has no endpoints");
      f.t += dt / f.duration;
      const u = clamp(f.t, 0, 1),
        t = u * u * (3 - 2 * u);
      f.p = vec(
        mix(f.start.x, f.target.x, t),
        mix(f.start.y, f.target.y, t),
        legs.ankleHeight +
          legs.stepLift * this.tuning.stepHeight * Math.sin(Math.PI * u) ** 2,
      );
      f.yaw = f.startYaw + angle(f.startYaw, f.targetYaw) * t;
      if (u >= 1) {
        f.p = vec(f.target.x, f.target.y, legs.ankleHeight);
        f.swing = false;
        this.land = 0.8;
      }
    }
    if (!active) {
      let best = -1,
        score = 0;
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i],
          off = rotate(
            vec(
              f.side * legs.stance.width,
              legs.stance.forward,
              legs.ankleHeight,
            ),
            this.yaw,
          );
        f.desired = vec(
          this.x + off.x + this.vx * 0.19 * this.tuning.stride,
          this.y + off.y + this.vy * 0.19 * this.tuning.stride,
          legs.ankleHeight,
        );
        const dist = Math.hypot(f.desired.x - f.p.x, f.desired.y - f.p.y),
          yawError = Math.abs(angle(f.yaw, this.yaw));
        const priority =
          dist +
          (yawError > 0.28 ? yawError * 21 : 0) +
          (i === this.next ? 1 : 0);
        const limit = this.speed > 4 ? 9 : 4.5;
        if (priority > limit && priority > score) {
          score = priority;
          best = i;
        }
      }
      if (best >= 0) {
        const f = this.feet[best];
        f.swing = true;
        f.start = { ...f.p };
        f.target = { ...f.desired };
        f.startYaw = f.yaw;
        f.targetYaw = this.yaw;
        f.t = 0;
        f.duration =
          this.speed > gait.runStepAbove
            ? gait.runStepDuration
            : gait.stepDuration;
        this.next = 1 - best;
      }
    }
    const support = this.feet.find((f) => !f.swing) || this.feet[0];
    this.shift = mix(
      this.shift || 0,
      support.side * (this.feet.some((f) => f.swing) ? 1.4 : 0),
      damping(9, dt),
    );
  }
  pose() {
    const { legs, gait } = this.spec,
      reach = legs.thigh + legs.shin - 0.5;
    const swing = this.feet.find((f) => f.swing),
      bob =
        (swing ? Math.sin(swing.t * Math.PI) * gait.bob * this.tuning.bob : 0) -
        this.land * gait.landDip;
    const base = vec(this.x, this.y, legs.hipHeight + bob);
    for (const f of this.feet) {
      const off = rotate(vec(f.side * legs.hipWidth, 0, 0), this.yaw),
        horizontal = Math.hypot(this.x + off.x - f.p.x, this.y + off.y - f.p.y);
      base.z = Math.min(
        base.z,
        f.p.z + Math.sqrt(Math.max(1, reach ** 2 - horizontal ** 2)),
      );
    }
    const local = (x: number, y: number, z: number, yaw = this.yaw) =>
      add(base, rotate(vec(x, y, z), yaw));
    const forward = rotate(vec(0, -1, 0), this.yaw);
    return {
      base,
      local,
      forward,
      legs: this.feet.map((f) => {
        const hip = local(f.side * legs.hipWidth, 0, 0);
        return {
          f,
          hip,
          ...solveLeg(hip, f.p, forward, legs.thigh, legs.shin),
        };
      }),
      bob,
    };
  }
}
