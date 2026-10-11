import { z } from "zod";
import { hasMech } from "../mechs";
export const configSchema = z
  .object({
    version: z.literal(1),
    actor: z.enum(["mech", "pilot"]),
    // Optional for compatibility: configs and recordings without it use the
    // standard Mech. Values are registered spec IDs (src/mechs).
    mech: z.string().optional(),
    heading: z.number().finite().min(0).max(359.999),
    animation: z.enum(["idle", "walk", "run"]),
    speed: z.number().min(0.25).max(1.25),
    stride: z.number().min(0.5).max(1.25),
    stepHeight: z.number().min(0).max(1.5),
    bob: z.number().min(0).max(1.5),
    kneeLimit: z.number().min(30).max(180),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict()
  .refine((c) => c.mech === undefined || hasMech(c.mech), {
    path: ["mech"],
    message: "unknown mech; register its spec first",
  });
export type RigConfig = z.infer<typeof configSchema>;
export const defaultConfig: RigConfig = {
  version: 1,
  actor: "mech",
  heading: 150,
  animation: "run",
  speed: 1,
  stride: 1,
  stepHeight: 1,
  bob: 1,
  kneeLimit: 175,
  color: "#a5a082",
};
