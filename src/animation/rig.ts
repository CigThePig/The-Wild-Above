import type {
  Actor,
  ActorId,
  MechActor,
  PilotActor,
  Vec,
  World,
} from "./types";
import { Geometry, vec, add, rotate } from "../rendering/geometry";
import type { RigConfig } from "./config";
const body = 0xa5a082,
  light = 0xd0c1a0,
  dark = 0x34413b;
export function buildRig(world: World, config: RigConfig, isolated: boolean) {
  const geo = new Geometry();
  const actor = (id: ActorId, a: Actor) => {
    const pose = a.pose();
    geo.component(id, null, "root", vec(a.x, a.y, 0));
    const local = (x: number, y: number, z: number) =>
      add(pose.base, rotate(vec(x, y, z), a.yaw));
    const block = (
      name: string,
      p: Vec,
      w: number,
      d: number,
      h: number,
      yaw: number,
      color: number,
      cap?: number,
      parent = id as string,
    ) => {
      geo.component(name, parent, "shape", p);
      geo.block(name, p, w, d, h, yaw, color, cap);
    };
    const limb = (
      name: string,
      p: Vec,
      q: Vec,
      wa: number,
      wb: number,
      color: number,
      parent: string,
    ) => {
      geo.component(name, parent, "shape", p);
      geo.limb(name, p, q, wa, wb, color);
    };
    for (const l of pose.legs) {
      const side = l.f.side === -1 ? "left" : "right",
        prefix = `${id}.leg.${side}`,
        contact = id === "mech" ? !l.f.swing : !!l.f.stance;
      geo.component(prefix + ".hip", id, "joint", l.hip);
      const knee = geo.component(
        prefix + ".knee",
        prefix + ".hip",
        "joint",
        l.knee,
      );
      geo.component(
        prefix + ".foot",
        prefix + ".knee",
        "joint",
        l.f.p,
        contact,
      );
      const u = vec(l.hip.x - l.knee.x, l.hip.y - l.knee.y, l.hip.z - l.knee.z),
        v = vec(l.f.p.x - l.knee.x, l.f.p.y - l.knee.y, l.f.p.z - l.knee.z);
      knee.angle =
        (Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              (u.x * v.x + u.y * v.y + u.z * v.z) /
                (Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z) || 1),
            ),
          ),
        ) *
          180) /
        Math.PI;
      if (180 - knee.angle > config.kneeLimit)
        knee.issues.push("knee flexion exceeds configured diagnostic limit");
      const m = id === "mech";
      block(
        prefix + ".boot",
        add(l.f.p, vec(0, 0, m ? 2 : 0)),
        m ? 15 : 3.7,
        m ? 25 : 6,
        m ? 7 : 2.4,
        l.f.yaw,
        dark,
        m ? body : undefined,
        prefix + ".foot",
      );
      limb(
        prefix + ".shin",
        l.f.p,
        l.knee,
        m ? 10 : 3.2,
        m ? 12 : 2.6,
        m ? body : dark,
        prefix + ".knee",
      );
      limb(
        prefix + ".thigh",
        l.knee,
        l.hip,
        m ? 13 : 3.6,
        m ? 14 : 3.2,
        m ? body : dark,
        prefix + ".hip",
      );
      if (m)
        block(
          prefix + ".kneecap",
          l.knee,
          12,
          8,
          9,
          a.yaw,
          dark,
          undefined,
          prefix + ".knee",
        );
    }
    const paint = parseInt(config.color.slice(1), 16);
    if (id === "mech") {
      const g = a as MechActor,
        y = g.turret,
        H = vec(g.x + g.lean.x, g.y + g.lean.y, 59 + pose.base.z - 38),
        L = (x: number, z: number, h: number) =>
          add(H, rotate(vec(x, z, h), y));
      block("mech.pelvis", local(0, 0, 3), 31, 22, 12, g.yaw, dark);
      block("mech.pack", L(0, 17, 0), 30, 11, 22, y, dark);
      block("mech.torso", H, 37, 29, 26, y, paint, light);
      block("mech.cockpit", L(0, -15, 1), 24, 5, 18, y, dark);
      // Canopy width collapses continuously at its tangent; never toggle a full polygon.
      const facing = Math.max(0, -Math.cos(y)),
        half = 9 * facing,
        points = [
          L(-half, -18, 7),
          L(half, -18, 7),
          L(half, -18 - g.hatch * 12, -4 + g.hatch * 18),
          L(-half, -18 - g.hatch * 12, -4 + g.hatch * 18),
        ];
      const hatch = geo.component(
        "mech.cockpit.hatch",
        "mech.cockpit",
        "shape",
        L(0, -18, 1),
      );
      hatch.visible = facing > 1e-8;
      hatch.opacity = hatch.visible ? 1 : 0;
      geo.polygon(hatch.id, points, 0x76c5b4, 15, hatch.opacity);
      for (const side of [-1, 1]) {
        const s = side < 0 ? "left" : "right",
          shoulder = L(side * 24, 1, 5),
          elbow = L(side * 27, 0, -9),
          wrist = L(side * 26, -12 + g.recoil * 3, -10);
        geo.component(
          `mech.arm.${s}.shoulder`,
          "mech.torso",
          "joint",
          shoulder,
        );
        geo.component(
          `mech.arm.${s}.elbow`,
          `mech.arm.${s}.shoulder`,
          "joint",
          elbow,
        );
        limb(`mech.arm.${s}.upper`, shoulder, elbow, 10, 9, dark, "mech.torso");
        limb(`mech.arm.${s}.lower`, elbow, wrist, 11, 10, paint, "mech.torso");
        block(
          `mech.arm.${s}.armor`,
          add(shoulder, vec(0, 0, 4)),
          15,
          20,
          10,
          y,
          paint,
          light,
        );
      }
      block(
        "mech.tool.barrel",
        L(25, -22 + g.recoil * 4, -8),
        12,
        24,
        12,
        y,
        dark,
        paint,
      );
      const hook = [
        [-32, -12],
        [-20, -12],
        [-18, -24],
        [-22, -30],
        [-23, -20],
        [-29, -20],
        [-30, -30],
        [-34, -24],
      ].map(([x, z]) => L(x, z, -10));
      geo.component("mech.tool.hook", "mech", "shape", L(-26, -20, -10));
      geo.polygon("mech.tool.hook", hook, light, 5);
      if (world.transition && g.hatch > 0.05) {
        for (const side of [-1, 1])
          limb(
            `mech.ladder.rail.${side}`,
            world.local(side * 7, -36, 0),
            world.local(side * 7, -26, 50),
            1.5,
            1.5,
            dark,
            "mech",
          );
        for (const z of [1, 9, 17, 25, 33, 41, 49])
          limb(
            `mech.ladder.rung.${z}`,
            world.local(-7, -36 + z * 0.2, z),
            world.local(7, -36 + z * 0.2, z),
            1.5,
            1.5,
            light,
            "mech",
          );
      }
    } else {
      const p = a as PilotActor,
        L = (x: number, y: number, z: number) =>
          local(x, y - (p.speed > 1 ? z * 0.07 : 0), z),
        coat = 0xb99b64,
        skin = 0xd9a47e;
      block("pilot.torso", L(0, 0, 4), 12, 8, 12, p.yaw, coat, 0xd3bb8c);
      const swing = p.speed > 1 ? Math.sin(p.phase * Math.PI * 2) * 4 : 0;
      for (const side of [-1, 1]) {
        const s = side < 0 ? "left" : "right",
          shoulder = L(side * 6, 0, 8),
          elbow = L(
            side * 7,
            side * swing - (p.climbing || 0) * 3,
            2 + (p.climbing || 0) * 7,
          ),
          hand =
            p.contacts?.hands[side < 0 ? 0 : 1] ??
            L(side * 6, side * swing - 4, 3 + Math.abs(swing) * 0.25);
        geo.component(`pilot.arm.${s}.elbow`, "pilot.torso", "joint", elbow);
        limb(
          `pilot.arm.${s}.upper`,
          shoulder,
          elbow,
          4.2,
          3.5,
          coat,
          "pilot.torso",
        );
        limb(`pilot.arm.${s}.lower`, elbow, hand, 3.5, 3, coat, "pilot.torso");
        block(`pilot.arm.${s}.hand`, hand, 3, 3, 3, p.yaw, skin);
      }
      block("pilot.pack", L(0, 4, 5), 7, 3, 8, p.yaw, dark);
      block("pilot.head", L(0, -0.4, 15), 8, 7, 9, p.yaw, skin);
      block("pilot.hair", L(0, 0, 19), 8.5, 7.5, 3.5, p.yaw, dark);
      const suppressed =
        world.transition?.exiting &&
        ["park", "open"].includes(world.transition.stage);
      const opacity = suppressed ? 0 : p.visible;
      for (const c of geo.components.filter((c) => c.id.startsWith("pilot"))) {
        c.opacity = opacity;
        c.visible = opacity > 0;
      }
      for (const s of geo.shapes.filter((s) => s.component.startsWith("pilot")))
        s.alpha = opacity;
    }
  };
  if (!isolated || config.actor === "mech") actor("mech", world.mech);
  if (
    isolated
      ? config.actor === "pilot"
      : world.control === "foot" || !!world.transition
  )
    actor("pilot", world.pilot);
  return geo.finish();
}
