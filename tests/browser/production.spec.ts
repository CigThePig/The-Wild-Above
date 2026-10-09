import { test, expect } from "@playwright/test";
test("production renders gameplay and excludes development automation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4173/?lab");
  await expect(page.locator("#game canvas")).toBeVisible();
  await expect(page.locator("#status")).toContainText("MECH");
  expect(await page.evaluate(() => Object.hasOwn(window, "rigLab"))).toBe(
    false,
  );
  await expect(page.locator("#lab-link")).toHaveCount(0);
  await expect(page.locator("#inspector")).toBeHidden();
  await page.getByRole("button", { name: "Exit Mech" }).click();
  await expect(page.getByRole("button", { name: "Enter Mech" })).toBeEnabled({
    timeout: 15000,
  });
  await page.screenshot({ path: "artifacts/production.png" });
  expect(errors).toEqual([]);
});
