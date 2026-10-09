import { test, expect } from "@playwright/test";
test("Rig Lab replays, selects, edits and renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?lab");
  await page.waitForFunction(() => !!window.rigLab);
  await page.evaluate(() => {
    window.rigLab.pause();
    window.rigLab.selectActor("mech");
    window.rigLab.setHeading(63);
    window.rigLab.setAnimationTime(0.35);
  });
  expect(
    await page.evaluate(() => window.rigLab.inspect().diagnostics),
  ).toEqual([]);
  const first = await page.evaluate(() => window.rigLab.inspect().components);
  await page.evaluate(() => {
    window.rigLab.setAnimationTime(1);
    window.rigLab.setAnimationTime(0.35);
  });
  expect(await page.evaluate(() => window.rigLab.inspect().components)).toEqual(
    first,
  );
  await page.getByRole("button", { name: "Step 1 frame" }).click();
  expect(await page.evaluate(() => window.rigLab.inspect().tick)).toBe(22);
  await page.locator("#components").selectOption("mech.cockpit.hatch");
  await expect(page.locator("#details")).toContainText("mech.cockpit.hatch");
  await page.evaluate(() => {
    window.rigLab.selectActor("pilot");
    window.rigLab.setAnimationTime(0.35);
  });
  await expect(page.locator("#game canvas")).toBeVisible();
  await page.screenshot({ path: "artifacts/pilot-lab.png" });
  expect(errors).toEqual([]);
});
test("playable keyboard and boarding on mobile landscape", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.waitForFunction(() => !!window.rigLab);
  await page.evaluate(() => window.rigLab.pause());
  const before = await page.evaluate(() => window.rigLab.inspect().snapshot);
  await page.evaluate(() => window.rigLab.resume());
  await page.keyboard.down("D");
  await page.waitForTimeout(400);
  await page.keyboard.up("D");
  await page.evaluate(() => window.rigLab.pause());
  expect(
    await page.evaluate(() => window.rigLab.inspect().snapshot),
  ).not.toEqual(before);
  await page.getByRole("button", { name: "Exit Mech" }).click();
  await page.evaluate(() => window.rigLab.advance(900, {}));
  expect(await page.evaluate(() => window.rigLab.inspect().control)).toBe(
    "foot",
  );
  await page.screenshot({ path: "artifacts/mobile-play.png" });
  await page.getByRole("button", { name: "Enter Mech" }).click();
  await page.evaluate(() => window.rigLab.advance(1200, {}));
  expect(await page.evaluate(() => window.rigLab.inspect().control)).toBe(
    "mech",
  );
});
test("reproducible angular inspection captures", async ({ page }) => {
  await page.goto("/?lab");
  await page.waitForFunction(() => !!window.rigLab);
  await page.evaluate(() => window.rigLab.pause());
  for (const heading of [0, 45, 63, 90, 180, 270, 359]) {
    await page.evaluate((h) => {
      window.rigLab.setHeading(h);
      window.rigLab.setAnimationTime(0.35);
    }, heading);
    await expect(page.locator("#game canvas")).toHaveScreenshot(
      `mech-${heading}.png`,
      { maxDiffPixelRatio: 0.005 },
    );
    expect(
      await page.evaluate(() => window.rigLab.inspect().diagnostics),
    ).toEqual([]);
  }
});

test("touch joystick moves and releases on landscape high-DPI browser", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForFunction(() => !!window.rigLab);
  const client = await context.newCDPSession(page);
  const box = await page.locator("#game").boundingBox();
  const x = 85,
    y = box!.y + box!.height - 85;
  await page.evaluate(() => window.rigLab.pause());
  const before = await page.evaluate(
    () => window.rigLab.inspectComponent("mech").world.x,
  );
  await page.evaluate(() => window.rigLab.resume());
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 44, y }],
  });
  await page.waitForTimeout(450);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.rigLab.pause());
  expect(
    await page.evaluate(() => window.rigLab.inspectComponent("mech").world.x),
  ).toBeGreaterThan(before + 5);
  await page.screenshot({ path: "artifacts/mobile-touch.png" });
  await context.close();
});
