// Browserless visual review of Mech designs for agents and humans.
// Renders the game's own geometry and drawing code to labelled PNG sheets in
// about a second; open the PNGs to see the result. See docs/mechs/authoring.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import type { RigConfig } from "../src/animation/config";
import { checkMech, type MechReport } from "../src/mechs/check";
import type { MechSpec } from "../src/mechs/schema";
import {
  currentEngine,
  refEngine,
  resolveDesign,
  simulate,
  type Design,
  type Target,
} from "./lib/engine";
import {
  cellCanvas,
  diffCanvas,
  fitZoom,
  gif,
  sheet,
  shoot,
  type DrawOptions,
  type Pose,
  type Shot,
} from "./lib/render";

const USAGE = `Usage: npm run look -- [mech-id | path/to/spec.json ...] [options]
  (no targets: every registered Mech)
  --headings 0,45,90,...  turnaround headings (default: every 45°)
  --animation idle        turnaround pose: idle | walk | run (default idle)
  --time <s>              turnaround time (default 0 idle, 0.35 walk/run)
  --gait run              gait filmstrip: walk | run | none (default run)
  --gait-heading 135      filmstrip heading
  --frames 8              filmstrip frames across 0.6 s
  --boarding              add exit and reboarding stages (gameplay view)
  --guides                draw joint linkage guides
  --surfaces              draw semantic surface outlines
  --compare <git-ref>     render the same poses from <ref> (main, HEAD, a SHA)
                          and write before/after/diff images
  --gif                   animated gait GIF for human review
  --zoom <n>              fixed zoom instead of fitting the cells
  --out <dir>             output directory (default artifacts/look)
  --no-check              skip the mech:check summary`;

type Animation = RigConfig["animation"];
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const valueFlags = new Set([
  "--headings",
  "--animation",
  "--time",
  "--gait",
  "--gait-heading",
  "--frames",
  "--compare",
  "--zoom",
  "--out",
]);
const flags = new Map<string, string>(),
  targets: Target[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (valueFlags.has(a)) {
    const value = args[++i];
    if (value === undefined) throw Error(`${a} needs a value\n\n${USAGE}`);
    flags.set(a, value);
  } else if (a.startsWith("--")) flags.set(a, "true");
  else targets.push(a.endsWith(".json") ? { file: a } : { id: a });
}
const number = (flag: string, fallback: number) => {
  const value = Number(flags.get(flag) ?? fallback);
  if (!Number.isFinite(value)) throw Error(`${flag} must be a number`);
  return value;
};
const animation = (flags.get("--animation") ?? "idle") as Animation;
const gaitFlag = flags.get("--gait") ?? "run";
if (!["idle", "walk", "run"].includes(animation))
  throw Error("--animation must be idle, walk or run");
if (!["walk", "run", "none"].includes(gaitFlag))
  throw Error("--gait must be walk, run or none");
const options = {
  headings: (flags.get("--headings") ?? "0,45,90,135,180,225,270,315")
    .split(",")
    .map(Number),
  animation,
  time: number("--time", animation === "idle" ? 0 : 0.35),
  gait: gaitFlag === "none" ? null : (gaitFlag as Animation),
  gaitHeading: number("--gait-heading", 135),
  frames: number("--frames", 8),
  boarding: flags.has("--boarding"),
  compare: flags.get("--compare"),
  gif: flags.has("--gif"),
  zoom: flags.has("--zoom") ? number("--zoom", 3) : undefined,
  out: flags.get("--out") ?? "artifacts/look",
  check: !flags.has("--no-check"),
  draw: {
    guides: flags.has("--guides"),
    surfaces: flags.has("--surfaces"),
  } satisfies DrawOptions,
};
if (options.headings.some((h) => !Number.isFinite(h) || h < 0 || h >= 360))
  throw Error("--headings must be comma-separated degrees in [0, 360)");

const CELL = { w: 300, h: 270 },
  COMPARE_CELL = { w: 280, h: 250 },
  GIF_CELL = { w: 360, h: 320 };

