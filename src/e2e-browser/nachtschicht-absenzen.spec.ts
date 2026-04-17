/**
 * E2E tests for night-shift absence day assignment.
 *
 * Covers:
 * - UC-NS-01: UI warning toggle in day plan form (auto_complete)
 * - UC-NS-02: dayChangeBehavior persists across save/reload
 * - UC-NS-03: Absence request form opens for employee
 * - UC-NS-04: Vacation page loads with balance
 *
 * Business-logic correctness (correct day assignment per mode) is covered
 * by integration tests in src/lib/services/__tests__/absences-night-shift.integration.test.ts.
 * These E2E tests verify the UI layer behaves correctly and that end-users
 * see the warning when they select a behavior that has absence-day implications.
 */
import { test, expect, type Page } from "@playwright/test"
import {
  waitForSheet,
  waitForSheetClose,
  openRowActions,
  clickMenuItem,
  clickTab,
} from "./helpers/forms"

// Local navigation that doesn't rely on the stale main#main-content selector.
async function goto(page: Page, path: string) {
  await page.goto(path)
  // Wait for the page heading to appear — every dashboard page has an h1.
  await page.locator("main, [role='main']").first().waitFor({ state: "visible", timeout: 15_000 })
}

async function expectPageHeading(page: Page, text: string | RegExp) {
  await expect(page.getByRole("heading", { level: 1, name: text })).toBeVisible({ timeout: 10_000 })
}

async function waitForTable(page: Page) {
  await page.locator("table tbody tr").first().waitFor({ state: "visible", timeout: 10_000 })
}

const WARNING_TEXT = /Auto-Abschluss um Mitternacht.*führt dazu|führt dazu, dass Nachtschicht-Urlaube/i

async function openNightShiftPlanEdit(page: Page) {
  await goto(page, "/admin/day-plans")
  await expectPageHeading(page, "Tagespläne")
  await waitForTable(page)

  // Search for NS plan so row 1 is always the NS plan regardless of sort
  const searchBox = page.locator('input[type="search"], input[placeholder*="Such"]').first()
  if (await searchBox.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await searchBox.fill("NS")
    await page.waitForTimeout(500)
  }

  // Open row actions menu on the NS row, then click "Bearbeiten"
  await openRowActions(page, "NS")
  await clickMenuItem(page, /Bearbeiten/i)

  // Wait for edit sheet
  const sheet = await waitForSheet(page)

  // Navigate to Spezial tab
  await clickTab(page, /Spezial/i)

  return sheet
}

async function selectDayChangeBehavior(
  page: Page,
  option: RegExp,
) {
  // The SelectTrigger has id="dayChangeBehavior"
  const trigger = page.locator("#dayChangeBehavior")
  await trigger.click()
  const opt = page.getByRole("option", { name: option }).first()
  await opt.waitFor({ state: "visible", timeout: 3_000 })
  await opt.click()
  // Wait for dropdown to close and value to reflect in trigger
  await expect(trigger).toContainText(option, { timeout: 3_000 })
}

async function closeSheetWithoutSaving(page: Page) {
  await page.keyboard.press("Escape")
  await waitForSheetClose(page)
}

async function saveDayPlan(page: Page) {
  // Click the Save button by its accessible name and wait for the update request to complete
  const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]')
  const saveBtn = sheet.getByRole("button", { name: /Änderungen speichern/i })
  await expect(saveBtn).toBeEnabled({ timeout: 3_000 })
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/trpc/") && r.request().method() === "POST",
      { timeout: 15_000 },
    ),
    saveBtn.click(),
  ])
  await waitForSheetClose(page)
}

