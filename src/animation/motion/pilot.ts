import { FIELD, separatePilot } from "./boarding";
import type { PilotActor, MechActor, Tuning, Input, Vec, Foot } from "../types";
import { vec, rot, clamp, damping, angle, lerp, smooth } from "./math";
interface PilotFoot extends Foot {
  stance: boolean;
  start?: Vec;
}
function knee(hip: Vec, foot: Vec, forward: Vec) {
  const v = vec(foot.x - hip.x, foot.y - hip.y, foot.z - hip.z),
    raw = Math.hypot(v.x, v.y, v.z),
    d = clamp(raw, 0.1, 19.49),
    n = vec(v.x / (raw || 1), v.y / (raw || 1), v.z / (raw || 1)),
    along = (9.5 ** 2 - 10 ** 2 + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, 9.5 ** 2 - along * along));
  const dot = forward.x * n.x + forward.y * n.y;
  const b = vec(forward.x - n.x * dot, forward.y - n.y * dot, -n.z * dot),
    bl = Math.hypot(b.x, b.y, b.z) || 1;
  return vec(
    hip.x + n.x * along + (b.x / bl) * height,
    hip.y + n.y * along + (b.y / bl) * height,
    hip.z + n.z * along + (b.z / bl) * height,
  );
}
export class Pilot implements PilotActor {
  x = 0;
  y = 0;
  yaw = 2.7;
  vx = 0;
  vy = 0;
  speed = 0;
  phase = 0;
  lift = 0;
  climbing = 0;
  crouch = 0;
  visible = 1;
  contacts: PilotActor["contacts"] = null;
  feet: PilotFoot[] = [];
  tuning: Tuning = { speed: 1, stride: 1, stepHeight: 1, bob: 1 };
  constructor() {
    this.tuning = { speed: 1, stride: 1, stepHeight: 1, bob: 1 };
    this.place(0, 0, 2.7);
  }
  place(x: number, y: number, yaw: number) {
    this.x = x;
    this.y = y;
    this.yaw = yaw;
    this.vx = this.vy = this.speed = 0;
    this.phase = 0;
    this.lift = 0;
    this.climbing = 0;
    this.crouch = 0;
    this.visible = 1;
    this.contacts = null;
    this.feet = [-1, 1].map((side) => {
      const o = rot(side * 3.2, 0, yaw);
      return { side, p: vec(x + o.x, y + o.y, 1), yaw, stance: true };
    });
  }
  update(dt: number, input: Input, mech: MechActor) {
    dt = Math.min(dt, 1 / 30);
    this.contacts = null;
    let x = input.x || 0,
      y = input.y || 0;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    const rate = (input.fast ? 72 : 52) * this.tuning.speed;
    this.vx += (x * rate - this.vx) * damping(m ? 12 : 18, dt);
    this.vy += (y * rate - this.vy) * damping(m ? 12 : 18, dt);
    const oldx = this.x,
      oldy = this.y;
    this.x = clamp(this.x + this.vx * dt, FIELD.minX, FIELD.maxX);
    this.y = clamp(this.y + this.vy * dt, FIELD.minY, FIELD.maxY);
    const resolved = separatePilot(
      vec(this.x, this.y),
      vec(oldx, oldy),
      vec(mech.x, mech.y),
    );
    this.x = resolved.x;
    this.y = resolved.y;
    this.speed = Math.hypot(this.x - oldx, this.y - oldy) / dt;
    const target =
      this.speed > 1
        ? Math.atan2(this.vx, -this.vy)
        : input.turn
          ? this.yaw + input.turn * dt * 3.5
          : input.aim
            ? input.aimYaw
            : this.yaw;
    this.yaw += clamp(angle(this.yaw, target), -7 * dt, 7 * dt);
    const moving = this.speed > 1;
    this.phase += dt * (input.fast ? 3.8 : 3.1) * (moving ? 1 : 0);
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i],
        u = (this.phase + i * 0.5) % 1,
        off = rot(f.side * 3.2, 0, this.yaw),
        desired = vec(this.x + off.x, this.y + off.y, 1);
      if (!moving) {
        f.p = lerp(f.p, desired, damping(15, dt));
        f.stance = true;
        f.yaw = this.yaw;
        continue;
      }
      // Brief stance locks a foot in world space; recovery lifts it behind the hip.
      const stance = u < 0.36;
      if (stance) {
        if (!f.stance || Math.hypot(f.p.x - this.x, f.p.y - this.y) > 11) {
          const lead = 0.065 * this.tuning.stride;
          f.p = vec(desired.x + this.vx * lead, desired.y + this.vy * lead, 1);
          f.yaw = this.yaw;
        }
        f.stance = true;
      } else {
        if (f.stance) f.start = { ...f.p };
        f.stance = false;
        const t = (u - 0.36) / 0.64,
          target = vec(
            desired.x + this.vx * 0.065 * this.tuning.stride,
            desired.y + this.vy * 0.065 * this.tuning.stride,
            1,
          );
        f.p = lerp(f.start || f.p, target, smooth(t));
        f.p.z = 1 + Math.sin(Math.PI * t) * 2.5 * this.tuning.stepHeight;
        f.yaw = this.yaw;
      }
    }
  }
  pose() {
    let z =
      19.1 +
      (this.speed > 1
        ? Math.sin(this.phase * Math.PI * 4) * 0.55 * this.tuning.bob
        : 0) +
      this.lift -
      this.crouch;
    const positions = this.contacts?.feet || this.feet.map((f) => f.p),
      forward = rot(0, -1, this.yaw);
    // Human proportions: narrow hips, almost extended support knee, no mech squat.
    for (let i = 0; i < 2; i++) {
      const o = rot(this.feet[i].side * 3.2, 0, this.yaw),
        f = positions[i],
        horizontal = Math.hypot(this.x + o.x - f.x, this.y + o.y - f.y);
      z = Math.min(
        z,
        f.z + Math.sqrt(Math.max(1, 19.3 ** 2 - horizontal ** 2)),
      );
    }
    const base = vec(this.x, this.y, z),
      legs = this.feet.map((f, i) => {
        const o = rot(f.side * 3.2, 0, this.yaw),
          hip = vec(this.x + o.x, this.y + o.y, z),
          foot = positions[i];
        return { hip, knee: knee(hip, foot, forward), f: { ...f, p: foot } };
      });
    return { base, legs };
  }
}
