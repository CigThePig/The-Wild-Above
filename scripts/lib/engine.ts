import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type * as SimulationModule from "../../src/animation/simulation";
import type * as ConfigModule from "../../src/animation/config";
import type * as RigModule from "../../src/animation/rig";
import type * as MechsModule from "../../src/mechs";
import type * as SchemaModule from "../../src/mechs/schema";
import type * as PaletteModule from "../../src/mechs/palette";
import type { MechSpec } from "../../src/mechs/schema";
import type { RigConfig } from "../../src/animation/config";
import type { Placement, Simulation } from "../../src/animation/simulation";

/** A registered spec ID, or a spec JSON file (possibly not registered). */
export type Target = { id: string } | { file: string };
/** "legacy": a ref from before data-driven specs, which only has the standard Mech. */
export type Design = MechSpec | "legacy";

/**
 * The game's simulation and rig code, loaded from the working tree or from
 * a git ref. Comparisons draw both with the current renderer, so differences
 * come from geometry and motion, not from drawing code.
 */
export interface Engine {
  label: string;
  sim: typeof SimulationModule;
  config: typeof ConfigModule;
  rig: typeof RigModule;
  mechs?: {
    index: typeof MechsModule;
    schema: typeof SchemaModule;
    palette: typeof PaletteModule;
  };
  readFile(path: string): string | null;
}

async function load(
  root: string,
  label: string,
  readFile: Engine["readFile"],
): Promise<Engine> {
  const mod = <T>(path: string) =>
    import(pathToFileURL(join(root, path)).href) as Promise<T>;
  const engine: Engine = {
    label,
    sim: await mod<typeof SimulationModule>("src/animation/simulation.ts"),
    config: await mod<typeof ConfigModule>("src/animation/config.ts"),
    rig: await mod<typeof RigModule>("src/animation/rig.ts"),
    readFile,
  };
  if (existsSync(join(root, "src/mechs/index.ts")))
    engine.mechs = {
      index: await mod<typeof MechsModule>("src/mechs/index.ts"),
      schema: await mod<typeof SchemaModule>("src/mechs/schema.ts"),
      palette: await mod<typeof PaletteModule>("src/mechs/palette.ts"),
    };
  return engine;
}

export const currentEngine = () =>
  load(process.cwd(), "working tree", (path) =>
    existsSync(path) ? readFileSync(path, "utf8") : null,
  );

/** Extract src/ at a ref under artifacts/ (inside the repo, so node_modules resolves). */
export async function refEngine(ref: string) {
  const git = (...args: string[]) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();
  const sha = git("rev-parse", "--verify", `${ref}^{commit}`);
  const root = resolve("artifacts/.look-cache", sha);
  if (!existsSync(join(root, "src/animation/rig.ts"))) {
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    execFileSync("tar", ["-x", "-C", root], {
      input: execFileSync("git", ["archive", "--format=tar", sha, "src"]),
    });
  }
  const engine = await load(root, `${ref} (${sha.slice(0, 7)})`, (path) => {
    try {
      return execFileSync("git", ["show", `${sha}:${path}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  });
  return { engine, sha };
}

export function resolveDesign(engine: Engine, target: Target): Design | null {
  if (!engine.mechs)
    return "id" in target && target.id === "standard" ? "legacy" : null;
  if ("file" in target) {
    const text = engine.readFile(target.file);
    return text === null
      ? null
      : engine.mechs.schema.parseMechSpec(JSON.parse(text) as unknown);
  }
  return engine.mechs.index.hasMech(target.id)
    ? engine.mechs.index.getMech(target.id)
    : null;
}

export function simulate(
  engine: Engine,
  design: Design,
  patch: Partial<RigConfig>,
  placement?: Placement,
): Simulation {
  const base = engine.config.defaultConfig;
  if (design === "legacy")
    return new engine.sim.Simulation({ ...base, ...patch }, placement);
  const color = engine.mechs!.palette.paletteHex(design.paint);
  return new engine.sim.Simulation(
    { ...base, color, ...patch },
    placement,
    design,
  );
}
