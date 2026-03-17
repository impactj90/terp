import { test, expect } from "@playwright/test";
import { navigateTo } from "./helpers/nav";

test.describe.serial("Module Settings", () => {
  test("module section visible on settings page", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");
    await expect(main.getByText("Module", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("core switch is always on and disabled", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");
    await expect(main.getByText("Module", { exact: true })).toBeVisible({ timeout: 10_000 });

    const coreSwitch = main.locator("#module-core");
    await expect(coreSwitch).toBeVisible();
    await expect(coreSwitch).toBeDisabled();
    await expect(coreSwitch).toHaveAttribute("aria-checked", "true");
  });

  test("toggle billing module off hides billing from sidebar", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");
    await expect(main.getByText("Module", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Ensure billing switch is ON first
    const billingSwitch = main.locator("#module-billing");
    await expect(billingSwitch).toBeVisible();
    const isChecked = await billingSwitch.getAttribute("aria-checked");
    if (isChecked !== "true") {
      await billingSwitch.click();
      await page.waitForTimeout(1000);
    }

    // Now disable billing
    await billingSwitch.click();
    await page.waitForTimeout(1500);

    // Sidebar should no longer show billing links (billing uses /orders/* paths)
    const sidebar = page.locator("nav[aria-label='Main navigation']");
    await expect(
      sidebar.locator(`a[href*="/orders/documents"]`),
    ).toHaveCount(0);
  });

  test("toggle billing module on shows billing in sidebar", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");
    await expect(main.getByText("Module", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Ensure billing switch is ON
    const billingSwitch = main.locator("#module-billing");
    await expect(billingSwitch).toBeVisible();
    const isChecked = await billingSwitch.getAttribute("aria-checked");
    if (isChecked !== "true") {
      await billingSwitch.click();
      await page.waitForTimeout(1500);
    }

    // Sidebar should show billing (Belege link at /orders/documents)
    const sidebar = page.locator("nav[aria-label='Main navigation']");
    await expect(
      sidebar.locator(`a[href*="/orders/documents"]`),
    ).toBeVisible();
  });
});