// ---------------------------------------------------------------------------
// UC-NS-01: UI warning appears/disappears on auto_complete selection
// ---------------------------------------------------------------------------
test.describe("UC-NS-01: DayChangeBehavior auto_complete warning", () => {
  test("warning hidden for at_arrival, visible for auto_complete, hidden again for at_arrival", async ({ page }) => {
    const sheet = await openNightShiftPlanEdit(page)
    const warning = sheet.getByText(WARNING_TEXT)

    // NS plan ships as at_arrival — no warning expected
    await expect(warning).toHaveCount(0)

    // Switch to auto_complete — warning must appear
    await selectDayChangeBehavior(page, /Auto-Abschluss/i)
    await expect(warning).toBeVisible({ timeout: 3_000 })

    // Switch to at_departure — warning must disappear
    await selectDayChangeBehavior(page, /Bei Gehen/i)
    await expect(warning).toHaveCount(0)

    // Switch back to auto_complete — warning must reappear
    await selectDayChangeBehavior(page, /Auto-Abschluss/i)
    await expect(warning).toBeVisible({ timeout: 3_000 })

    // Switch to at_arrival to restore seed value visually
    await selectDayChangeBehavior(page, /Bei Ankunft/i)
    await expect(warning).toHaveCount(0)

    await closeSheetWithoutSaving(page)
  })

  test("warning is informational (default Alert variant, not destructive)", async ({ page }) => {
    const sheet = await openNightShiftPlanEdit(page)

    await selectDayChangeBehavior(page, /Auto-Abschluss/i)

    const alert = sheet.locator('[role="alert"]').filter({ hasText: WARNING_TEXT })
    await expect(alert).toBeVisible({ timeout: 3_000 })

    // Default variant does NOT carry the destructive data attribute / class
    const variant = await alert.getAttribute("data-variant")
    const className = (await alert.getAttribute("class")) ?? ""
    expect(variant).not.toBe("destructive")
    expect(className).not.toMatch(/destructive/i)

    await selectDayChangeBehavior(page, /Bei Ankunft/i)
    await closeSheetWithoutSaving(page)
  })
})

// ---------------------------------------------------------------------------
// UC-NS-02: dayChangeBehavior persists across save/reload
// ---------------------------------------------------------------------------
test.describe.serial("UC-NS-02: DayChangeBehavior persistence", () => {
  test("change NS plan to at_departure and save", async ({ page }) => {
    await openNightShiftPlanEdit(page)

    // Change to "Bei Gehen" (at_departure)
    await selectDayChangeBehavior(page, /Bei Gehen/i)

    // Submit and wait for server roundtrip
    await saveDayPlan(page)
  })

  test("reopen NS plan: at_departure is the selected value", async ({ page }) => {
    const sheet = await openNightShiftPlanEdit(page)

    // The Select trigger shows the currently selected option text
    const trigger = sheet.locator("#dayChangeBehavior")
    await expect(trigger).toContainText(/Bei Gehen/i)

    await closeSheetWithoutSaving(page)
  })

  test("cleanup: reset NS plan back to at_arrival", async ({ page }) => {
    await openNightShiftPlanEdit(page)
    await selectDayChangeBehavior(page, /Bei Ankunft/i)
    await saveDayPlan(page)
  })

  test("verify: NS plan is back at at_arrival", async ({ page }) => {
    const sheet = await openNightShiftPlanEdit(page)
    const trigger = sheet.locator("#dayChangeBehavior")
    await expect(trigger).toContainText(/Bei Ankunft/i)
    await closeSheetWithoutSaving(page)
  })
})

// ---------------------------------------------------------------------------
// UC-NS-03: Absence request form opens (prerequisite for vacation booking)
// ---------------------------------------------------------------------------
test.describe("UC-NS-03: Absence request form", () => {
  test("navigate to /absences and open request form", async ({ page }) => {
    await goto(page, "/absences")
    await expectPageHeading(page, "Abwesenheiten")

    const requestButton = page.getByRole("button", {
      name: /abwesenheit beantragen/i,
    })
    await expect(requestButton).toBeVisible({ timeout: 5_000 })
    await requestButton.click()

    const sheet = await waitForSheet(page)
    await expect(sheet).toBeVisible()

    // Form must contain the absence-type selector + date range picker
    await expect(sheet.getByText(/Urlaub|Krank|Abwesenheitstyp|Art/i).first()).toBeVisible({ timeout: 5_000 })

    await closeSheetWithoutSaving(page)
  })
})

// ---------------------------------------------------------------------------
// UC-NS-04: Vacation overview page renders
// ---------------------------------------------------------------------------
test.describe("UC-NS-04: Vacation overview", () => {
  test("navigate to /vacation and verify balance cards are visible", async ({ page }) => {
    await goto(page, "/vacation")
    await expectPageHeading(page, "Urlaubskonto")

    const cards = page.locator('[data-slot="card"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
  })
})
