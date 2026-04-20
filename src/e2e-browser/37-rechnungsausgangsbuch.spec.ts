/**
 * Playwright E2E — Rechnungsausgangsbuch (UC-BILL-B).
 *
 * Verifies the StB report view: navigation, filter, table rendering with
 * the seeded RE-1..RE-7 + GS-1 invoices, and availability of the export
 * buttons. Does NOT click export buttons because:
 *   - PDF export hits Supabase Storage (requires live bucket + signed URL).
 *   - CSV export triggers a file download which is flaky in Playwright
 *     without a dedicated download handler. Router tests cover both paths.
 *
 * Plan reference: thoughts/shared/plans/2026-04-18-leistungszeitraum-
 * und-rechnungsausgangsbuch.md Phase B6.
 */
import { test, expect, type Page } from "@playwright/test"

async function gotoBook(page: Page): Promise<void> {
  await page.goto("/orders/outgoing-invoice-book")
  await expect(
    page.getByRole("heading", { name: /Rechnungsausgangsbuch/i, level: 2 })
  ).toBeVisible({ timeout: 15_000 })
}

test.describe("UC-BILL-B: Rechnungsausgangsbuch", () => {
  test("navigates to the report page and shows filter controls", async ({
    page,
  }) => {
    await gotoBook(page)
    // Two date inputs (Von / Bis)
    await expect(page.locator('input[type="date"]').nth(0)).toBeVisible()
    await expect(page.locator('input[type="date"]').nth(1)).toBeVisible()
    // Quick buttons
    await expect(
      page.getByRole("button", { name: /Vormonat/i })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /Aktueller Monat/i })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /Aktuelles Jahr/i })
    ).toBeVisible()
  })

  test("applies the seeded range 2026-02-01 → 2026-03-31 and shows invoices + credit note", async ({
    page,
  }) => {
    await gotoBook(page)
    const [fromInput, toInput] = [
      page.locator('input[type="date"]').nth(0),
      page.locator('input[type="date"]').nth(1),
    ]
    await fromInput.fill("2026-02-01")
    await toInput.fill("2026-03-31")

    // Wait for the table to render at least one invoice number cell.
    await expect(
      page.getByRole("cell", { name: /^RE-\d+$/ }).first()
    ).toBeVisible({ timeout: 10_000 })

    // The seed contains GS-1 as a PRINTED credit note in the window.
    await expect(page.getByRole("cell", { name: "GS-1" })).toBeVisible()

    // Draft documents must NOT appear.
    await expect(page.getByRole("cell", { name: /^AG-/ })).toHaveCount(0)
  })

  test("renders summary rows per USt rate and grand total", async ({
    page,
  }) => {
    await gotoBook(page)
    await page.locator('input[type="date"]').nth(0).fill("2026-02-01")
    await page.locator('input[type="date"]').nth(1).fill("2026-03-31")

    await expect(
      page.getByRole("cell", { name: /^RE-\d+$/ }).first()
    ).toBeVisible({ timeout: 10_000 })

    // Footer shows "Summe 19 %" row and "Gesamt" row.
    await expect(page.getByText(/Summe 19/i)).toBeVisible()
    await expect(page.getByText(/^Gesamt$/i)).toBeVisible()
  })

  test("exports buttons are present (not clicked — storage side effects)", async ({
    page,
  }) => {
    await gotoBook(page)
    await page.locator('input[type="date"]').nth(0).fill("2026-02-01")
    await page.locator('input[type="date"]').nth(1).fill("2026-03-31")

    await expect(
      page.getByRole("cell", { name: /^RE-\d+$/ }).first()
    ).toBeVisible({ timeout: 10_000 })

    await expect(
      page.getByRole("button", { name: /Export PDF/i })
    ).toBeEnabled()
    await expect(
      page.getByRole("button", { name: /Export CSV/i })
    ).toBeEnabled()
  })

  test("empty range (future month) shows empty-state message", async ({
    page,
  }) => {
    await gotoBook(page)
    await page.locator('input[type="date"]').nth(0).fill("2030-01-01")
    await page.locator('input[type="date"]').nth(1).fill("2030-01-31")

    await expect(
      page.getByText(/Keine Belege im gewählten Zeitraum/i)
    ).toBeVisible({ timeout: 10_000 })
  })

  test("Aktuelles Jahr button sets Von=Jan 1 / Bis=Dec 31 of current year", async ({
    page,
  }) => {
    await gotoBook(page)
    await page.getByRole("button", { name: /Aktuelles Jahr/i }).click()
    const currentYear = new Date().getFullYear()
    await expect(page.locator('input[type="date"]').nth(0)).toHaveValue(
      `${currentYear}-01-01`
    )
    await expect(page.locator('input[type="date"]').nth(1)).toHaveValue(
      `${currentYear}-12-31`
    )
  })

  test("Aktueller Monat button sets first and last day of current month", async ({
    page,
  }) => {
    await gotoBook(page)
    await page.getByRole("button", { name: /Aktueller Monat/i }).click()
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, "0")
    const lastDay = String(
      new Date(y, now.getMonth() + 1, 0).getDate()
    ).padStart(2, "0")
    await expect(page.locator('input[type="date"]').nth(0)).toHaveValue(
      `${y}-${m}-01`
    )
    await expect(page.locator('input[type="date"]').nth(1)).toHaveValue(
      `${y}-${m}-${lastDay}`
    )
  })

  test("Vormonat button sets first and last day of previous month", async ({
    page,
  }) => {
    await gotoBook(page)
    // Click twice to prove idempotence (navigation + quick button re-click)
    await page.getByRole("button", { name: /Vormonat/i }).click()
    await page.getByRole("button", { name: /Vormonat/i }).click()
    const now = new Date()
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastOfPrev = new Date(firstOfThisMonth.getTime() - 1)
    const y = lastOfPrev.getFullYear()
    const m = String(lastOfPrev.getMonth() + 1).padStart(2, "0")
    const lastDay = String(lastOfPrev.getDate()).padStart(2, "0")
    await expect(page.locator('input[type="date"]').nth(0)).toHaveValue(
      `${y}-${m}-01`
    )
    await expect(page.locator('input[type="date"]').nth(1)).toHaveValue(
      `${y}-${m}-${lastDay}`
    )
  })

  test("invalid range (from > to) renders the error message and disables exports", async ({
    page,
  }) => {
    await gotoBook(page)
    // Forces inverse range
    await page.locator('input[type="date"]').nth(0).fill("2026-06-01")
    await page.locator('input[type="date"]').nth(1).fill("2026-03-31")

    await expect(page.getByText(/^Von > Bis$/i)).toBeVisible({
      timeout: 5_000,
    })
    // Both export buttons are disabled in this state
    await expect(
      page.getByRole("button", { name: /Export PDF/i })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: /Export CSV/i })
    ).toBeDisabled()
  })

  test("export buttons disabled on empty result", async ({ page }) => {
    await gotoBook(page)
    await page.locator('input[type="date"]').nth(0).fill("2030-01-01")
    await page.locator('input[type="date"]').nth(1).fill("2030-01-31")

    await expect(
      page.getByText(/Keine Belege im gewählten Zeitraum/i)
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByRole("button", { name: /Export PDF/i })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: /Export CSV/i })
    ).toBeDisabled()
  })

  test("customer column renders with seeded customer names", async ({
    page,
  }) => {
    await gotoBook(page)
    await page.locator('input[type="date"]').nth(0).fill("2026-02-01")
    await page.locator('input[type="date"]').nth(1).fill("2026-03-31")

    await expect(
      page.getByRole("cell", { name: /^RE-\d+$/ }).first()
    ).toBeVisible({ timeout: 10_000 })

    // Seed tenant includes at least these two customers in the chains:
    // Müller Maschinenbau, Schmidt & Partner (from docs/TERP_HANDBUCH seed section).
    await expect(
      page.getByRole("cell", { name: /Müller|Schmidt/i }).first()
    ).toBeVisible()
  })
})
