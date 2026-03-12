import { test, expect } from "@playwright/test";
import { navigateTo, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  clickTab,
  expectToastSuccess,
  waitForSheet,
} from "./helpers/forms";

// ---------------------------------------------------------------------------
// UC-027: Dashboard
// ---------------------------------------------------------------------------
test.describe("UC-027: Dashboard", () => {
  test("navigate to dashboard and verify content", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    // Dashboard should display greeting or cards
    const main = page.locator("main#main-content");
    await expect(main).toBeVisible();

    // Verify stat cards are visible (today's schedule, hours, vacation, flextime)
    // StatsCard uses plain divs with "rounded-lg border bg-card", not <Card data-slot="card">
    const cards = main.locator(".rounded-lg.border");
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test("verify quick action buttons exist", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    const main = page.locator("main#main-content");
    // Quick actions area should have clickable buttons or links
    const buttons = main.getByRole("button");
    await expect(buttons.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// UC-028 & UC-029: Clock In / Clock Out (serial)
// ---------------------------------------------------------------------------
test.describe.serial("UC-028 & UC-029: Time Clock", () => {
  test("UC-028: navigate to time clock page", async ({ page }) => {
    await navigateTo(page, "/time-clock");
    await expectPageTitle(page, "Stempeluhr");

    // Current time display should be visible
    const main = page.locator("main#main-content");
    await expect(main).toBeVisible();
  });

  test("UC-028: verify clock buttons and status display", async ({ page }) => {
    await navigateTo(page, "/time-clock");
    await expectPageTitle(page, "Stempeluhr");

    const main = page.locator("main#main-content");

    // The clock page shows either Einstempeln or Ausstempeln depending on state
    const clockInButton = main.getByRole("button", { name: /einstempeln/i });
    const clockOutButton = main.getByRole("button", { name: /ausstempeln/i });
    await expect(clockInButton.or(clockOutButton)).toBeVisible({ timeout: 10_000 });

    // Verify the day overview section is visible
    await expect(main.getByText("Tagesübersicht")).toBeVisible();

    // Verify the today's bookings section is visible
    await expect(main.getByText("Heutige Buchungen")).toBeVisible();
  });

  test("UC-029: verify auxiliary clock buttons", async ({ page }) => {
    await navigateTo(page, "/time-clock");
    await expectPageTitle(page, "Stempeluhr");

    const main = page.locator("main#main-content");

    // Wait for the clock page to fully load — either Einstempeln or Ausstempeln
    // will be enabled. Check the Ausstempeln button first to detect already-clocked-in state.
    const clockOutBtn = main.getByRole("button", { name: /ausstempeln/i });
    const clockInBtn = main.getByRole("button", { name: /einstempeln/i });
    const pauseBtn = main.getByRole("button", { name: /pause beginnen/i });

    // Wait for one of the primary clock buttons to be enabled (page fully loaded)
    await expect(clockOutBtn.or(clockInBtn)).toBeEnabled({ timeout: 10_000 });

    const alreadyClockedIn = await clockOutBtn.isEnabled().catch(() => false);
    if (!alreadyClockedIn) {
      // Not clocked in — clock in first to reveal secondary buttons
      await clockInBtn.click();
      await page.waitForTimeout(2000);
    }

    // Now verify auxiliary buttons are visible
    await expect(pauseBtn).toBeVisible({ timeout: 10_000 });
    await expect(
      main.getByRole("button", { name: /dienstgang beginnen/i }),
    ).toBeVisible();

    // Clock out again to restore state if we clocked in
    if (!alreadyClockedIn) {
      if (await clockOutBtn.isVisible().catch(() => false)) {
        await clockOutBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// UC-030: View Timesheet
// ---------------------------------------------------------------------------
test.describe("UC-030: Timesheet", () => {
  test("navigate to timesheet and verify page", async ({ page }) => {
    await navigateTo(page, "/timesheet");
    await expectPageTitle(page, "Zeitnachweis");
  });

  test("verify view mode tabs exist", async ({ page }) => {
    await navigateTo(page, "/timesheet");

    // Check for day/week/month view tabs
    await expect(page.getByRole("tab", { name: /tag/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /woche/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /monat/i })).toBeVisible();
  });

  test("switch between view tabs", async ({ page }) => {
    await navigateTo(page, "/timesheet");

    // Click through tabs to verify they work
    await clickTab(page, /woche/i);
    await page.waitForTimeout(500);

    await clickTab(page, /monat/i);
    await page.waitForTimeout(500);

    await clickTab(page, /tag/i);
    await page.waitForTimeout(500);

    // Page should still be functional after tab switches
    const main = page.locator("main#main-content");
    await expect(main).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-031: Manual Booking
// ---------------------------------------------------------------------------
test.describe("UC-031: Manual Booking", () => {
  test("verify add booking button exists on timesheet", async ({ page }) => {
    await navigateTo(page, "/timesheet");
    await expectPageTitle(page, "Zeitnachweis");

    // Look for "Buchung hinzufügen" button
    const addButton = page.getByRole("button", {
      name: /buchung hinzufügen/i,
    });
    await expect(addButton).toBeVisible({ timeout: 5_000 });
  });

  test("open add booking form", async ({ page }) => {
    await navigateTo(page, "/timesheet");

    const addButton = page.getByRole("button", {
      name: /buchung hinzufügen/i,
    });
    await expect(addButton).toBeVisible({ timeout: 5_000 });
    await addButton.click();

    // Verify the form sheet opens
    const sheet = await waitForSheet(page);
    await expect(sheet).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-032: Request Absence
// ---------------------------------------------------------------------------
test.describe("UC-032: Request Absence", () => {
  test("navigate to absences page", async ({ page }) => {
    await navigateTo(page, "/absences");
    await expectPageTitle(page, "Abwesenheiten");
  });

  test("open absence request form", async ({ page }) => {
    await navigateTo(page, "/absences");

    // Look for "Abwesenheit beantragen" button
    const requestButton = page.getByRole("button", {
      name: /abwesenheit beantragen/i,
    });
    await expect(requestButton).toBeVisible({ timeout: 5_000 });
    await requestButton.click();

    // Verify the form sheet opens
    const sheet = await waitForSheet(page);
    await expect(sheet).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-033: Vacation Balance
// ---------------------------------------------------------------------------
test.describe("UC-033: Vacation Balance", () => {
  test("navigate to vacation page and verify content", async ({ page }) => {
    await navigateTo(page, "/vacation");
    await expectPageTitle(page, "Urlaubskonto");

    // Verify balance information is displayed
    const main = page.locator("main#main-content");
    const cards = main.locator('[data-slot="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test("verify entitlement breakdown exists", async ({ page }) => {
    await navigateTo(page, "/vacation");

    // Check for entitlement details (cards or table rows showing balance info)
    const main = page.locator("main#main-content");
    await expect(main).toBeVisible();

    // There should be some content showing vacation entitlement
    const content = main.locator('[data-slot="card"], table');
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// UC-034: Monthly Evaluation
// ---------------------------------------------------------------------------
test.describe("UC-034: Monthly Evaluation", () => {
  test("navigate to monthly evaluation and verify content", async ({
    page,
  }) => {
    await navigateTo(page, "/monthly-evaluation");
    await expectPageTitle(page, "Monatsauswertung");

    // Verify summary cards load
    const main = page.locator("main#main-content");
    const cards = main.locator('[data-slot="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test("verify daily breakdown table loads", async ({ page }) => {
    await navigateTo(page, "/monthly-evaluation");

    const main = page.locator("main#main-content");

    // Admin users must select an employee before the table appears
    const employeeSelect = main.getByRole("combobox").first();
    if (await employeeSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await employeeSelect.click();
      const option = page.getByRole("option").first();
      await option.click();
    }

    // Check for the daily breakdown table
    const table = main.locator("table");
    await expect(table.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// UC-035: Year Overview
// ---------------------------------------------------------------------------
test.describe("UC-035: Year Overview", () => {
  test("navigate to year overview and verify content", async ({ page }) => {
    await navigateTo(page, "/year-overview");
    await expectPageTitle(page, "Jahresübersicht");

    // Verify summary cards load
    const main = page.locator("main#main-content");
    const cards = main.locator('[data-slot="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test("verify monthly breakdown table loads", async ({ page }) => {
    await navigateTo(page, "/year-overview");

    // The year overview requires an employee to be selected.
    // Check for either the table or the employee selection prompt.
    const main = page.locator("main#main-content");
    const table = main.locator("table");
    const prompt = main.getByText(/Wählen Sie einen Mitarbeiter/);

    await expect(table.first().or(prompt)).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// UC-036: Team Overview
// ---------------------------------------------------------------------------
test.describe("UC-036: Team Overview", () => {
  test("navigate to team overview and verify page loads", async ({ page }) => {
    await navigateTo(page, "/team-overview");
    await expectPageTitle(page, "Teamübersicht");

    // Page may show team data or a "select a team" prompt
    const main = page.locator("main#main-content");
    await expect(main).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-037: Notifications
// ---------------------------------------------------------------------------
test.describe("UC-037: Notifications", () => {
  test("navigate to notifications and verify page loads", async ({ page }) => {
    await navigateTo(page, "/notifications");

    const main = page.locator("main#main-content");
    await expect(main).toBeVisible();
  });

  test("verify notification tabs exist", async ({ page }) => {
    await navigateTo(page, "/notifications");

    // Check for "Alle" tab
    await expect(page.getByRole("tab", { name: /alle/i })).toBeVisible();
  });

  test("verify notification list or empty state", async ({ page }) => {
    await navigateTo(page, "/notifications");

    const main = page.locator("main#main-content");
    // Should show either notification items or an empty state message
    await expect(main).toBeVisible();
    // Content should have loaded (not just a spinner)
    await page.waitForTimeout(2_000);
    const hasContent = await main.locator("text=/./").first().isVisible();
    expect(hasContent).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// UC-038: Profile
// ---------------------------------------------------------------------------
test.describe("UC-038: Profile", () => {
  test("navigate to profile and verify page loads", async ({ page }) => {
    await navigateTo(page, "/profile");

    const main = page.locator("main#main-content");
    await expect(main).toBeVisible();
  });

  test("verify profile information cards are visible", async ({ page }) => {
    await navigateTo(page, "/profile");

    // Profile should show cards with personal info and employment details
    const main = page.locator("main#main-content");
    const cards = main.locator('[data-slot="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });
});
