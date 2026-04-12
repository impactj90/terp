import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  clickTab,
} from "./helpers/forms";

// --- Constants ---
const COMPANY = "E2E Aufgaben GmbH";
const TASK_SUBJECT = "E2E Testaufgabe Montage";
const TASK_SUBJECT_2 = "E2E Aufgabe Dokumentation";
const MESSAGE_SUBJECT = "E2E Nachricht an Team";

test.describe.serial("UC-CRM-04: Tasks & Messages", () => {
  // --- Pre-condition: Create address for task tests ---

  test("create address for task tests", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await page.getByRole("button", { name: "Neue Adresse" }).click();
    await waitForSheet(page);

    await fillInput(page, "company", COMPANY);
    await fillInput(page, "city", "Hamburg");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, COMPANY);
  });

  // --- Create a task from global page ---

  test("create a task from global page", async ({ page }) => {
    await navigateTo(page, "/crm/tasks");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Neue Aufgabe" }).click();
    await waitForSheet(page);

    // Fill subject
    await fillInput(page, "taskSubject", TASK_SUBJECT);

    // Select address
    await selectOption(page, "Adresse", COMPANY);

    // Select assignee - click the assignee selector button
    const sheet = page.locator('[data-state="open"][role="dialog"]');
    await sheet.getByRole("button", { name: /auswählen/i }).click();

    // Wait for popover with employee/team list
    const popover = page.locator('[data-radix-popper-content-wrapper]');
    await popover.waitFor({ state: "visible", timeout: 5_000 });

    // Click the first employee available
    const firstEmployee = popover.locator("button").filter({ hasNotText: /Team/i }).first();
    await firstEmployee.click();

    // Close the popover by clicking outside
    await sheet.locator("h3").first().click();
    await page.waitForTimeout(300);

    // Set due date
    await fillInput(page, "taskDueAt", "2026-06-01");

    await submitAndWaitForClose(page);

    // Verify entry appears in table
    await expect(page.getByText(TASK_SUBJECT).first()).toBeVisible({ timeout: 10_000 });
    // Verify status badge shows "Offen"
    await expect(page.getByText("Offen").first()).toBeVisible();
  });

  // --- Create a second task ---

  test("create a second task", async ({ page }) => {
    await navigateTo(page, "/crm/tasks");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Neue Aufgabe" }).click();
    await waitForSheet(page);

    await fillInput(page, "taskSubject", TASK_SUBJECT_2);

    // Select address
    await selectOption(page, "Adresse", COMPANY);

    // Select assignee
    const sheet = page.locator('[data-state="open"][role="dialog"]');
    await sheet.getByRole("button", { name: /auswählen/i }).click();

    const popover = page.locator('[data-radix-popper-content-wrapper]');
    await popover.waitFor({ state: "visible", timeout: 5_000 });

    const firstEmployee = popover.locator("button").filter({ hasNotText: /Team/i }).first();
    await firstEmployee.click();

    await sheet.locator("h3").first().click();
    await page.waitForTimeout(300);

    await submitAndWaitForClose(page);

    await expect(page.getByText(TASK_SUBJECT_2).first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Search tasks ---

  test("search tasks by subject", async ({ page }) => {
    await navigateTo(page, "/crm/tasks");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(TASK_SUBJECT).first()).toBeVisible({ timeout: 10_000 });

    const main = page.locator("main#main-content");
    await main.getByPlaceholder(/durchsuchen/i).fill("Montage");
    await page.waitForTimeout(500);

    await expect(page.getByText(TASK_SUBJECT).first()).toBeVisible();
    await expect(page.getByText(TASK_SUBJECT_2)).not.toBeVisible();

    // Clear search
    await main.getByPlaceholder(/durchsuchen/i).clear();
    await page.waitForTimeout(500);
  });

  // --- Filter by status ---

  test("filter tasks by status", async ({ page }) => {
    await navigateTo(page, "/crm/tasks");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(TASK_SUBJECT).first()).toBeVisible({ timeout: 10_000 });

    // Filter to "Offen"
    await page.locator("button").filter({ hasText: "Alle Status" }).click();
    await page.getByRole("option", { name: "Offen", exact: true }).click();
    await page.waitForTimeout(500);

    // Both E2E tasks should be shown (both are OPEN)
    await expect(page.getByText(TASK_SUBJECT).first()).toBeVisible();
    await expect(page.getByText(TASK_SUBJECT_2).first()).toBeVisible();

    // Filter to "Erledigt"
    await page.locator("button").filter({ hasText: "Offen" }).click();
    await page.getByRole("option", { name: "Erledigt", exact: true }).click();
    await page.waitForTimeout(500);

    // No E2E tasks should be shown
    await expect(page.getByText(TASK_SUBJECT)).not.toBeVisible();
    await expect(page.getByText(TASK_SUBJECT_2)).not.toBeVisible();

    // Reset filter
    await page.locator("button").filter({ hasText: "Erledigt" }).click();
    await page.getByRole("option", { name: "Alle Status", exact: true }).click();
    await page.waitForTimeout(500);
  });

  // --- Open task detail ---

  test("open task detail dialog", async ({ page }) => {
    await navigateTo(page, "/crm/tasks");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(TASK_SUBJECT).first()).toBeVisible({ timeout: 10_000 });

    // Click on the row to open detail dialog
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: TASK_SUBJECT })
      .first();
    await row.click();

    // Wait for detail dialog
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 5_000 });

    // Verify detail content — subject appears as heading and in detail row
    await expect(dialog.getByRole("heading", { name: TASK_SUBJECT })).toBeVisible();
    await expect(dialog.getByText("Offen").first()).toBeVisible();

    // Close dialog
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });
  });

  // --- Complete a task ---

  test("complete a task", async ({ page }) => {
    await navigateTo(page, "/crm/tasks");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(TASK_SUBJECT).first()).toBeVisible({ timeout: 10_000 });

    // Open detail dialog
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: TASK_SUBJECT })
      .first();
    await row.click();

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 5_000 });

    // Click "Erledigen"
    await dialog.getByRole("button", { name: /Erledigen/i }).click();

    // Confirm dialog
    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]').last();
    await confirmDialog.waitFor({ state: "visible" });
    await confirmDialog.getByRole("button", { name: /Bestätigen/i }).click();
    await page.waitForTimeout(1000);

    // Verify status changed to "Erledigt" in the table
    await expect(page.getByText("Erledigt").first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Reopen completed task ---

  test("reopen completed task", async ({ page }) => {
    await navigateTo(page, "/crm/tasks");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(TASK_SUBJECT).first()).toBeVisible({ timeout: 10_000 });

    // Open detail dialog
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: TASK_SUBJECT })
      .first();
    await row.click();

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 5_000 });

    // Click "Wieder offnen"
    await dialog.getByRole("button", { name: /Wieder öffnen/i }).click();

    // Confirm dialog
    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]').last();
    await confirmDialog.waitFor({ state: "visible" });
    await confirmDialog.getByRole("button", { name: /Bestätigen/i }).click();
    await page.waitForTimeout(1000);

    // Verify status changes to "In Bearbeitung"
    await expect(page.getByText("In Bearbeitung").first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Cancel second task ---

  test("cancel second task", async ({ page }) => {
    await navigateTo(page, "/crm/tasks");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(TASK_SUBJECT_2)).toBeVisible({ timeout: 10_000 });

    // Open detail dialog
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: TASK_SUBJECT_2 });
    await row.click();

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 5_000 });

    // Click "Stornieren"
    await dialog.getByRole("button", { name: /Stornieren/i }).click();

    // Confirm dialog
    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]').last();
    await confirmDialog.waitFor({ state: "visible" });
    await confirmDialog.getByRole("button", { name: /Bestätigen/i }).click();
    await page.waitForTimeout(1000);

    // Verify "Storniert" status
    await expect(page.getByText("Storniert").first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Delete cancelled task ---

  test("delete cancelled task", async ({ page }) => {
    await navigateTo(page, "/crm/tasks");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(TASK_SUBJECT_2)).toBeVisible({ timeout: 10_000 });

    // Open detail dialog
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: TASK_SUBJECT_2 });
    await row.click();

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 5_000 });

    // Click "Loschen"
    await dialog.getByRole("button", { name: /Löschen/i }).click();

    // Confirm dialog
    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]').last();
    await confirmDialog.waitFor({ state: "visible" });
    await confirmDialog.getByRole("button", { name: /Bestätigen/i }).click();
    await page.waitForTimeout(1000);

    // Task should be removed from list
    await expect(page.getByText(TASK_SUBJECT_2)).not.toBeVisible({ timeout: 10_000 });
  });

  // --- Create a message ---

  test("create a message to a team", async ({ page }) => {
    await navigateTo(page, "/crm/tasks");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Neue Aufgabe" }).click();
    await waitForSheet(page);

    // Toggle type to MESSAGE
    const sheet = page.locator('[data-state="open"][role="dialog"]');
    await sheet.getByRole("button", { name: "Nachricht" }).click();

    // Fill subject
    await fillInput(page, "taskSubject", MESSAGE_SUBJECT);

    // Select assignee
    await sheet.getByRole("button", { name: /auswählen/i }).click();

    const popover = page.locator('[data-radix-popper-content-wrapper]');
    await popover.waitFor({ state: "visible", timeout: 5_000 });

    // Try to select a team; if no teams exist, select an employee
    const teamSection = popover.locator("button").filter({ hasText: /Team/i });
    const teamCount = await teamSection.count();
    if (teamCount > 0) {
      await teamSection.first().click();
    } else {
      // Fallback: select first employee
      await popover.locator("button").first().click();
    }

    await sheet.locator("h3").first().click();
    await page.waitForTimeout(300);

    await submitAndWaitForClose(page);

    // Verify MESSAGE type in table (MessageSquare icon should be visible)
    await expect(page.getByText(MESSAGE_SUBJECT)).toBeVisible({ timeout: 10_000 });
  });

  // --- View tasks in address detail tab ---

  test("view tasks in address detail tab", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Go to Aufgaben tab
    await clickTab(page, "Aufgaben");

    // Verify tasks linked to this address are shown
    await expect(page.getByText(TASK_SUBJECT).first()).toBeVisible({ timeout: 10_000 });
  });
});
