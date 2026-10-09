export interface Vec {
  x: number;
  y: number;
  z: number;
}
export interface Input {
  x?: number;
  y?: number;
  fast?: boolean;
  turn?: number;
  aim?: boolean;
  aimYaw?: number;
  fire?: boolean;
}
export interface Tuning {
  speed: number;
  stride: number;
  stepHeight: number;
  bob: number;
}
export interface Foot {
  side: number;
  p: Vec;
  yaw: number;
  swing?: boolean;
  stance?: boolean;
  t?: number;
}
export interface Leg {
  hip: Vec;
  knee: Vec;
  f: Foot;
  reach?: number;
}
export interface Actor {
  x: number;
  y: number;
  yaw: number;
  vx: number;
  vy: number;
  speed: number;
  tuning: Tuning;
  feet: Foot[];
  pose(): { base: Vec; legs: Leg[] };
}
export interface MechActor extends Actor {
  turret: number;
  lean: Vec;
  recoil: number;
  hatch: number;
}
export interface PilotActor extends Actor {
  phase: number;
  visible: number;
  climbing: number;
  contacts: { feet: Vec[]; hands: Vec[] } | null;
  place(x: number, y: number, yaw: number): void;
}
export interface World {
  mech: MechActor;
  pilot: PilotActor;
  actor: Actor;
  control: "mech" | "foot";
  transition: { stage: string; exiting: boolean; t: number } | null;
  nearby: boolean;
  time: number;
  rocks: unknown[];
  targets: unknown[];
  update(dt: number, input: Input): void;
  interact(): boolean;
  local(x: number, y: number, z?: number): Vec;
}
export type ActorId = "mech" | "pilot";
export interface Component {
  id: string;
  parent: string | null;
  kind: "root" | "joint" | "shape";
  world: Vec;
  local: Vec;
  angle?: number;
  contact?: boolean;
  visible: boolean;
  drawOrder: number[];
  bounds?: { x: number; y: number; width: number; height: number };
  issues: string[];
}
export interface Point {
  x: number;
  y: number;
}
export interface Shape {
  id: string;
  component: string;
  points: Point[];
  depth: number;
  color: number;
  alpha: number;
}
