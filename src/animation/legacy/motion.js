// Migrated from the creator-provided prototype. See docs/animation/migration.md.
const TAU = Math.PI * 2,
  clamp = (x, a, b) => Math.max(a, Math.min(b, x)),
  mix = (a, b, t) => a + (b - a) * t;
const damping = (k, dt) => 1 - Math.exp(-k * dt),
  angle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const vec = (x = 0, y = 0, z = 0) => ({ x, y, z }),
  add = (a, b) => vec(a.x + b.x, a.y + b.y, a.z + b.z),
  sub = (a, b) => vec(a.x - b.x, a.y - b.y, a.z - b.z),
  mul = (a, k) => vec(a.x * k, a.y * k, a.z * k),
  dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z),
  norm = (a) => mul(a, 1 / (len(a) || 1)),
  cross = (a, b) =>
    vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
function rotate(p, yaw) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return vec(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}
function color(hex, k) {
  let n = parseInt(hex.slice(1), 16);
  return (
    "#" +
    [n >> 16, (n >> 8) & 255, n & 255]
      .map((v) =>
        Math.round(clamp(v * k, 0, 255))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function solveLeg(hip, foot, forward) {
  const dvec = sub(foot, hip),
    raw = len(dvec),
    d = clamp(raw, 0.01, 46.999),
    axis = norm(dvec),
    a = (23 * 23 - 24 * 24 + d * d) / (2 * d),
    h = Math.sqrt(Math.max(0, 23 * 23 - a * a));
  let bend = sub(forward, mul(axis, dot(forward, axis)));
  if (len(bend) < 0.01) bend = vec(0, -1, 0);
  const knee = add(hip, add(mul(axis, a), mul(norm(bend), h)));
  return { knee, reach: raw };
}
class Mech {
  constructor() {
    this.reset();
  }
  reset() {
    this.tuning = { speed: 1, stride: 1, stepHeight: 1, bob: 1 };
    this.x = 0;
    this.y = 90;
    this.vx = 0;
    this.vy = 0;
    this.yaw = 2.7;
    this.turret = 2.7;
    this.time = 0;
    this.recoil = 0;
    this.land = 0;
    this.speed = 0;
    this.next = 0;
    this.steps = 0;
    this.distance = 0;
    this.lean = vec();
    this.feet = [-1, 1].map((side) => {
      const p = rotate(vec(side * 17, 1, 3), this.yaw);
      return {
        side,
        p: add(vec(this.x, this.y, 0), p),
        yaw: this.yaw,
        start: null,
        target: null,
        t: 0,
        duration: 0.22,
        swing: false,
      };
    });
  }
  update(dt, input) {
    this.time += dt;
    dt = Math.min(dt, 1 / 30);
    let ix = input.x || 0,
      iy = input.y || 0,
      m = Math.hypot(ix, iy);
    if (m > 1) {
      ix /= m;
      iy /= m;
      m = 1;
    }
    const rate = (input.fast ? 83 : 57) * this.tuning.speed;
    const oldvx = this.vx,
      oldvy = this.vy;
    this.vx = mix(this.vx, ix * rate, damping(m ? 7 : 10, dt));
    this.vy = mix(this.vy, iy * rate, damping(m ? 7 : 10, dt));
    if (m < 0.01 && Math.hypot(this.vx, this.vy) < 0.15) this.vx = this.vy = 0;
    this.x = clamp(this.x + this.vx * dt, -435, 435);
    this.y = clamp(this.y + this.vy * dt, -330, 330);
    this.speed = Math.hypot(this.vx, this.vy);
    this.distance += this.speed * dt;
    let desired = this.yaw;
    if (this.speed > 2) desired = Math.atan2(this.vx, -this.vy);
    else if (input.turn) desired += input.turn * dt * 1.6;
    else if (input.aim && Math.abs(angle(this.yaw, input.aimYaw)) > 0.95)
      desired = input.aimYaw - clamp(angle(this.yaw, input.aimYaw), -0.7, 0.7);
    this.yaw += clamp(angle(this.yaw, desired), -2.1 * dt, 2.1 * dt);
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
      f.t += dt / f.duration;
      const u = clamp(f.t, 0, 1),
        t = u * u * (3 - 2 * u);
      f.p = vec(
        mix(f.start.x, f.target.x, t),
        mix(f.start.y, f.target.y, t),
        3 + 7 * this.tuning.stepHeight * Math.sin(Math.PI * u) ** 2,
      );
      f.yaw = f.startYaw + angle(f.startYaw, f.targetYaw) * t;
      if (u >= 1) {
        f.p = vec(f.target.x, f.target.y, 3);
        f.swing = false;
        this.land = 0.8;
        this.steps++;
      }
    }
    if (!active) {
      let best = -1,
        score = 0;
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i],
          off = rotate(vec(f.side * 17, 1, 3), this.yaw);
        f.desired = vec(
          this.x + off.x + this.vx * 0.19 * this.tuning.stride,
          this.y + off.y + this.vy * 0.19 * this.tuning.stride,
          3,
        );
        const dist = Math.hypot(f.desired.x - f.p.x, f.desired.y - f.p.y),
          yawError = Math.abs(angle(f.yaw, this.yaw));
        let priority =
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
        f.duration = this.speed > 68 ? 0.18 : 0.22;
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
    const swing = this.feet.find((f) => f.swing),
      bob =
        (swing ? Math.sin(swing.t * Math.PI) * 1.2 * this.tuning.bob : 0) -
        this.land * 0.9;
    const base = vec(this.x, this.y, 38 + bob);
    for (const f of this.feet) {
      const off = rotate(vec(f.side * 12.7, 0, 0), this.yaw),
        horizontal = Math.hypot(this.x + off.x - f.p.x, this.y + off.y - f.p.y);
      base.z = Math.min(
        base.z,
        f.p.z + Math.sqrt(Math.max(1, 46.5 ** 2 - horizontal ** 2)),
      );
    }
    const local = (x, y, z, yaw = this.yaw) =>
      add(base, rotate(vec(x, y, z), yaw));
    const forward = rotate(vec(0, -1, 0), this.yaw);
    return {
      base,
      local,
      forward,
      legs: this.feet.map((f) => {
        const hip = local(f.side * 12.7, 0, 0);
        return { f, hip, ...solveLeg(hip, f.p, forward) };
      }),
      bob,
    };
  }
}
class World {
  constructor() {
    this.mech = new Mech();
    this.time = 0;
    this.cool = 0;
    this.shots = [];
    this.sparks = [];
    this.targets = [];
    this.hits = 0;
    this.resetTargets();
    let seed = 197;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    this.marks = Array.from({ length: 290 }, () => ({
      x: (random() - 0.5) * 1000,
      y: (random() - 0.5) * 800,
      r: random() * 3 + 0.6,
      v: random(),
    }));
    this.rocks = Array.from({ length: 40 }, (_, i) => ({
      x: (random() - 0.5) * 1050,
      y: (random() - 0.5) * 810,
      w: random() * 12 + 5,
      h: random() * 9 + 3,
      yaw: random() * 6,
    })).filter((r) => Math.hypot(r.x, r.y) > 150);
  }
  resetTargets() {
    this.targets = [
      [-215, -160],
      [215, -175],
      [285, 155],
      [-195, 235],
      [15, -295],
    ].map(([x, y], i) => ({ x, y, id: i + 1, hp: 3, flash: 0, down: 0 }));
    this.hits = 0;
  }
  reset() {
    this.mech.reset();
    this.resetTargets();
    this.shots = [];
    this.sparks = [];
    this.cool = 0;
  }
  update(dt, input) {
    this.time += dt;
    this.mech.update(dt, input);
    this.cool -= dt;
    for (const t of this.targets) {
      t.flash = Math.max(0, t.flash - dt * 4);
      if (t.hp <= 0) t.down = Math.min(1, t.down + dt * 2);
    }
    if (input.fire && this.cool <= 0) {
      const g = this.mech,
        a = g.turret,
        off = rotate(vec(25, -31, 51), a);
      this.shots.push({
        x: g.x + off.x,
        y: g.y + off.y,
        z: 51,
        vx: Math.sin(a) * 390,
        vy: -Math.cos(a) * 390,
        life: 1.4,
      });
      g.recoil = 1;
      this.cool = 0.26;
    }
    for (const b of this.shots) {
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const t of this.targets) {
        if (t.hp <= 0) continue;
        const dx = b.x - b.px,
          dy = b.y - b.py,
          u = clamp(
            ((t.x - b.px) * dx + (t.y - b.py) * dy) / (dx * dx + dy * dy || 1),
            0,
            1,
          );
        if (Math.hypot(t.x - b.px - u * dx, t.y - b.py - u * dy) < 19) {
          b.life = -1;
          t.hp--;
          t.flash = 1;
          if (t.hp <= 0) this.hits++;
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * TAU;
            this.sparks.push({
              x: t.x,
              y: t.y,
              z: 35,
              vx: Math.cos(a) * 45,
              vy: Math.sin(a) * 45,
              vz: 25 + i * 3,
              life: 0.4 + i * 0.023,
            });
          }
          break;
        }
      }
    }
    this.shots = this.shots.filter((b) => b.life > 0);
    for (const p of this.sparks) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= 180 * dt;
      p.life -= dt;
    }
    this.sparks = this.sparks.filter((p) => p.life > 0 && p.z > 0);
  }
}

