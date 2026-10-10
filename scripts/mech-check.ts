// Design review for Mech specs. Usage:
//   npm run mech:check                      every registered spec
//   npm run mech:check -- scout             one registered spec
//   npm run mech:check -- path/to/spec.json an unregistered draft file
//   flags: --quick (fewer poses), --json (machine-readable report)
import { readFileSync } from "node:fs";
import { getMech, listMechs } from "../src/mechs";
import { parseMechSpec, type MechSpec } from "../src/mechs/schema";
import { checkMech } from "../src/mechs/check";

const args = process.argv.slice(2),
  quick = args.includes("--quick"),
  json = args.includes("--json"),
  targets = args.filter((a) => !a.startsWith("--"));
const load = (target: string): MechSpec =>
  target.endsWith(".json")
    ? parseMechSpec(JSON.parse(readFileSync(target, "utf8")))
    : getMech(target);
const reports = (targets.length ? targets.map(load) : listMechs()).map((spec) =>
  checkMech(spec, { quick }),
);
if (json) console.log(JSON.stringify(reports, null, 2));
else
  for (const r of reports) {
    const m = r.metrics;
    console.log(`\n${r.id} — ${r.name} (${r.status})`);
    if (!r.findings.length) console.log("  ✔ no findings");
    for (const f of r.findings)
      console.log(
        `  ${f.level === "error" ? "✖ error  " : "⚠ warning"} ${f.check}${f.component ? ` ${f.component}` : ""}: ${f.message}`,
      );
    console.log(
      `  standing hip ${m.standingHipHeight.toFixed(1)} · footprint ${m.footprintRadius.toFixed(1)} · knee flexion ≤ ${m.maxKneeFlexion.toFixed(0)}° · fragments ≤ ${m.maxFragments} · pair checks ≤ ${m.maxComparisons} · build ${m.medianBuildMs.toFixed(1)} ms median / ${m.p95BuildMs.toFixed(1)} p95 (${m.sampledPoses} poses)`,
    );
  }
process.exitCode = reports.every((r) => r.ok) ? 0 : 1;
