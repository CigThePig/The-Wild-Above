import { test, expect } from "@playwright/test";
test("surfaces expose real geometry, geometric order and deterministic replay", async ({
  page,
}) => {
  await page.goto("/?lab");
  await page.waitForFunction(() => window.rigLab);
  await page.evaluate(() => {
    window.rigLab.pause();
    window.rigLab.setGuides(false);
    window.rigLab.configure({ animation: "run", heading: 89 });
    window.rigLab.setAnimationTime(0.35);
  });
  const before = await page.evaluate(() => window.rigLab.inspectOcclusion());
  expect(before.surfaces).toHaveLength(70);
  expect(before.diagnostics).toEqual([]);
  expect(before.decisions.some((d) => d.relation === "crossing")).toBe(true);
  const face = await page.evaluate(() =>
    window.rigLab.inspectSurface("mech.torso.top"),
  );
  expect(face.component).toBe("mech.torso");
  expect(face.normal.z).toBeCloseTo(1);
  expect(face.decisions.length).toBeGreaterThan(0);
  await page.locator("#surfaces").selectOption("mech.torso.top");
  await expect(page.locator("#details")).toContainText("mech.torso.top");
  await page.evaluate(() => window.rigLab.setSurfaceGuides(true));
  await page
    .locator("#game canvas")
    .screenshot({ path: "artifacts/surface-guides.png" });
  await page.evaluate(() => {
    window.rigLab.setSurfaceGuides(false);
    window.rigLab.selectSurface("");
    window.rigLab.advance(60, {
      x: 0.8,
      y: -0.2,
      aim: true,
      aimYaw: 2,
      fire: true,
    });
  });
  const state = await page.evaluate(() => ({
    record: window.rigLab.recording(),
    surfaces: window.rigLab.inspectOcclusion().surfaces,
  }));
  await page.evaluate((record) => window.rigLab.replay(record), state.record);
  expect(
    await page.evaluate(() => window.rigLab.inspectOcclusion().surfaces),
  ).toEqual(state.surfaces);
  for (const time of [0.35, 1.5])
    for (const heading of [
      0, 60, 63, 66, 86, 88, 89, 90, 91, 92, 94, 180, 268, 270, 272, 274, 359,
    ]) {
      await page.evaluate(
        ({ time, heading }) => {
          window.rigLab.setHeading(heading);
          window.rigLab.setAnimationTime(time);
        },
        { time, heading },
      );
      const state = await page.evaluate(() => window.rigLab.inspectOcclusion());
      expect(state.diagnostics).toEqual([]);
      expect(state.surfaces.map((s) => s.id)).toEqual(
        before.surfaces.map((s) => s.id),
      );
    }
});
