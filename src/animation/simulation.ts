import { z } from "zod";
import { FIELD } from "./motion/boarding";
import { PilotWorld } from "./motion/world";
import type { Input } from "./types";
import { configSchema, defaultConfig, type RigConfig } from "./config";
import { getMech } from "../mechs";
import type { MechSpec } from "../mechs/schema";
export const DT = 1 / 60;
const MAX_REPLAY_FRAMES = 36_000;
// Each recorded step consumes at least one frame. Successful interactions
// require an intervening update, allowing at most one extra command.
const MAX_REPLAY_COMMANDS = MAX_REPLAY_FRAMES + 1;
const movementSchema = z.object({
  x: z.number().finite().min(-1).max(1).optional(),
  y: z.number().finite().min(-1).max(1).optional(),
  fast: z.boolean().optional(),
  turn: z.number().finite().min(-1).max(1).optional(),
  fire: z.boolean().optional(),
});
export const inputSchema = z.union([
  movementSchema
    .extend({ aim: z.literal(true), aimYaw: z.number().finite() })
    .strict(),
  movementSchema
    .extend({
      aim: z.literal(false).optional(),
      aimYaw: z.number().finite().optional(),
    })
    .strict(),
]);
const positionSchema = z
  .object({
    x: z.number().finite().min(FIELD.minX).max(FIELD.maxX),
    y: z.number().finite().min(FIELD.minY).max(FIELD.maxY),
  })
  .strict();
export const placementSchema = z
  .object({ mech: positionSchema, pilot: positionSchema })
  .strict();
export type Placement = z.infer<typeof placementSchema>;
const defaultPlacement: Placement = {
  mech: { x: 0, y: 0 },
  pilot: { x: 100, y: 0 },
};
const recordingSchema = z.object({
  config: configSchema,
  placement: placementSchema.optional(),
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
    .max(MAX_REPLAY_COMMANDS),
});
type Recording = z.infer<typeof recordingSchema>;
export class Simulation {
  world!: PilotWorld;
  tick = 0;
  commands: Recording["commands"] = [];
  config: RigConfig;
  readonly seed = 197;
  placement: Placement;
  /** Unregistered design under review (tooling); otherwise config.mech. */
  readonly spec: MechSpec | undefined;
  constructor(
    config: RigConfig = defaultConfig,
    placement: Placement = defaultPlacement,
    spec?: MechSpec,
  ) {
    this.spec = spec;
    this.placement = placementSchema.parse(placement);
    this.config = configSchema.parse(config);
    this.reset();
  }
  reset() {
    this.commands = [];
    this.world = new PilotWorld(this.spec ?? getMech(this.config.mech));
    this.tick = 0;
    const a = (this.config.heading * Math.PI) / 180,
      g = this.world.mech,
      { stance, ankleHeight } = g.spec.legs;
    g.yaw = g.turret = a;
    g.x = this.placement.mech.x;
    g.y = this.placement.mech.y;
    for (const f of g.feet) {
      f.p = {
        x:
          g.x +
          f.side * stance.width * Math.cos(a) -
          stance.forward * Math.sin(a),
        y:
          g.y +
          f.side * stance.width * Math.sin(a) +
          stance.forward * Math.cos(a),
        z: ankleHeight,
      };
      f.yaw = a;
    }
    this.world.pilot.place(this.placement.pilot.x, this.placement.pilot.y, a);
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
    if (frames === 0) return; // No-op calls must not exhaust command capacity.
    // The live game may run indefinitely; only the first ten minutes are
    // recordable. Do not grow an unusable command log without bound.
    if (this.tick + frames <= MAX_REPLAY_FRAMES) {
      const last = this.commands.at(-1);
      if (
        last?.kind === "step" &&
        last.frames + frames <= 3600 &&
        JSON.stringify(last.input) === JSON.stringify(checked)
      )
        last.frames += frames;
      else this.commands.push({ kind: "step", frames, input: checked });
    }
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
    // Build the replacement before committing; long playback edits restart at
    // the seek horizon rather than leaving config and motion half-applied.
    const replacement = new Simulation(c, this.placement, this.spec);
    replacement.step(Math.min(this.tick, 3600));
    this.config = replacement.config;
    this.world = replacement.world;
    this.tick = replacement.tick;
    this.commands = replacement.commands;
  }

  interact() {
    const accepted = this.world.interact();
    if (accepted && this.tick <= MAX_REPLAY_FRAMES)
      this.commands.push({ kind: "interact" });
    return accepted;
  }
  recording(): Recording {
    if (this.tick > MAX_REPLAY_FRAMES)
      throw Error(
        "Recording exceeds the 36,000-frame replay limit; reset to capture a shorter session",
      );
    // Never return a recording that replay() itself would reject.
    return recordingSchema.parse(
      structuredClone({
        config: this.config,
        placement: this.placement,
        commands: this.commands,
      }),
    );
  }
  replay(value: unknown) {
    const recording = recordingSchema.parse(value);
    if (
      recording.commands.reduce(
        (n, c) => n + (c.kind === "step" ? c.frames : 0),
        0,
      ) > MAX_REPLAY_FRAMES
    )
      throw Error("Recording too long");
    this.config = recording.config;
    this.placement =
      recording.placement ?? placementSchema.parse(defaultPlacement);
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
        placement: this.placement,
        world: this.world,
      }),
    ) as {
      seed: number;
      tick: number;
      config: RigConfig;
      placement: Placement;
      world: unknown;
    };
  }
}
