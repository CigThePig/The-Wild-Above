import { chromium } from "@playwright/test";
import { setTimeout } from "node:timers";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import assert from "node:assert/strict";
const output = process.env.CAPTURE_OUTPUT ?? "artifacts/surfaces";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const report = {
  browser: browser.version(),
  baseline: process.env.BASELINE_URL ?? null,
  states: [],
  performance: [],
};
const headings = process.env.CAPTURE_HEADINGS?.split(",").map(Number) ?? [
  0, 45, 60, 61, 62, 63, 64, 65, 66, 86, 87, 88, 89, 90, 91, 92, 93, 94, 180,
  268, 269, 270, 271, 272, 273, 274, 359,
];
const sheet = async (name, frames, cols = 6) => {
  const out = new PNG({
    width: 400 * cols,
    height: 360 * Math.ceil(frames.length / cols),
  });
  frames.forEach((f, i) =>
    PNG.bitblt(
      f,
      out,
      0,
      0,
      400,
      360,
      (i % cols) * 400,
      Math.floor(i / cols) * 360,
    ),
  );
  await writeFile(`${output}/${name}.png`, PNG.sync.write(out));
};
try {
  for (const [label, url] of [
    ["after", "http://127.0.0.1:5173"],
    ...(process.env.BASELINE_URL ? [["before", process.env.BASELINE_URL]] : []),
  ]) {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 700 },
    });
    const deadline = Date.now() + 30000;
    while (true) {
      try {
        await page.goto(`${url}/?lab`);
        break;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    await page.waitForFunction(() => window.rigLab);
    await page.evaluate(() => {
      window.rigLab.pause();
      window.rigLab.setGuides(false);
      window.rigLab.selectComponent("");
    });
    const crop = async () => {
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      const img = PNG.sync.read(
          await page.locator("#game canvas").screenshot(),
        ),
        p = new PNG({ width: 400, height: 360 });
      PNG.bitblt(
        img,
        p,
        Math.floor(img.width / 2 - 200),
        Math.floor(img.height / 2 - 180),
        400,
        360,
        0,
        0,
      );
      return p;
    };
    for (const time of process.env.CAPTURE_TIMES?.split(",").map(Number) ?? [
      0.35, 1.5,
    ]) {
      const frames = [];
      for (const heading of headings) {
        await page.evaluate(
          ({ heading, time }) => {
            window.rigLab.configure({ heading, animation: "run" });
            window.rigLab.setAnimationTime(time);
          },
          { heading, time },
        );
        const state = await page.evaluate(() => ({
          basic: window.rigLab.inspect(),
          occlusion: window.rigLab.inspectOcclusion?.(),
        }));
        assert.deepEqual(state.basic.diagnostics, []);
        if (state.occlusion) assert.deepEqual(state.occlusion.diagnostics, []);
        const p = await crop();
        frames.push(p);
        await writeFile(
          `${output}/${label}-${time}-${heading}.png`,
          PNG.sync.write(p),
        );
        report.states.push({
          label,
          time,
          heading,
          stats: state.occlusion?.stats,
          method: state.occlusion?.method,
          diagnostics: state.occlusion?.diagnostics,
        });
      }
      await sheet(`${label}-phase-${time}`, frames);
    }
    // Timed synchronous refreshes avoid screenshot / requestAnimationFrame costs.
    // Independent same-pose CPU samples, warmed before collecting; rendering submission
    // is included, GPU execution / Android hardware is not.
    for (const heading of [0, 45, 63, 90, 180, 270]) {
      const samples = await page.evaluate((heading) => {
        window.rigLab.configure({ animation: "run", heading });
        window.rigLab.setAnimationTime(0.35);
        for (let i = 0; i < 80; i++) window.rigLab.selectComponent("");
        const out = [];
        for (let i = 0; i < 300; i++) {
          window.rigLab.selectComponent("");
          out.push(
            window.rigLab.inspectPerformance?.() ??
              window.rigLab.inspect().performance,
          );
        }
        return out;
      }, heading);
      const summary = { label, heading };
      for (const key of ["renderMs", "generationMs", "resolutionMs"]) {
        const a = samples
          .map((s) => s[key])
          .filter((x) => x !== undefined)
          .sort((a, b) => a - b);
        if (a.length)
          summary[key] = {
            median: a[Math.floor(a.length * 0.5)],
            p95: a[Math.floor(a.length * 0.95)],
            max: a.at(-1),
          };
      }
      report.performance.push({ ...summary, samples });
    }
    await page.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      report.performance.map((s) => ({
        label: s.label,
        heading: s.heading,
        renderMs: s.renderMs,
        generationMs: s.generationMs,
        resolutionMs: s.resolutionMs,
      })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
