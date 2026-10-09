import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
const angles = process.argv[2]
  ? process.argv[2].split(",").map(Number)
  : [0, 45, 90, 180, 270, 359, 60, 61, 62, 63, 64, 65, 66];
if (angles.some((a) => !Number.isFinite(a) || a < 0 || a >= 360))
  throw Error("Angles must be comma-separated values in [0,360).");
await mkdir("artifacts", { recursive: true });
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
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 700 },
  });
  await page.goto("http://127.0.0.1:5173/?lab");
  await page.waitForFunction(() => !!window.rigLab);
  await page.evaluate(() => {
    window.rigLab.pause();
    window.rigLab.selectActor("mech");
  });
  const frames = [],
    report = [];
  let prev;
  for (const heading of angles) {
    await page.evaluate((h) => {
      window.rigLab.setHeading(h);
      window.rigLab.setAnimationTime(0.35);
    }, heading);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const state = await page.evaluate(() => window.rigLab.inspect());
    await writeFile(
      `artifacts/mech-${heading}.json`,
      JSON.stringify(state, null, 2),
    );
    const buffer = await page
      .locator("#game canvas")
      .screenshot({ path: `artifacts/mech-${heading}.png` });
    const image = PNG.sync.read(buffer);
    frames.push(image);
    let changedPixels = null,
      orderChanges = 0,
      visibilityChanges = [];
    if (prev) {
      changedPixels = pixelmatch(
        prev.image.data,
        image.data,
        null,
        image.width,
        image.height,
        { threshold: 0.15 },
      );
      orderChanges = state.drawOrder.filter(
        (id, i) => prev.state.drawOrder[i] !== id,
      ).length;
      visibilityChanges = state.components
        .filter(
          (c) =>
            prev.state.components.find((p) => p.id === c.id)?.visible !==
            c.visible,
        )
        .map((c) => c.id);
    }
    report.push({
      heading,
      tick: state.tick,
      changedPixels,
      orderChanges,
      visibilityChanges,
      diagnostics: state.diagnostics,
    });
    prev = { image, state };
  }
  const w = frames[0].width,
    h = frames[0].height,
    cols = 3,
    sheet = new PNG({
      width: w * cols,
      height: h * Math.ceil(frames.length / cols),
    });
  frames.forEach((p, i) =>
    PNG.bitblt(p, sheet, 0, 0, w, h, (i % cols) * w, Math.floor(i / cols) * h),
  );
  await writeFile("artifacts/contact-sheet.png", PNG.sync.write(sheet));
  await writeFile(
    "artifacts/sweep.json",
    JSON.stringify({ angles, report }, null, 2),
  );
  console.log(
    `Captured ${angles.length} states: artifacts/contact-sheet.png and sweep.json. Order/pixel deltas are evidence for review, not automatic artistic verdicts.`,
  );
} finally {
  await browser.close();
}
