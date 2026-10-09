import { z } from "zod";
import { PilotWorld } from "./legacy/motion.js";
import type { World, Input } from "./types";
import { configSchema, defaultConfig, type RigConfig } from "./config";
export const DT = 1 / 60;
const inputSchema = z
  .object({
    x: z.number().finite().min(-1).max(1).optional(),
    y: z.number().finite().min(-1).max(1).optional(),
    fast: z.boolean().optional(),
    turn: z.number().min(-1).max(1).optional(),
    aim: z.boolean().optional(),
    aimYaw: z.number().finite().optional(),
    fire: z.boolean().optional(),
  })
  .strict();
const recordingSchema = z.object({
  config: configSchema,
  commands: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("step"),
          frames: z.number().int().min(0).max(3600),
          input: inputSchema,
        }),
        z.object({ kind: z.literal("interact") }),
      ]),
    )
    .max(3600),
});
type Recording = z.infer<typeof recordingSchema>;
export class Simulation {
  world!: World;
  tick = 0;
  commands: Recording["commands"] = [];
  config: RigConfig;
  readonly seed = 197;
  constructor(config: RigConfig = defaultConfig) {
    this.config = configSchema.parse(config);
    this.reset();
  }
  reset() {
    this.commands = [];
    this.world = new PilotWorld() as unknown as World;
    this.world.targets = [];
    this.world.rocks = [];
    this.tick = 0;
    const a = (this.config.heading * Math.PI) / 180,
      g = this.world.mech;
    g.yaw = g.turret = a;
    g.x = 0;
    g.y = 0;
    for (const f of g.feet) {
      f.p = {
        x: f.side * 17 * Math.cos(a) - Math.sin(a),
        y: f.side * 17 * Math.sin(a) + Math.cos(a),
        z: 3,
      };
      f.yaw = a;
    }
    this.world.pilot.place(100, 0, a);
    this.world.control = this.config.actor === "pilot" ? "foot" : "mech";
    this.applyTuning();
  }
  applyTuning() {
    for (const a of [this.world.mech, this.world.pilot])
      a.tuning = {
        speed: this.config.speed,
        stride: this.config.stride,
        stepHeight: this.config.stepHeight,
        bob: this.config.bob,
      };
  }
  input(): Input {
    const a = (this.config.heading * Math.PI) / 180,
      m = this.config.animation === "idle" ? 0 : 1;
    return {
      x: Math.sin(a) * m,
      y: -Math.cos(a) * m,
      fast: this.config.animation === "run",
    };
  }
  step(frames = 1, input?: Input) {
    if (!Number.isInteger(frames) || frames < 0 || frames > 3600)
      throw Error("frames must be an integer from 0 to 3600");
    const checked = inputSchema.parse(input ?? this.input());
    const last = this.commands.at(-1);
    if (
      last?.kind === "step" &&
      last.frames + frames <= 3600 &&
      JSON.stringify(last.input) === JSON.stringify(checked)
    )
      last.frames += frames;
    else this.commands.push({ kind: "step", frames, input: checked });
    for (let i = 0; i < frames; i++) {
      this.world.update(DT, checked);
      this.tick++;
    }
  }
  seek(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60)
      throw Error("time must be 0–60 seconds");
    this.reset();
    this.step(Math.round(seconds / DT));
  }
  configure(patch: Partial<RigConfig>) {
    const c = configSchema.parse({ ...this.config, ...patch });
    const time = this.tick * DT;
    this.config = c;
    this.seek(time);
  }
  interact() {
    const accepted = this.world.interact();
    if (accepted) this.commands.push({ kind: "interact" });
    return accepted;
  }
  recording(): Recording {
    return structuredClone({ config: this.config, commands: this.commands });
  }
  replay(value: unknown) {
    const recording = recordingSchema.parse(value);
    if (
      recording.commands.reduce(
        (n, c) => n + (c.kind === "step" ? c.frames : 0),
        0,
      ) > 36000
    )
      throw Error("Recording too long");
    this.config = recording.config;
    this.reset();
    for (const command of recording.commands) {
      if (command.kind === "interact") this.interact();
      else this.step(command.frames, command.input);
    }
  }
  snapshot() {
    return JSON.parse(
      JSON.stringify({
        seed: this.seed,
        tick: this.tick,
        config: this.config,
        world: this.world,
      }),
    ) as { seed: number; tick: number; config: RigConfig; world: unknown };
  }
}