function poses(
  engine: Awaited<ReturnType<typeof currentEngine>>,
  design: Design,
) {
  const list: Pose[] = options.headings.map((heading) => ({
    group: "turnaround",
    label: `${heading}° ${options.animation}${options.time ? ` t=${options.time}s` : ""}`,
    patch: { heading, animation: options.animation },
    run: (s) => s.seek(options.time),
    isolated: true,
  }));
  if (options.gait)
    for (let k = 0; k < options.frames; k++) {
      const t = Math.round((1 + (k * 0.6) / options.frames) * 60) / 60;
      list.push({
        group: "gait",
        label: `${options.gait} ${options.gaitHeading}° t=${t.toFixed(2)}s`,
        patch: { heading: options.gaitHeading, animation: options.gait },
        run: (s) => s.seek(t),
        isolated: true,
      });
    }
  if (options.boarding) {
    // Find each stage's middle tick once, then replay to it per pose.
    const probe = simulate(engine, design, { heading: 150, animation: "idle" });
    const spans: { phase: "exit" | "board"; stage: string; ticks: number[] }[] =
      [];
    let exitTicks = 0;
    for (const phase of ["exit", "board"] as const) {
      if (!probe.interact()) break;
      let tick = 0;
      while (probe.world.transition && tick < 1800) {
        const stage = probe.world.transition.stage;
        const last = spans.at(-1);
        if (last?.phase === phase && last.stage === stage)
          last.ticks.push(tick);
        else spans.push({ phase, stage, ticks: [tick] });
        probe.step(1, {});
        tick++;
      }
      if (phase === "exit") exitTicks = tick;
    }
    for (const span of spans) {
      const mid = span.ticks[Math.floor(span.ticks.length / 2)];
      list.push({
        group: "boarding",
        label: `${span.phase}: ${span.stage}`,
        patch: { heading: 150, animation: "idle" },
        isolated: false,
        run: (s) => {
          s.interact();
          if (span.phase === "exit") s.step(mid, {});
          else {
            s.step(exitTicks, {});
            s.interact();
            s.step(mid, {});
          }
        },
      });
    }
  }
  return list;
}

function sections(shots: Shot[]) {
  const titles: Record<string, string> = {
    turnaround: `Turnaround · ${options.animation}${options.time ? ` at ${options.time}s` : " at rest"}`,
    gait: `Gait filmstrip · ${options.gait ?? ""} heading ${options.gaitHeading}° · camera follows the Mech, ground grid shows travel`,
    boarding: "Boarding · gameplay view, middle of each stage",
  };
  return ["turnaround", "gait", "boarding"]
    .map((group) => ({
      title: titles[group],
      shots: shots.filter((s) => s.pose.group === group),
    }))
    .filter((s) => s.shots.length);
}

// Canvas labels stay ASCII: system fonts often lack check/cross glyphs.
function checkLines(report: MechReport | null) {
  if (!report) return [];
  const errors = report.findings.filter((f) => f.level === "error"),
    warnings = report.findings.filter((f) => f.level === "warning");
  return [
    `mech:check ${report.ok ? "PASS" : "FAIL"} - ${errors.length} error(s), ${warnings.length} warning(s) - footprint ${report.metrics.footprintRadius.toFixed(1)} - fragments <= ${report.metrics.maxFragments}`,
    ...report.findings
      .slice(0, 3)
      .map(
        (f) =>
          `${f.level === "error" ? "ERROR" : "WARNING"} ${f.check}${f.component ? ` ${f.component}` : ""}: ${f.message}`,
      ),
  ];
}

function compareSheet(
  title: string[],
  columns: [string, string, string],
  rows: {
    before: Canvas;
    after: Canvas;
    diff: Canvas;
    pixels: number;
  }[],
  cell: { w: number; h: number },
) {
  const headerH = 10 + title.length * 18 + 20,
    canvas = createCanvas(
      cell.w * 3,
      headerH + Math.max(1, rows.length) * cell.h,
    ),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#142925";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "14px sans-serif";
  title.forEach((line, i) => {
    ctx.fillStyle = i ? "#b8cbb3" : "#e9edd7";
    ctx.fillText(line, 8, 20 + i * 18);
  });
  ctx.font = "13px sans-serif";
  ctx.fillStyle = "#cae5c4";
  columns.forEach((c, i) => ctx.fillText(c, i * cell.w + 8, headerH - 6));
  rows.forEach((row, i) => {
    const y = headerH + i * cell.h;
    ctx.drawImage(row.before, 0, y);
    ctx.drawImage(row.after, cell.w, y);
    ctx.drawImage(row.diff, cell.w * 2, y);
    ctx.fillStyle = "#142925";
    ctx.fillRect(cell.w * 2, y, cell.w, 18);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = row.pixels ? "#ffbb93" : "#b8cbb3";
    ctx.fillText(`${row.pixels} px differ`, cell.w * 2 + 6, y + 13);
  });
  return canvas;
}

const engine = await currentEngine();
const chosen = targets.length
  ? targets
  : engine.mechs!.index.listMechs().map((s) => ({ id: s.id }));
