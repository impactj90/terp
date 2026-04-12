import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  expectTableContains,
  waitForSheet,
} from "./helpers/forms";

// ---------------------------------------------------------------------------
// UC-002: User Groups
// ---------------------------------------------------------------------------
test.describe.serial("UC-002: User Groups", () => {
  test("navigate to user-groups page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/user-groups");
    await expectPageTitle(page, "Benutzergruppen");
  });

  test("create a user group", async ({ page }) => {
    await navigateTo(page, "/admin/user-groups");

    // Click the create button
    await page.getByRole("button", { name: "Neue Gruppe" }).click();

    // Wait for sheet to open
    await waitForSheet(page);

    // Fill the form
    await fillInput(page, "code", "E2E-GRP");
    await fillInput(page, "name", "E2E Testgruppe");
    await fillInput(page, "description", "Testgruppe");

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Verify the group appears (card layout, not table)
    await expect(page.getByText("E2E Testgruppe")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-003: Users
// ---------------------------------------------------------------------------
test.describe.serial("UC-003: Users", () => {
  test("navigate to users page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/users");
    await expectPageTitle(page, "Benutzer");
  });

  test("create a user", async ({ page }) => {
    await navigateTo(page, "/admin/users");

    // Click the create button
    await page.getByRole("button", { name: "Neuer Benutzer" }).click();

    // Wait for sheet to open
    await waitForSheet(page);

    // Fill the form
    await fillInput(page, "email", "e2e-test@dev.local");
    await fillInput(page, "username", "e2e-test");
    await fillInput(page, "displayName", "E2E Test User");
    await fillInput(page, "password", "test-password-123");

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Verify user appears (card layout, not a table)
    await expect(page.getByText("E2E Test User")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-005: Holidays
// ---------------------------------------------------------------------------
test.describe.serial("UC-005: Holidays", () => {
  test("navigate to holidays page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/holidays");
    await expectPageTitle(page, "Feiertage");
  });

  test("generate holidays for a Bundesland", async ({ page }) => {
    await navigateTo(page, "/admin/holidays");

    // Click the "Generieren" outline button
    await page.getByRole("button", { name: "Generieren" }).click();

    // Wait for the generate dialog to appear
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });

    // Seed already has holidays for the current year; generate for next year
    const yearInput = dialog.locator("#generateYear");
    await yearInput.clear();
    await yearInput.fill("2027");

    // Bundesland defaults to Bayern — just confirm
    await dialog.getByRole("button", { name: "Generieren" }).click();

    // Wait for dialog to close (success)
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Verify holidays appear
    await expect(
      page.getByText(/Feiertag/).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// UC-006: Absence Types
// ---------------------------------------------------------------------------
test.describe.serial("UC-006: Absence Types", () => {
  test("navigate to absence-types page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/absence-types");
    await expectPageTitle(page, "Abwesenheitsarten");
  });

  test("create an absence type", async ({ page }) => {
    await navigateTo(page, "/admin/absence-types");

    // Click the create button
    await page
      .getByRole("button", { name: "Neue Abwesenheitsart" })
      .click();

    // Wait for sheet to open
    await waitForSheet(page);

    // Fill the form (code must start with U, K, or S)
    await fillInput(page, "code", "UE2E");
    await fillInput(page, "name", "E2E Abwesenheit");

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Verify in table
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E Abwesenheit");
  });
});

// ---------------------------------------------------------------------------
// UC-007: Booking Types
// ---------------------------------------------------------------------------
test.describe.serial("UC-007: Booking Types", () => {
  test("navigate to booking-types page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/booking-types");
    await expectPageTitle(page, "Buchungstypen");
  });

  test("verify system booking types exist", async ({ page }) => {
    await navigateTo(page, "/admin/booking-types");
    await waitForTableLoad(page);

    // There should be pre-existing system entries
    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("create a booking type", async ({ page }) => {
    await navigateTo(page, "/admin/booking-types");

    // Click the create button
    await page.getByRole("button", { name: "Neuer Buchungstyp" }).click();

    // Wait for sheet to open
    await waitForSheet(page);

    // Fill the form
    await fillInput(page, "code", "E2E-BT");
    await fillInput(page, "name", "E2E Buchungstyp");

    // Select direction (Richtung) — required field
    await selectOption(page, "Richtung", /EIN/);

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Verify in table
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E Buchungstyp");
  });
});

// ---------------------------------------------------------------------------
// UC-008: Contact Types
// ---------------------------------------------------------------------------
test.describe.serial("UC-008: Contact Types", () => {
  test("navigate to contact-types page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/contact-types");
    await expectPageTitle(page, "Kontaktarten");
  });

  test("create a contact type", async ({ page }) => {
    await navigateTo(page, "/admin/contact-types");

    // Two-panel layout: click "Typ hinzufügen" in the left panel
    await page.getByRole("button", { name: "Typ hinzufügen" }).click();

    // Wait for sheet to open
    await waitForSheet(page);

    // Fill the form
    await fillInput(page, "code", "E2E-CT");
    await fillInput(page, "name", "E2E Kontaktart");

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Verify the new type appears in the left panel
    await expect(page.getByText("E2E Kontaktart")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-009: Employment Types
// ---------------------------------------------------------------------------
test.describe.serial("UC-009: Employment Types", () => {
  test("navigate to employment-types page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/employment-types");
    await expectPageTitle(page, "Beschäftigungsarten");
  });

  test("create an employment type", async ({ page }) => {
    await navigateTo(page, "/admin/employment-types");

    // Click the create button
    await page
      .getByRole("button", { name: "Neue Beschäftigungsart" })
      .click();

    // Wait for sheet to open
    await waitForSheet(page);

    // Fill the form
    await fillInput(page, "code", "E2E-ET");
    await fillInput(page, "name", "E2E Beschäftigungsart");

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Verify in table
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E Beschäftigungsart");
  });
});

// ---------------------------------------------------------------------------
// UC-010: Cost Centers
// ---------------------------------------------------------------------------
test.describe.serial("UC-010: Cost Centers", () => {
  test("navigate to cost-centers page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/cost-centers");
    await expectPageTitle(page, "Kostenstellen");
  });

  test("create a cost center", async ({ page }) => {
    await navigateTo(page, "/admin/cost-centers");

    // Click the create button
    await page.getByRole("button", { name: "Neue Kostenstelle" }).click();

    // Wait for sheet to open
    await waitForSheet(page);

    // Fill the form
    await fillInput(page, "code", "E2E-CC");
    await fillInput(page, "name", "E2E Kostenstelle");

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Verify in table
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E Kostenstelle");
  });
});

// ---------------------------------------------------------------------------
// UC-011: Locations
// ---------------------------------------------------------------------------
test.describe.serial("UC-011: Locations", () => {
  test("navigate to locations page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/locations");
    await expectPageTitle(page, "Standorte");
  });

  test("create a location", async ({ page }) => {
    await navigateTo(page, "/admin/locations");

    // Click the create button
    await page.getByRole("button", { name: "Neuer Standort" }).click();

    // Wait for sheet to open
    await waitForSheet(page);

    // Fill the form
    await fillInput(page, "code", "E2E-LOC");
    await fillInput(page, "name", "E2E Standort");

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Verify in table
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E Standort");
  });
});

// ---------------------------------------------------------------------------
// UC-004: Login / Logout Flow
// NOTE: Only tests login here. Logout is tested in 12-system.spec.ts (last)
// because Supabase signOut() invalidates the server-side session token,
// breaking all subsequent tests that rely on the stored admin session.
// ---------------------------------------------------------------------------
test.describe.serial("UC-004: Login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login with credentials", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();

    await page.locator("#email").fill("admin@dev.local");
    await page.locator("#password").fill("dev-password-admin");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();

    // Verify redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await expect(page.locator("main#main-content")).toBeVisible();
  });
});
