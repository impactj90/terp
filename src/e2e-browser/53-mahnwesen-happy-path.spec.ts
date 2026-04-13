/**
 * Playwright E2E — Mahnwesen Happy Path.
 *
 * Covers the D7 operator workflow that is testable without a working
 * SMTP server: navigate → proposal → create draft run → detail sheet →
 * settings + templates tabs. The send-email step is intentionally NOT
 * driven through the UI here because the dev tenant has no SMTP config,
 * so a live send would throw `SmtpNotConfiguredError`. Email rendering
 * + send-log writing are covered by the router integration tests.
 *
 * Fixture: `global-setup.ts` seeds one E2E customer + two 30/45-day
 * overdue invoices in the dev tenant, enables dunning with default
 * settings, and installs level-1/2/3 default templates. Everything is
 * idempotent across runs via the E2E% name prefix + fixed UUIDs.
 *
 * Plan reference: thoughts/shared/plans/2026-04-13-mahnwesen.md Phase 4.6
 */
import { test, expect, type Page } from "@playwright/test"

const SEEDED_CUSTOMER = "E2E Mahnkunde GmbH"

/**
 * Navigate to /orders/dunning and wait for the page to fully render.
 * Skips the repo's `navigateTo` helper because that helper's
 * `main#main-content` selector targets a `<main>` element with that id,
 * but the actual layout renders `<div id="main-content">` inside the
 * `SidebarInset` main — so the selector never matches.
 */
async function gotoDunning(page: Page): Promise<void> {
  await page.goto("/orders/dunning")
  await expect(
    page.getByRole("heading", { name: /Mahnwesen/i, level: 1 })
  ).toBeVisible({ timeout: 15_000 })
}

test.describe.serial("UC-DUN-01: Mahnwesen Happy Path (D7)", () => {
  test("navigates to /orders/dunning and renders 4 tabs", async ({ page }) => {
    await gotoDunning(page)
    await expect(
      page.getByRole("tab", { name: /Vorschlag/i })
    ).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Mahnl[äa]ufe/i })
    ).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Vorlagen/i })
    ).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Einstellungen/i })
    ).toBeVisible()
  })

  test("does not show pre-flight banner when dunning is active", async ({
    page,
  }) => {
    await gotoDunning(page)
    // Seed sets enabled=true + default templates, so the banner stays hidden.
    await expect(page.getByTestId("pre-flight-banner")).toHaveCount(0)
  })

  test("proposal lists the seeded overdue customer with 2 invoices", async ({
    page,
  }) => {
    await gotoDunning(page)
    const groupRow = page
      .getByTestId("proposal-group-row")
      .filter({ hasText: SEEDED_CUSTOMER })
    await expect(groupRow).toBeVisible({ timeout: 10_000 })

    // Expand via the chevron toggle. Its aria-label is localized as
    // "Details ein-/ausklappen" — we match the icon-sized button that
    // sits immediately after the group checkbox.
    await groupRow
      .getByRole("button", { name: /Details/i })
      .first()
      .click()

    // Our specific customer has exactly 2 invoice rows visible. Other
    // proposal groups (dev-seed customers) may add their own rows to
    // the page when expanded, but we only expanded ours, so the count
    // should match 2.
    const ourInvoiceRows = page
      .getByTestId("proposal-invoice-row")
      .filter({ hasText: /E2E-MAHN-RE/ })
    await expect(ourInvoiceRows).toHaveCount(2)
  })

  test("creates a DRAFT reminder from the proposal", async ({ page }) => {
    await gotoDunning(page)
    const groupRow = page
      .getByTestId("proposal-group-row")
      .filter({ hasText: SEEDED_CUSTOMER })
    await expect(groupRow).toBeVisible({ timeout: 10_000 })

    // Click the primary action. Default state has every group selected,
    // so this creates reminders for our E2E customer (+ any other
    // overdue customers from the dev seed). We only assert on the E2E
    // customer's DRAFT reminder to stay independent of dev-seed drift.
    await page.getByRole("button", { name: /Mahnungen erstellen/i }).click()

    // Wait for the success toast rather than relying on the tab auto-
    // switch. The German string is `{n} Mahnung(en) erstellt, {m}
    // übersprungen` — note the literal parentheses around "en".
    const toast = page.getByText(/Mahnung\(en\) erstellt|reminders created/i)
    await expect(toast.first()).toBeVisible({ timeout: 15_000 })

    // Manually navigate to the runs tab and verify our E2E reminder
    // showed up as a DRAFT row.
    await page.getByRole("tab", { name: /Mahnl[äa]ufe/i }).click()
    const ourReminderRow = page
      .getByTestId("reminder-row")
      .filter({ hasText: SEEDED_CUSTOMER })
    await expect(ourReminderRow.first()).toBeVisible({ timeout: 10_000 })
    const ourStatusBadge = ourReminderRow
      .first()
      .getByTestId("reminder-status-badge")
    await expect(ourStatusBadge).toContainText(/Entwurf|Draft|DRAFT/i)
  })

  test("draft reminder detail sheet lists the reminded invoices", async ({
    page,
  }) => {
    await gotoDunning(page)
    await page.getByRole("tab", { name: /Mahnl[äa]ufe/i }).click()

    const ourReminderRow = page
      .getByTestId("reminder-row")
      .filter({ hasText: SEEDED_CUSTOMER })
      .first()
    await expect(ourReminderRow).toBeVisible({ timeout: 10_000 })
    await ourReminderRow.click()

    // The detail sheet should list both seeded invoices as items.
    const itemRows = page.getByTestId("reminder-item-row")
    await expect(itemRows).toHaveCount(2, { timeout: 10_000 })
    await page.keyboard.press("Escape")
  })

  test("settings tab exposes the Mahnwesen-aktiv switch", async ({
    page,
  }) => {
    await gotoDunning(page)
    await page.getByRole("tab", { name: /Einstellungen/i }).click()
    // The enabled switch is the first interactive element in the tab.
    const enabledLabel = page
      .getByText(/Mahnwesen.*aktiv|Dunning active/i)
      .first()
    await expect(enabledLabel).toBeVisible({ timeout: 10_000 })
  })

  test("templates tab shows the seeded level 1/2/3 defaults", async ({
    page,
  }) => {
    await gotoDunning(page)
    await page.getByRole("tab", { name: /Vorlagen/i }).click()
    await expect(
      page.getByText(/E2E Mahn Stufe 1/)
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/E2E Mahn Stufe 2/)).toBeVisible()
    await expect(page.getByText(/E2E Mahn Stufe 3/)).toBeVisible()
  })
})
