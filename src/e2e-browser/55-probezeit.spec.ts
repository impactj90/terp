import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";

/**
 * Probezeit (Probation) UI — maps to Phase 5 manual verification for the
 * 2026-04-17-probezeit-erkennung-reminder plan. Covers settings persistence,
 * list filter plumbing, badge rendering, dashboard widget + deep link.
 *
 * Depends on the E2EPROB-001 employee seeded by global-setup.ts whose
 * probation ends ~14 days from today.
 */
test.describe.serial("Probezeit", () => {
  const SEEDED_PERSONNEL_NR = "E2EPROB-001";
  const SEEDED_NAME = "E2E Probezeit";

  test("admin can edit probation defaults and they persist after reload", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/settings");
    const main = page.locator("main#main-content");

    // Expand the Probation section (it's expanded by default, but click to
    // be resilient to future default changes).
    const probationHeader = main
      .getByRole("heading", { name: /^Probezeit$/ })
      .first();
    await probationHeader.scrollIntoViewIfNeeded();
    await expect(probationHeader).toBeVisible();

    const defaultMonthsInput = main.locator("#probationDefaultMonths");
    await defaultMonthsInput.scrollIntoViewIfNeeded();
    await defaultMonthsInput.fill("4");

    const reminderDayZero = main.locator("#probationReminderDay-0");
    await reminderDayZero.fill("30");

    const saveButton = main.getByRole("button", {
      name: /Einstellungen speichern/i,
    });
    await saveButton.scrollIntoViewIfNeeded();
    await saveButton.click();

    // Wait for success alert
    await expect(
      main.getByText("Einstellungen erfolgreich gespeichert"),
    ).toBeVisible({ timeout: 10_000 });

    // Reload and confirm persistence
    await page.reload();
    await page.locator("main#main-content").waitFor({ state: "visible" });
    await expect(page.locator("#probationDefaultMonths")).toHaveValue("4");
    await expect(page.locator("#probationReminderDay-0")).toHaveValue("30");

    // Restore default so later tests/runs see the canonical settings
    await page.locator("#probationDefaultMonths").fill("6");
    await page.locator("#probationReminderDay-0").fill("28");
    await page
      .locator("main#main-content")
      .getByRole("button", { name: /Einstellungen speichern/i })
      .click();
    await expect(
      page.getByText("Einstellungen erfolgreich gespeichert"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("employees list filter narrows results to ENDS_IN_30_DAYS", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/employees");
    await waitForTableLoad(page);

    const main = page.locator("main#main-content");

    // Select the Probation filter -> "Endet in 30 Tagen"
    const triggers = main.locator('button[role="combobox"]');
    // The probation combobox is the fourth filter on the page (after
    // status, department, location). Use its placeholder/value text.
    const probationTrigger = triggers.filter({ hasText: /Alle Probezeiten|Probezeit/ }).first();
    await probationTrigger.click();
    await page.getByRole("option", { name: "Endet in 30 Tagen" }).click();

    // Expect the seeded probation employee to be visible.
    await expect(
      main.locator("table tbody tr").filter({ hasText: SEEDED_PERSONNEL_NR }),
    ).toBeVisible({ timeout: 10_000 });

    // ProbationBadge ("In Probezeit") should be rendered in the status cell.
    const row = main
      .locator("table tbody tr")
      .filter({ hasText: SEEDED_PERSONNEL_NR });
    await expect(row.getByText("In Probezeit", { exact: true })).toBeVisible();

    // Reset filter so later tests are unaffected.
    await probationTrigger.click();
    await page.getByRole("option", { name: "Alle Probezeiten" }).click();
  });

  test("dashboard widget renders and deep-links to filtered employees list", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard");
    const main = page.locator("main#main-content");

    // The widget title is "Probezeit" rendered as a CardTitle (not h1).
    const widgetCard = main
      .locator("div")
      .filter({ hasText: /^Probezeit$/ })
      .first();
    await expect(widgetCard).toBeVisible({ timeout: 10_000 });

    // Our seeded employee should be in the preview list. The widget renders
    // an <a href="/admin/employees/<id>"> row per preview item.
    const previewLink = main
      .locator('a[href^="/admin/employees/"]')
      .filter({ hasText: SEEDED_NAME })
      .first();
    await expect(previewLink).toBeVisible();

    // Click the "Gefilterte Liste oeffnen" CTA and assert deep link.
    const cta = main.getByRole("link", {
      name: /Gefilterte Liste/i,
    });
    await cta.click();
    await page.waitForURL(/\/admin\/employees\?probation=ENDS_IN_30_DAYS/);
  });

  test("deep link from dashboard preview row opens employee detail page", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard");
    const main = page.locator("main#main-content");

    const previewLink = main
      .locator('a[href^="/admin/employees/"]')
      .filter({ hasText: SEEDED_NAME })
      .first();
    await previewLink.click();

    await page.waitForURL(/\/admin\/employees\/[0-9a-f-]{36}/);
    await expect(
      page.locator("main#main-content").getByRole("heading", { level: 1 }),
    ).toHaveText(new RegExp(SEEDED_NAME));
  });
});
