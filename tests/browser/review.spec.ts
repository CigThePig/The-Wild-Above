import { test, expect } from "@playwright/test";
import { defaultConfig } from "../../src/animation/config";
test("review failures are reproducible and fixed through the public automation API", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?lab");
  await page.waitForFunction(() => window.rigLab);
  await page.evaluate(() => {
    window.rigLab.pause();
    window.rigLab.setIsolation(false);
    window.rigLab.setGuides(false);
    window.rigLab.selectComponent("");
  });
  expect(await page.evaluate(() => window.rigLab.inspect().selected)).toBe("");
  // Corner exit from the exact reviewed state, with recorded initial placement.
  await page.evaluate(
    (config) =>
      window.rigLab.replay({
        config: { ...config, heading: 270, animation: "idle" },
        placement: { mech: { x: -435, y: -330 }, pilot: { x: -383, y: -300 } },
        commands: [],
      }),
    defaultConfig,
  );
  expect(await page.evaluate(() => window.rigLab.interact())).toBe(true);
  await page.evaluate(() => window.rigLab.advance(1200, {}));
  expect(await page.evaluate(() => window.rigLab.inspect().control)).toBe(
    "foot",
  );
  expect(
    await page.evaluate(() => window.rigLab.inspect().transition),
  ).toBeNull();
  // Opposite-side approach near the edge must go around the machine.
  await page.evaluate(
    (config) =>
      window.rigLab.replay({
        config: { ...config, actor: "pilot", heading: 0, animation: "idle" },
        placement: { mech: { x: -400, y: -300 }, pilot: { x: -434, y: -300 } },
        commands: [],
      }),
    defaultConfig,
  );
  expect(await page.evaluate(() => window.rigLab.interact())).toBe(true);
  let sawFade = false;
  for (let i = 0; i < 120; i++) {
    await page.evaluate(() => window.rigLab.advance(6, {}));
    const state = await page.evaluate(() => window.rigLab.inspect());
    if (state.transition?.stage === "seat") {
      const pilot = state.components.find((c) => c.id === "pilot");
      if (pilot && pilot.opacity > 0 && pilot.opacity < 1) {
        sawFade = true;
        expect(pilot.visible).toBe(true);
      }
    }
  }
  expect(sawFade).toBe(true);
  expect(await page.evaluate(() => window.rigLab.inspect().control)).toBe(
    "mech",
  );
  expect(
    await page.evaluate(() => window.rigLab.inspect().transition),
  ).toBeNull();
  const result = await page.evaluate(() => {
    const api = window.rigLab,
      before = JSON.stringify(api.inspect().snapshot);
    let rejected = false;
    try {
      api.advance(1, JSON.parse('{"aim":true}'));
    } catch {
      rejected = true;
    }
    return {
      rejected,
      unchanged: before === JSON.stringify(api.inspect().snapshot),
    };
  });
  expect(result).toEqual({ rejected: true, unchanged: true });
  await page.evaluate(() => {
    window.rigLab.advance(3600, {});
    window.rigLab.advance(60, {});
    window.rigLab.configure({ speed: 0.75 });
  });
  expect(await page.evaluate(() => window.rigLab.inspect().tick)).toBe(3600);
  expect(
    await page.evaluate(() => window.rigLab.inspect().diagnostics),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("holding F cannot cause an automatic reboard after exiting", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.rigLab);
  await page.evaluate(() => window.rigLab.pause());
  await page.keyboard.down("f");
  expect(await page.evaluate(() => window.rigLab.inspect().transition?.exiting)).toBe(true);
  await page.evaluate(() => window.rigLab.advance(1200, {}));
  expect(await page.evaluate(() => window.rigLab.inspect().control)).toBe("foot");
  expect(await page.evaluate(() => window.rigLab.inspect().transition)).toBeNull();
  // Playwright marks another keydown as repeat while that key is held.
  await page.keyboard.down("f");
  expect(await page.evaluate(() => window.rigLab.inspect().transition)).toBeNull();
  await page.keyboard.up("f");
  await page.keyboard.down("f");
  expect(await page.evaluate(() => window.rigLab.inspect().transition?.exiting)).toBe(false);
  await page.keyboard.up("f");
});

test("live Rig Lab timing and pause controls follow the simulation", async ({ page }) => {
  await page.goto("/?lab");
  await page.waitForFunction(() => !!window.rigLab);
  const paused = page.locator(".tp-lblv").filter({ has: page.getByText("paused", { exact: true }) }).locator('input[type="checkbox"]');
  const elapsed = page.locator(".tp-lblv").filter({ has: page.getByText("Elapsed (s)", { exact: true }) }).locator("input");
  await expect(paused).toBeChecked();
  await page.evaluate(() => window.rigLab.resume());
  await expect(paused).not.toBeChecked();
  await page.waitForFunction(() => window.rigLab.inspect().tick >= 12);
  await expect.poll(async () => Number(await elapsed.inputValue())).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.rigLab.pause();
    window.rigLab.advance(3600, {});
    window.rigLab.advance(60, {});
  });
  await expect(paused).toBeChecked();
  await expect.poll(async () => Number(await elapsed.inputValue())).toBeGreaterThan(60);
});
