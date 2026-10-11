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
import { PALETTE } from "../mechs/palette";
import type { ColorRef, MechPart } from "../mechs/schema";
// Pilot artwork and boarding ladder colours; Mech colours come from its spec.
const light = PALETTE.bone,
  dark = PALETTE.slate;
type Size = { w: number; d: number; h: number };
type Frame = MechPart["attach"];
interface Anchor {
  origin: Vec;
  /** Bone frames: the lower joint; parts sit `along` origin→end. */
  end?: Vec;
  yaw: number;
  parent: string;
}
export function buildRig(
  world: World,
  config: RigConfig,
  isolated: boolean,
  options: { volumes?: boolean } = {},
) {
  const geo = new Geometry(options);
  const paint = parseInt(config.color.slice(1), 16);
  const tone = (c: ColorRef) => (c === "paint" ? paint : PALETTE[c]);
  const toneOf = (c: ColorRef | undefined) => (c === undefined ? c : tone(c));
  const actor = (id: ActorId, a: Actor) => {
    const pose = a.pose();
    geo.component(id, null, "root", vec(a.x, a.y, 0));
    const local = (x: number, y: number, z: number) =>
      add(pose.base, rotate(vec(x, y, z), a.yaw));
    // Semantic blocks resolve exact planar faces; others keep one
    // representative-depth silhouette (see docs/animation/semantic-surfaces.md).
    const block = (
      name: string,
      p: Vec,
      s: Size,
      yaw: number,
      color: number,
      cap?: number,
      parent = id as string,
      semantic = false,
    ) => {
      geo.component(name, parent, "shape", p);
      if (semantic) geo.surfaceBlock(name, p, s.w, s.d, s.h, yaw, color, cap);
      else geo.block(name, p, s.w, s.d, s.h, yaw, color, cap);
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
    const spec = id === "mech" ? (a as MechActor).spec : undefined;
    const legAnchors = new Map<string, Anchor>();
    for (const l of pose.legs) {
      const side = l.f.side === -1 ? "left" : "right",
        prefix = `${id}.leg.${side}`,
        contact = spec ? !l.f.swing : !!l.f.stance;
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
      if (spec) {
        const legs = spec.legs;
        block(
          prefix + ".boot",
          add(l.f.p, vec(0, 0, legs.boot.lift)),
          legs.boot.size,
          l.f.yaw,
          tone(legs.boot.color),
          toneOf(legs.boot.cap),
          prefix + ".foot",
        );
        limb(
          prefix + ".shin",
          l.f.p,
          l.knee,
          legs.shinWidth[0],
          legs.shinWidth[1],
          tone(legs.shinColor),
          prefix + ".knee",
        );
        limb(
          prefix + ".thigh",
          l.knee,
          l.hip,
          legs.thighWidth[0],
          legs.thighWidth[1],
          tone(legs.thighColor),
          prefix + ".hip",
        );
        if (legs.kneecap)
          block(
            prefix + ".kneecap",
            l.knee,
            legs.kneecap.size,
            a.yaw,
            tone(legs.kneecap.color),
            toneOf(legs.kneecap.cap),
            prefix + ".knee",
          );
        legAnchors.set(`hip.${side}`, {
          origin: l.hip,
          yaw: a.yaw,
          parent: prefix + ".hip",
        });
        legAnchors.set(`knee.${side}`, {
          origin: l.knee,
          yaw: a.yaw,
          parent: prefix + ".knee",
        });
        legAnchors.set(`foot.${side}`, {
          origin: l.f.p,
          yaw: l.f.yaw,
          parent: prefix + ".foot",
        });
        legAnchors.set(`thigh.${side}`, {
          origin: l.hip,
          end: l.knee,
          yaw: a.yaw,
          parent: prefix + ".thigh",
        });
        legAnchors.set(`shin.${side}`, {
          origin: l.knee,
          end: l.f.p,
          yaw: a.yaw,
          parent: prefix + ".shin",
        });
      } else {
        block(
          prefix + ".boot",
          add(l.f.p, vec(0, 0, 0)),
          { w: 3.7, d: 6, h: 2.4 },
          l.f.yaw,
          dark,
          undefined,
          prefix + ".foot",
        );
        limb(prefix + ".shin", l.f.p, l.knee, 3.2, 2.6, dark, prefix + ".knee");
        limb(prefix + ".thigh", l.knee, l.hip, 3.6, 3.2, dark, prefix + ".hip");
      }
    }
    if (spec) {
      const g = a as MechActor,
        y = g.turret,
        H = vec(
          g.x + g.lean.x,
          g.y + g.lean.y,
          spec.turret.height + pose.base.z - spec.legs.hipHeight,
        ),
        L = (x: number, z: number, h: number) =>
          add(H, rotate(vec(x, z, h), y)),
        at = (p: Vec) => L(p.x, p.y, p.z);
      const { pelvis, pack, torso, cockpit, canopy, arms, tools } = spec;
      block(
        "mech.pelvis",
        local(pelvis.position.x, pelvis.position.y, pelvis.position.z),
        pelvis.size,
        g.yaw,
        tone(pelvis.color),
        toneOf(pelvis.cap),
        id,
        true,
      );
      if (pack)
        block(
          "mech.pack",
          at(pack.position),
          pack.size,
          y,
          tone(pack.color),
          toneOf(pack.cap),
          id,
          true,
        );
      block(
        "mech.torso",
        H,
        torso.size,
        y,
        tone(torso.color),
        toneOf(torso.cap),
        id,
        true,
      );
      block(
        "mech.cockpit",
        at(cockpit.position),
        cockpit.size,
        y,
        tone(cockpit.color),
        toneOf(cockpit.cap),
        id,
        true,
      );
      // Canopy width collapses continuously at its tangent; never toggle a full polygon.
      const facing = Math.max(0, -Math.cos(y)),
        half = canopy.halfWidth * facing,
        open = (u: number) =>
          L(
            u * half,
            canopy.front + g.hatch * canopy.open.y,
            canopy.bottom + g.hatch * canopy.open.z,
          ),
        points = [
          L(-half, canopy.front, canopy.top),
          L(half, canopy.front, canopy.top),
          open(1),
          open(-1),
        ];
      const hatch = geo.component(
        "mech.cockpit.hatch",
        "mech.cockpit",
        "shape",
        L(0, canopy.front, cockpit.position.z),
      );
      hatch.visible = facing > 1e-8;
      hatch.opacity = hatch.visible ? 1 : 0;
      geo.polygon(hatch.id, points, tone(canopy.color), 15, hatch.opacity);
      const armAnchors = new Map<string, Anchor>();
      for (const side of [-1, 1]) {
        const s = side < 0 ? "left" : "right",
          shoulder = L(
            side * arms.shoulder.x,
            arms.shoulder.y,
            arms.shoulder.z,
          ),
          elbow = L(side * arms.elbow.x, arms.elbow.y, arms.elbow.z),
          wrist = L(
            side * arms.wrist.x,
            arms.wrist.y + g.recoil * 3,
            arms.wrist.z,
          );
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
        limb(
          `mech.arm.${s}.upper`,
          shoulder,
          elbow,
          arms.upper.width[0],
          arms.upper.width[1],
          tone(arms.upper.color),
          "mech.torso",
        );
        limb(
          `mech.arm.${s}.lower`,
          elbow,
          wrist,
          arms.lower.width[0],
          arms.lower.width[1],
          tone(arms.lower.color),
          "mech.torso",
        );
        if (arms.armor) {
          const o = arms.armor.offset;
          block(
            `mech.arm.${s}.armor`,
            add(shoulder, rotate(vec(side * o.x, o.y, o.z), y)),
            arms.armor.size,
            y,
            tone(arms.armor.color),
            toneOf(arms.armor.cap),
            id,
            true,
          );
        }
        armAnchors.set(`shoulder.${s}`, {
          origin: shoulder,
          yaw: y,
          parent: `mech.arm.${s}.shoulder`,
        });
        armAnchors.set(`elbow.${s}`, {
          origin: elbow,
          yaw: y,
          parent: `mech.arm.${s}.elbow`,
        });
        armAnchors.set(`wrist.${s}`, {
          origin: wrist,
          yaw: y,
          parent: `mech.arm.${s}.lower`,
        });
        armAnchors.set(`upper-arm.${s}`, {
          origin: shoulder,
          end: elbow,
          yaw: y,
          parent: `mech.arm.${s}.upper`,
        });
        armAnchors.set(`forearm.${s}`, {
          origin: elbow,
          end: wrist,
          yaw: y,
          parent: `mech.arm.${s}.lower`,
        });
      }
      if (tools.barrel) {
        const b = tools.barrel;
        block(
          "mech.tool.barrel",
          L(b.position.x, b.position.y + g.recoil * 4, b.position.z),
          b.size,
          y,
          tone(b.color),
          toneOf(b.cap),
          id,
          true,
        );
      }
      if (tools.hook) {
        const h = tools.hook;
        geo.component(
          "mech.tool.hook",
          "mech",
          "shape",
          L(h.anchor.x, h.anchor.y, h.z),
        );
        geo.polygon(
          "mech.tool.hook",
          h.points.map(([x, z]) => L(x, z, h.z)),
          tone(h.color),
          5,
        );
      }
      // Extra parts: per-side joint frames always mirror; body/turret on request.
      const frames: Record<Frame, (side: "left" | "right") => Anchor> = {
        body: () => ({ origin: pose.base, yaw: g.yaw, parent: "mech.pelvis" }),
        turret: () => ({ origin: H, yaw: y, parent: "mech.torso" }),
        shoulder: (s) => armAnchors.get(`shoulder.${s}`)!,
        elbow: (s) => armAnchors.get(`elbow.${s}`)!,
        wrist: (s) => armAnchors.get(`wrist.${s}`)!,
        hip: (s) => legAnchors.get(`hip.${s}`)!,
        knee: (s) => legAnchors.get(`knee.${s}`)!,
        foot: (s) => legAnchors.get(`foot.${s}`)!,
        "upper-arm": (s) => armAnchors.get(`upper-arm.${s}`)!,
        forearm: (s) => armAnchors.get(`forearm.${s}`)!,
        thigh: (s) => legAnchors.get(`thigh.${s}`)!,
        shin: (s) => legAnchors.get(`shin.${s}`)!,
      };
      for (const p of spec.parts) {
        const sided =
          p.mirror || !["body", "turret"].includes(p.attach)
            ? ([
                ["left", -1],
                ["right", 1],
              ] as const)
            : ([[null, 1]] as const);
        for (const [s, sign] of sided) {
          const anchor = frames[p.attach](s ?? "right"),
            at = (t: number) =>
              anchor.end
                ? add(
                    anchor.origin,
                    vec(
                      (anchor.end.x - anchor.origin.x) * t,
                      (anchor.end.y - anchor.origin.y) * t,
                      (anchor.end.z - anchor.origin.z) * t,
                    ),
                  )
                : anchor.origin,
            place = (q: Vec, t = p.along) =>
              add(at(t), rotate(vec(sign * q.x, q.y, q.z), anchor.yaw)),
            name = `mech.part.${p.id}${s ? "." + s : ""}`;
          if (p.kind === "block")
            block(
              name,
              place(p.position),
              p.size,
              anchor.yaw,
              tone(p.color),
              toneOf(p.cap),
              anchor.parent,
              p.surfaces,
            );
          else
            limb(
              name,
              place(p.from),
              place(p.to, p.alongTo ?? p.along),
              p.width[0],
              p.width[1],
              tone(p.color),
              anchor.parent,
            );
        }
      }
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
        coat = PALETTE.ochre,
        skin = 0xd9a47e;
      block(
        "pilot.torso",
        L(0, 0, 4),
        { w: 12, d: 8, h: 12 },
        p.yaw,
        coat,
        PALETTE.straw,
      );
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
        block(`pilot.arm.${s}.hand`, hand, { w: 3, d: 3, h: 3 }, p.yaw, skin);
      }
      block("pilot.pack", L(0, 4, 5), { w: 7, d: 3, h: 8 }, p.yaw, dark);
      block("pilot.head", L(0, -0.4, 15), { w: 8, d: 7, h: 9 }, p.yaw, skin);
      block("pilot.hair", L(0, 0, 19), { w: 8.5, d: 7.5, h: 3.5 }, p.yaw, dark);
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
