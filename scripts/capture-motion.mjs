import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import assert from "node:assert/strict";
const output = "artifacts/motion";
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
const report = { locomotion: [], rotation: [], boarding: [], sweeps: [] };
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 700 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/?lab");
  await page.waitForFunction(() => window.rigLab);
  await page.evaluate(() => {
    window.rigLab.pause();
    window.rigLab.setGuides(false);
    window.rigLab.selectComponent("");
  });
  const base = await page.evaluate(() => window.rigLab.inspect().config);
  const load = async (config, placement) =>
    page.evaluate(
      ({ config, placement }) =>
        window.rigLab.replay({ config, placement, commands: [] }),
      { config, placement },
    );
  const capture = async (name) => {
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const buffer = await page.locator("#game canvas").screenshot();
    const image = PNG.sync.read(buffer),
      crop = new PNG({ width: 400, height: 360 });
    PNG.bitblt(
      image,
      crop,
      Math.floor(image.width / 2 - 200),
      Math.floor(image.height / 2 - 180),
      400,
      360,
      0,
      0,
    );
    if (name) await writeFile(`${output}/${name}.png`, PNG.sync.write(crop));
    return crop;
  };
  const sheet = async (name, frames) => {
    const image = new PNG({
      width: 400 * 4,
      height: 360 * Math.ceil(frames.length / 4),
    });
    frames.forEach((f, i) =>
      PNG.bitblt(
        f,
        image,
        0,
        0,
        400,
        360,
        (i % 4) * 400,
        Math.floor(i / 4) * 360,
      ),
    );
    await writeFile(`${output}/${name}.png`, PNG.sync.write(image));
  };
  for (const actor of ["mech", "pilot"]) {
    await load({ ...base, actor, animation: "run" });
    await page.evaluate(() => window.rigLab.setIsolation(true));
    const frames = [await capture(`${actor}-run-0`)];
    for (let group = 0; group < 600; group++) {
      const t = group * 0.2;
      await page.evaluate((input) => window.rigLab.advance(12, input), {
        x: Math.cos(t * 0.75),
        y: Math.sin(t * 0.75),
        fast: true,
      });
      const state = await page.evaluate(() => window.rigLab.inspect());
      assert.deepEqual(state.diagnostics, []);
      assert.deepEqual(state.occlusionDiagnostics, []);
      if ([24, 74, 149, 299, 449, 599].includes(group)) {
        const seconds = (group + 1) * 0.2;
        frames.push(await capture(`${actor}-run-${seconds}`));
        report.locomotion.push({
          actor,
          seconds,
          tick: state.tick,
          diagnostics: state.diagnostics,
        });
      }
    }
    const record = await page.evaluate(() => window.rigLab.recording()),
      final = await page.evaluate(() => window.rigLab.inspect().snapshot);
    await page.evaluate((record) => window.rigLab.replay(record), record);
    assert.deepEqual(
      await page.evaluate(() => window.rigLab.inspect().snapshot),
      final,
    );
    await writeFile(
      `${output}/${actor}-run-recording.json`,
      JSON.stringify(record, null, 2),
    );
    await sheet(`${actor}-run-sheet`, frames);
    console.log(`${actor}: 120 seconds movement and recording replay passed`);
    await load({ ...base, actor, animation: "idle" });
    const rotation = [];
    for (let i = 0; i < 100; i++) {
      await page.evaluate(() => window.rigLab.advance(12, { turn: 1 }));
      const state = await page.evaluate(() => window.rigLab.inspect());
      assert.deepEqual(state.diagnostics, []);
      assert.deepEqual(state.occlusionDiagnostics, []);
      if (i % 6 === 0) {
        rotation.push(await capture(`${actor}-turn-${i}`));
        report.rotation.push({
          actor,
          tick: state.tick,
          heading: (state.snapshot.world[actor].yaw * 180) / Math.PI,
          diagnostics: state.diagnostics,
        });
      }
    }
    await sheet(`${actor}-turn-sheet`, rotation);
    console.log(`${actor}: 20 seconds stationary turns passed`);
  }
  // Two gait phases, full angular coverage. Largest raster deltas are saved for review.
  for (const actor of ["mech", "pilot"])
    for (const time of [0.35, 1.5]) {
      const placement =
        actor === "pilot"
          ? { mech: { x: -400, y: -300 }, pilot: { x: 100, y: 0 } }
          : undefined;
      await load({ ...base, actor, animation: "run" }, placement);
      let previous;
      const deltas = [],
        largest = [],
        overview = [],
        surfaceStats = [];
      for (let heading = 0; heading <= 360; heading += 2) {
        const h = heading === 360 ? 0 : heading;
        await page.evaluate(
          ({ h, time }) => {
            window.rigLab.setHeading(h);
            window.rigLab.setAnimationTime(time);
          },
          { h, time },
        );
        const state = await page.evaluate(() => window.rigLab.inspect());
        assert.deepEqual(state.diagnostics, []);
        assert.deepEqual(state.occlusionDiagnostics, []);
        const image = await capture();
        if (heading % 30 === 0 && heading < 360) overview.push(image);
        surfaceStats.push({
          heading,
          method: state.occlusionMethod,
          ...state.surfaceStats,
        });
        if (previous) {
          const changed = pixelmatch(
            previous.image.data,
            image.data,
            null,
            400,
            360,
            { threshold: 0.15 },
          );
          const entry = {
            from: previous.heading,
            to: heading,
            changedPixels: changed,
            visibilityChanges: state.components
              .filter(
                (c) =>
                  previous.state.components.find((p) => p.id === c.id)
                    ?.visible !== c.visible,
              )
              .map((c) => c.id),
            orderChanges: state.drawOrder.filter(
              (id, i) => previous.state.drawOrder[i] !== id,
            ).length,
          };
          deltas.push(entry);
          largest.push({ ...entry, before: previous.image, after: image });
          largest.sort((a, b) => b.changedPixels - a.changedPixels);
          largest.length = Math.min(3, largest.length);
        }
        previous = { heading, image, state };
      }
      await sheet(`${actor}-phase-${time}-overview`, overview);
      const frames = [];
      for (const item of largest) {
        frames.push(item.before, item.after);
        delete item.before;
        delete item.after;
      }
      await sheet(`${actor}-phase-${time}-largest-deltas`, frames);
      report.sweeps.push({
        actor,
        time,
        step: 2,
        deltas,
        largest,
        surfaceStats,
      });
      await writeFile(
        `${output}/${actor}-phase-${time}-deltas.json`,
        JSON.stringify({ actor, time, deltas, largest }, null, 2),
      );
      console.log(
        `${actor} phase ${time}: full 360 degree raster sweep captured`,
      );
    }
  // Capture both boarding directions stage by stage, including fades and opacity.
  for (const name of ["center", "corner", "edge-approach"]) {
    const corner = name === "corner",
      edge = name === "edge-approach";
    await load(
      {
        ...base,
        actor: edge ? "pilot" : "mech",
        heading: corner ? 270 : edge ? 0 : 180,
        animation: "idle",
      },
      corner
        ? { mech: { x: -435, y: -330 }, pilot: { x: -383, y: -300 } }
        : edge
          ? { mech: { x: -400, y: -300 }, pilot: { x: -434, y: -300 } }
          : undefined,
    );
    await page.evaluate(() => window.rigLab.setIsolation(false));
    const frames = [],
      samples = [];
    const transfers = edge ? 1 : 2;
    for (let transfer = 0; transfer < transfers; transfer++) {
      assert.equal(await page.evaluate(() => window.rigLab.interact()), true);
      let seen = new Set();
      for (let i = 0; i < 200; i++) {
        await page.evaluate(() => window.rigLab.advance(3, {}));
        const state = await page.evaluate(() => window.rigLab.inspect());
        assert.deepEqual(state.diagnostics, []);
        assert.deepEqual(state.occlusionDiagnostics, []);
        const stage = state.transition?.stage ?? "done",
          pilot = state.components.find((c) => c.id === "pilot");
        const key = `${transfer}-${stage}${pilot && pilot.opacity > 0.05 && pilot.opacity < 0.95 ? "-fade" : ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          frames.push(await capture(`${name}-${key}`));
          samples.push({
            key,
            tick: state.tick,
            stage,
            pilotOpacity: pilot?.opacity,
            pilotVisible: pilot?.visible,
          });
        }
        if (!state.transition) break;
      }
      assert.equal(
        (await page.evaluate(() => window.rigLab.inspect())).transition,
        null,
      );
    }
    await sheet(`${name}-boarding-sheet`, frames);
    report.boarding.push({
      name,
      samples,
      recording: await page.evaluate(() => window.rigLab.recording()),
    });
    console.log(`${name}: boarding stage captures completed`);
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log("Reviewed evidence available in artifacts/motion/");
} finally {
  await browser.close();
}