for (const target of chosen) {
  const design = resolveDesign(engine, target);
  if (!design || design === "legacy")
    throw Error(`No Mech spec for ${JSON.stringify(target)}`);
  const spec: MechSpec = design,
    dir = join(options.out, spec.id);
  mkdirSync(dir, { recursive: true });
  const requested = poses(engine, design);
  const shots = requested.map((p) => shoot(engine, design, p));
  const report = options.check ? checkMech(spec, { quick: true }) : null;
  const outputs: Record<string, string> = {};
  let compared: Record<string, unknown> | undefined;
  let zoom = options.zoom ?? fitZoom(shots, CELL);
  const header = [
    `${spec.name} - ${spec.id} (${spec.status})`,
    ...checkLines(report),
  ];

  if (options.compare) {
    const { engine: old, sha } = await refEngine(options.compare),
      before = resolveDesign(old, target),
      ref = `${options.compare} (${sha.slice(0, 7)})`;
    if (!before) {
      compared = { ref, sha, missing: true };
      console.log(`  ${spec.id} does not exist at ${ref}; nothing to compare`);
    } else {
      const oldShots = requested.map((p) => shoot(old, before, p));
      zoom = options.zoom ?? fitZoom([...shots, ...oldShots], CELL);
      const cz = options.zoom ?? fitZoom([...shots, ...oldShots], COMPARE_CELL);
      const pairs = requested.map((pose, i) => {
        const a = cellCanvas(oldShots[i], COMPARE_CELL, cz, options.draw),
          b = cellCanvas(shots[i], COMPARE_CELL, cz, options.draw),
          d = diffCanvas(a, b);
        return {
          label: pose.label,
          group: pose.group,
          before: a,
          after: b,
          diff: d.canvas,
          pixels: d.pixels,
        };
      });
      const changed = pairs
        .filter((p) => p.pixels > 0)
        .sort((a, b) => b.pixels - a.pixels);
      const shown = changed.length ? changed.slice(0, 6) : pairs.slice(0, 1);
      writeFileSync(
        (outputs.compare = join(dir, "compare.png")),
        compareSheet(
          [
            `${spec.name}: ${ref} -> working tree`,
            changed.length
              ? `${changed.length} of ${pairs.length} poses changed; largest first${changed.length > shown.length ? ` (${changed.length - shown.length} more in report.json)` : ""}.`
              : `No pixel changes in any of ${pairs.length} poses. Showing the first pose for confirmation.`,
          ],
          [`before: ${options.compare}`, "after: working tree", "difference"],
          shown,
          COMPARE_CELL,
        ).toBuffer("image/png"),
      );
      writeFileSync(
        (outputs.before = join(dir, "before.png")),
        sheet(
          [`${spec.name} at ${ref}`],
          sections(oldShots),
          CELL,
          4,
          zoom,
          options.draw,
        ).toBuffer("image/png"),
      );
      compared = {
        ref,
        sha,
        changed: changed.map((p) => ({
          group: p.group,
          label: p.label,
          pixels: p.pixels,
        })),
        unchanged: pairs.length - changed.length,
      };
    }
  }

  writeFileSync(
    (outputs.sheet = join(dir, "sheet.png")),
    sheet(header, sections(shots), CELL, 4, zoom, options.draw).toBuffer(
      "image/png",
    ),
  );
  if (options.gif && options.gait) {
    const frames: Pose[] = [];
    for (let tick = 60; tick < 120; tick += 2)
      frames.push({
        group: "gif",
        label: `${options.gait} ${options.gaitHeading}° t=${(tick / 60).toFixed(2)}s`,
        patch: { heading: options.gaitHeading, animation: options.gait },
        run: (s) => s.step(tick),
        isolated: true,
      });
    const gifShots = frames.map((p) => shoot(engine, design, p)),
      gz = options.zoom ?? fitZoom(gifShots, GIF_CELL);
    writeFileSync(
      (outputs.gif = join(dir, "gait.gif")),
      gif(
        gifShots.map((s) => cellCanvas(s, GIF_CELL, gz, options.draw)),
        33,
      ),
    );
  }
  writeFileSync(
    (outputs.report = join(dir, "report.json")),
    JSON.stringify(
      {
        mech: { id: spec.id, name: spec.name, status: spec.status },
        options: { ...options, draw: options.draw },
        zoom,
        check: report,
        compare: compared,
        poses: shots.map((s) => ({
          group: s.pose.group,
          label: s.pose.label,
          issues: s.issues,
          occlusion: s.rig.occlusion.method,
          fragments: s.rig.occlusion.stats.fragments,
        })),
        outputs,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `${spec.id} (${spec.status}): ${report ? (report.ok ? "check ✔" : "check ✖ errors") : "check skipped"}; ${shots.length} poses, ${shots.filter((s) => s.issues.length).length} with issues`,
  );
  for (const [kind, path] of Object.entries(outputs))
    console.log(`  ${kind.padEnd(8)} ${path}`);
  if (compared && "changed" in compared)
    console.log(
      `  compare  ${(compared.changed as unknown[]).length} of ${shots.length} poses changed vs ${String(compared.ref)}`,
    );
}
