import { z } from "zod";
export const configSchema = z
  .object({
    version: z.literal(1),
    actor: z.enum(["mech", "pilot"]),
    heading: z.number().finite().min(0).max(359.999),
    animation: z.enum(["idle", "walk", "run"]),
    speed: z.number().min(0.25).max(1.25),
    stride: z.number().min(0.5).max(1.25),
    stepHeight: z.number().min(0).max(1.5),
    bob: z.number().min(0).max(1.5),
    kneeLimit: z.number().min(30).max(180),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();
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
