import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  expectTableContains,
  clickTab,
} from "./helpers/forms";

// ---------------------------------------------------------------------------
// UC-059: Create Access Zones
// ---------------------------------------------------------------------------
test.describe.serial("UC-059: Access Zones", () => {
  test("navigate to access control page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/access-control");
    await expectPageTitle(page, "Zutrittskontrolle");
  });

  test("has three tabs: Zonen, Profile, Zuweisungen", async ({ page }) => {
    await navigateTo(page, "/admin/access-control");

    await expect(page.getByRole("tab", { name: "Zonen" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Zuweisungen" }),
    ).toBeVisible();
  });

  test("create access zone E2E-ZONE", async ({ page }) => {
    await navigateTo(page, "/admin/access-control");

    // Ensure we are on the Zonen tab
    await clickTab(page, "Zonen");

    // Click create button
    await page.getByRole("button", { name: /Neue Zone/i }).click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-ZONE");
    await fillInput(page, "name", "E2E Zone");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-ZONE");
  });
});

// ---------------------------------------------------------------------------
// UC-060: Create Access Profiles
// ---------------------------------------------------------------------------
test.describe.serial("UC-060: Access Profiles", () => {
  test("create access profile E2E-PROF", async ({ page }) => {
    await navigateTo(page, "/admin/access-control");

    // Switch to Profile tab
    await clickTab(page, "Profile");

    // Click create button
    await page.getByRole("button", { name: /Neues Profil/i }).click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-PROF");
    await fillInput(page, "name", "E2E Profil");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-PROF");
  });
});

// ---------------------------------------------------------------------------
// UC-061: Assign Profile to Employee
// ---------------------------------------------------------------------------
test.describe.serial("UC-061: Access Profile Assignments", () => {
  test("assignments tab loads correctly", async ({ page }) => {
    await navigateTo(page, "/admin/access-control");

    // Switch to Zuweisungen tab
    await clickTab(page, "Zuweisungen");

    // Verify the tab is active
    await expect(
      page.getByRole("tab", { name: "Zuweisungen" }),
    ).toHaveAttribute("data-state", "active");

    // Verify the tab content area is visible within main content
    await expect(page.locator("main#main-content")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-062: Import Terminal Bookings
// ---------------------------------------------------------------------------
test.describe.serial("UC-062: Terminal Bookings", () => {
  test("navigate to terminal bookings page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/terminal-bookings");
    await expectPageTitle(page, "Terminal-Buchungen");
  });

  test("has tabs: Buchungen and Import-Chargen", async ({ page }) => {
    await navigateTo(page, "/admin/terminal-bookings");

    await expect(
      page.getByRole("tab", { name: "Buchungen" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Import-Chargen" }),
    ).toBeVisible();
  });

  test("import tab has import trigger button", async ({ page }) => {
    await navigateTo(page, "/admin/terminal-bookings");

    // Switch to Import-Chargen tab
    await clickTab(page, "Import-Chargen");

    // Verify the tab is active
    await expect(
      page.getByRole("tab", { name: "Import-Chargen" }),
    ).toHaveAttribute("data-state", "active");

    // Look for import trigger button
    const importButton = page.getByRole("button", {
      name: /Trigger Import|Import/i,
    });
    await expect(importButton).toBeVisible();
  });
});
