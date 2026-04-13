/**
 * Playwright E2E — Zahlungsläufe (SEPA).
 *
 * Smoke coverage for the payment-runs UI: sidebar entry, pre-flight
 * banner handling, page loads. Seeding a full APPROVED-invoice flow
 * from Playwright is involved (requires IBAN-configured tenant plus
 * supplier CRM data); the happy-path invoice creation side is covered
 * by the service unit tests. This spec guards the navigation shell
 * and UI gating so regressions surface before production.
 *
 * Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 4.4
 */
import { test, expect } from "@playwright/test"
import { navigateTo } from "./helpers/nav"

test.describe.serial("UC-INV-02: Zahlungsläufe (SEPA)", () => {
  test("navigates to payment runs via direct URL", async ({ page }) => {
    await navigateTo(page, "/invoices/inbound/payment-runs")
    // Page heading or preflight banner must appear — either means the
    // route resolved, tRPC context bound, and the module guard let us in.
    const heading = page.getByRole("heading", { name: /Zahlungsläufe/i })
    const banner = page.getByText(/Bankdaten fehlen|Bank details missing/i)
    await expect(heading.or(banner)).toBeVisible({ timeout: 10_000 })
  })

  test("renders page shell without unhandled errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))
    await navigateTo(page, "/invoices/inbound/payment-runs")
    await page.waitForLoadState("networkidle")
    expect(errors).toEqual([])
  })

  test("existing-runs section renders (list endpoint wired)", async ({
    page,
  }) => {
    await navigateTo(page, "/invoices/inbound/payment-runs")
    await page.waitForLoadState("networkidle")
    // Either the section title shows (pre-flight OK) or the banner blocks the
    // page (pre-flight fail) — both are acceptable for this smoke check.
    const sectionTitle = page.getByText(
      /Bestehende Läufe|Existing runs|Bankdaten fehlen|Bank details missing/i
    )
    await expect(sectionTitle.first()).toBeVisible({ timeout: 10_000 })
  })
})
