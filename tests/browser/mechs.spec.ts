import { test, expect } from "@playwright/test";
import standard from "../../src/mechs/specs/standard.json" with { type: "json" };

test("Rig Lab previews, selects and checks Mech specs live", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?lab");
  await page.waitForFunction(() => !!window.rigLab);
  await page.evaluate(() => window.rigLab.pause());
  expect(
    await page.evaluate(() => window.rigLab.listMechs().map((m) => m.id)),
  ).toContain("standard");
  const draft = {
    ...standard,
    id: "lab-preview",
    status: "draft",
    paint: "ochre",
  };
  expect(
    await page.evaluate((spec) => window.rigLab.previewMech(spec), draft),
  ).toEqual({ id: "lab-preview", status: "draft" });
  const state = await page.evaluate(() => {
    window.rigLab.setHeading(45);
    window.rigLab.setAnimationTime(0.35);
    return window.rigLab.inspect();
  });
  expect(state.mech).toEqual({
    id: "lab-preview",
    name: standard.name,
    status: "draft",
  });
  expect(state.config).toMatchObject({ mech: "lab-preview", color: "#b99b64" });
  expect(state.diagnostics).toEqual([]);
  await expect(
    page.locator(".tp-lblv").filter({ hasText: "design" }).locator("select"),
  ).toContainText(`${standard.name} (draft)`);
  expect(await page.evaluate(() => window.rigLab.checkMech().ok)).toBe(true);
  // Invalid specs are rejected with the failing path, without changing state.
  const rejected = await page.evaluate(() => {
    try {
      window.rigLab.previewMech('{"id":"broken"}');
      return "";
    } catch (error) {
      return String(error);
    }
  });
  expect(rejected).toMatch(/version|legs/);
  expect(await page.evaluate(() => window.rigLab.inspect().mech.id)).toBe(
    "lab-preview",
  );
  await page
    .locator("#game canvas")
    .screenshot({ path: "artifacts/mech-preview.png" });
  await page.evaluate(() => window.rigLab.selectMech("standard"));
  expect(await page.evaluate(() => window.rigLab.inspect().config.color)).toBe(
    "#a5a082",
  );
  expect(errors).toEqual([]);
});