const rot = (x, y, a) =>
  vec(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) =>
  vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
function knee(hip, foot, forward) {
  const v = vec(foot.x - hip.x, foot.y - hip.y, foot.z - hip.z),
    raw = Math.hypot(v.x, v.y, v.z),
    d = clamp(raw, 0.1, 19.49),
    n = vec(v.x / (raw || 1), v.y / (raw || 1), v.z / (raw || 1)),
    along = (9.5 ** 2 - 10 ** 2 + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, 9.5 ** 2 - along * along));
  const dot = forward.x * n.x + forward.y * n.y;
  let b = vec(forward.x - n.x * dot, forward.y - n.y * dot, -n.z * dot),
    bl = Math.hypot(b.x, b.y, b.z) || 1;
  return vec(
    hip.x + n.x * along + (b.x / bl) * height,
    hip.y + n.y * along + (b.y / bl) * height,
    hip.z + n.z * along + (b.z / bl) * height,
  );
}
class Pilot {
  constructor() {
    this.tuning = { speed: 1, stride: 1, stepHeight: 1, bob: 1 };
    this.place(0, 0, 2.7);
  }
  place(x, y, yaw) {
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
  update(dt, input, mech) {
    dt = Math.min(dt, 1 / 30);
    this.contacts = null;
    let x = input.x || 0,
      y = input.y || 0,
      m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    const rate = (input.fast ? 72 : 52) * this.tuning.speed;
    this.vx += (x * rate - this.vx) * damping(m ? 12 : 18, dt);
    this.vy += (y * rate - this.vy) * damping(m ? 12 : 18, dt);
    const oldx = this.x,
      oldy = this.y;
    this.x = clamp(this.x + this.vx * dt, -435, 435);
    this.y = clamp(this.y + this.vy * dt, -330, 330);
    const dx = this.x - mech.x,
      dy = this.y - mech.y,
      d = Math.hypot(dx, dy);
    if (d < 34) {
      this.x = mech.x + (dx / (d || 1)) * 34;
      this.y = mech.y + (dy / (d || 1)) * 34;
      if (d < 0.001) this.x = mech.x + 34;
    }
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
class PilotWorld extends World {
  constructor() {
    super();
    this.pilot = new Pilot();
    this.control = "mech";
    this.transition = null;
    this.mech.hatch = 0;
  }
  reset() {
    super.reset();
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
  local(x, y, z = 0, a = this.mech.turret) {
    const o = rot(x, y, a);
    return vec(this.mech.x + o.x, this.mech.y + o.y, z);
  }
  door() {
    for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const p = this.local(0, -52, 0, this.mech.turret + offset);
      if (Math.abs(p.x) <= 430 && Math.abs(p.y) <= 325) return p;
    }
    return this.local(0, 52);
  }
  interact() {
    if (this.transition || (this.control === "foot" && !this.nearby))
      return false;
    const exiting = this.control === "mech",
      ground = this.door(),
      yaw = Math.atan2(ground.x - this.mech.x, -(ground.y - this.mech.y));
    this.transition = { exiting, stage: "park", t: 0, yaw, ground, path: [] };
    this.mech.vx = this.mech.vy = this.mech.speed = 0;
    return true;
  }
  route(tr) {
    const g = this.mech,
      p = this.pilot,
      a = Math.atan2(p.x - g.x, -(p.y - g.y)),
      delta = angle(a, tr.yaw);
    let best = [];
    // Route around the footprint, never straight through the parked machine.
    for (const d of [delta, delta + (delta > 0 ? -Math.PI * 2 : Math.PI * 2)]) {
      const path = [];
      const n = Math.max(1, Math.ceil(Math.abs(d) / 0.25));
      for (let i = 0; i <= n; i++)
        path.push(this.local(0, -44, 0, a + (d * i) / n));
      path.push(tr.ground);
      if (path.every((p) => Math.abs(p.x) <= 435 && Math.abs(p.y) <= 330)) {
        best = path;
        break;
      }
    }
    tr.path = best.length ? best : [tr.ground];
  }
  transferPose(u) {
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
    const rung = (side, height) =>
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
  update(dt, input) {
    if (this.control === "mech" && !this.transition) {
      super.update(dt, input);
      this.mech.hatch = Math.max(0, this.mech.hatch - dt * 4);
      return;
    }
    const tr = this.transition;
    if (tr && tr.stage === "park") {
      this.mech.yaw += clamp(angle(this.mech.yaw, tr.yaw), -dt * 2.1, dt * 2.1);
    }
    super.update(dt, {});
    if (!tr) {
      this.pilot.update(dt, input, this.mech);
      this.mech.hatch = Math.max(0, this.mech.hatch - dt * 3);
      return;
    }
    tr.t += dt;
    const next = (stage) => {
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
          this.route(tr);
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

export { Mech, Pilot, PilotWorld, solveLeg };
