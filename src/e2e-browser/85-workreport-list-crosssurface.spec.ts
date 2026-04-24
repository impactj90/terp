import { test, expect, type Page } from "@playwright/test"
import { navigateTo } from "./helpers/nav"
import {
  createDraftWorkReport,
  createSignedWorkReport,
  disconnect,
  ensureSecondSeedOrder,
  ensureSeedOrderForWorkReport,
  ensureSeedServiceObject,
  resetWorkReports,
} from "./helpers/work-report-fixtures"

/**
 * UC-WR-02: WorkReport list + cross-surface + cache-invalidation.
 *
 * Covers scenarios out of the coverage matrix from
 * `thoughts/shared/plans/2026-04-24-workreport-e2e-coverage.md`
 * that the main Lifecycle spec (`84-`) does not:
 *
 *   - List: tabs, url persistence, empty states, row click
 *   - Cross-surface: Order-detail tab, ServiceObject-detail tab
 *   - Cache-Invalidation regression from commit `d42dcc1d`: Void on
 *     detail page must flip the list-row status without a reload.
 */

async function seedThreeMixedStatus(
  orderId: string,
): Promise<{ draftId: string; signedId: string; voidId: string }> {
  const draft = await createDraftWorkReport({
    orderId,
    withAssignment: true,
    withDescription: true,
  })
  const signed = await createSignedWorkReport({ orderId })
  const voided = await createSignedWorkReport({ orderId })
  // Flip to VOID directly so we don't depend on UI here.
  const { Pool } = await import("pg")
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:54322/postgres",
    max: 1,
  })
  try {
    await pool.query(
      `UPDATE work_reports
          SET status = 'VOID',
              voided_at = NOW(),
              void_reason = 'E2E seeded void — long enough',
              updated_at = NOW()
        WHERE id = $1`,
      [voided.id],
    )
  } finally {
    await pool.end()
  }
  return { draftId: draft.id, signedId: signed.id, voidId: voided.id }
}

async function navigateAndWaitList(page: Page, url: string): Promise<void> {
  await navigateTo(page, url)
  await expect(
    page.getByRole("heading", { name: "Arbeitsscheine", exact: true }),
  ).toBeVisible({ timeout: 10_000 })
}

test.describe.serial("UC-WR-02: Liste + Cross-Surface", () => {
  let orderId: string
  let order2Id: string
  let serviceObjectId: string

  test.beforeAll(async () => {
    await resetWorkReports()
    const order = await ensureSeedOrderForWorkReport()
    orderId = order.id
    const order2 = await ensureSecondSeedOrder()
    order2Id = order2.id
    const so = await ensureSeedServiceObject()
    serviceObjectId = so.id
  })

  test.afterAll(async () => {
    await resetWorkReports()
    await disconnect()
  })

  // ─── Liste ────────────────────────────────────────────────────────

  test("Liste zeigt 4 Status-Tabs und Total-Count", async ({ page }) => {
    await resetWorkReports()
    await seedThreeMixedStatus(orderId)

    await navigateAndWaitList(page, "/admin/work-reports")

    // Tabs
    await expect(page.getByRole("tab", { name: /^Alle$/ })).toBeVisible()
    await expect(page.getByRole("tab", { name: /^Entwurf$/ })).toBeVisible()
    await expect(page.getByRole("tab", { name: /^Signiert$/ })).toBeVisible()
    await expect(page.getByRole("tab", { name: /^Storniert$/ })).toBeVisible()

    // Total count label
    await expect(page.getByText("3 Arbeitsscheine")).toBeVisible()
  })

  test("Status-Filter-Tabs setzen URL-Param", async ({ page }) => {
    // State from the previous test still applies (3 rows)
    await navigateAndWaitList(page, "/admin/work-reports")

    await page.getByRole("tab", { name: /^Storniert$/ }).click()
    await expect(page).toHaveURL(/status=VOID/, { timeout: 5_000 })

    await page.getByRole("tab", { name: /^Alle$/ }).click()
    // "Alle" removes the status param
    await expect(page).not.toHaveURL(/status=/, { timeout: 5_000 })
  })

  test("URL-Persistenz: Reload behält Filter", async ({ page }) => {
    await navigateAndWaitList(page, "/admin/work-reports?status=SIGNED")
    await page.reload()
    await expect(
      page.getByRole("tab", { name: /^Signiert$/, selected: true }),
    ).toBeVisible({ timeout: 5_000 })
    // One SIGNED row present in seed
    await expect(page.getByText("1 Arbeitsschein")).toBeVisible()
  })

  test("Invalid URL-Status fällt auf 'Alle' zurück", async ({ page }) => {
    await navigateAndWaitList(page, "/admin/work-reports?status=FOOBAR")
    await expect(
      page.getByRole("tab", { name: /^Alle$/, selected: true }),
    ).toBeVisible({ timeout: 5_000 })
  })

  test("Row-Click navigiert zum Detail", async ({ page }) => {
    await navigateAndWaitList(page, "/admin/work-reports")
    await page.locator("table tbody tr").first().click()
    await expect(page).toHaveURL(
      /\/admin\/work-reports\/[0-9a-f-]{36}/,
      { timeout: 10_000 },
    )
    await expect(page.locator("h1").first()).toBeVisible()
  })

  test("Empty-State bei gefiltertem Tab zeigt keinen '+ Neu'-Button im Empty-Panel", async ({
    page,
  }) => {
    await resetWorkReports()
    // Seed one DRAFT + one SIGNED. Filter by SIGNED so the DRAFT tab
    // renders its empty state.
    await createDraftWorkReport({ orderId, withAssignment: true, withDescription: true })
    // Look at the DRAFT tab — 1 DRAFT exists, so filter by VOID instead.
    await navigateAndWaitList(page, "/admin/work-reports?status=VOID")
    await expect(
      page.getByText(
        "In der gewählten Status-Ansicht sind keine Arbeitsscheine vorhanden.",
      ),
    ).toBeVisible({ timeout: 10_000 })
    // The "+ Neu"-Button in the empty state is hidden when filter is active.
    // The header-level "Neu"-Button stays visible (it's outside the empty
    // state). We assert the in-empty-state button is not present.
    await expect(
      page.getByRole("button", { name: /Neuer Arbeitsschein/ }),
    ).toHaveCount(0)
  })

  test("Empty-State bei leerer 'Alle'-Liste zeigt 'Neuer Arbeitsschein'-Button", async ({
    page,
  }) => {
    await resetWorkReports()
    await navigateAndWaitList(page, "/admin/work-reports")
    await expect(page.getByText("Noch keine Arbeitsscheine")).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      page.getByRole("button", { name: /Neuer Arbeitsschein/ }),
    ).toBeVisible()
  })

  // ─── Cross-Surface ─────────────────────────────────────────────────

  test("Order-Detail-Tab zeigt nur die Arbeitsscheine des Auftrags", async ({
    page,
  }) => {
    await resetWorkReports()
    // One on orderId, one on order2Id — confirm filtering is correct.
    const onOrder1 = await createDraftWorkReport({
      orderId,
      withAssignment: true,
      withDescription: true,
    })
    await createDraftWorkReport({
      orderId: order2Id,
      withAssignment: true,
      withDescription: true,
    })

    await navigateTo(page, `/admin/orders/${orderId}`)
    await page.getByRole("tab", { name: "Arbeitsscheine" }).click()

    // Exactly 1 row in the table
    await expect(page.locator("table tbody tr")).toHaveCount(1, {
      timeout: 10_000,
    })
    // The code of the on-order row appears
    await expect(page.getByText(onOrder1.code)).toBeVisible()
  })

  test("ServiceObject-Detail-Tab zeigt verknüpfte Arbeitsscheine", async ({
    page,
  }) => {
    await resetWorkReports()
    const linked = await createDraftWorkReport({
      orderId,
      serviceObjectId,
      withAssignment: true,
      withDescription: true,
    })

    await navigateTo(page, `/serviceobjects/${serviceObjectId}`)
    await page
      .getByRole("tab", { name: /^Arbeitsscheine$/ })
      .click()

    await expect(page.getByText(linked.code)).toBeVisible({ timeout: 10_000 })
  })

  // ─── Cache-Invalidation regression (commit d42dcc1d) ───────────────

  test("Void auf Detail → Liste aktualisiert Status ohne Reload", async ({
    page,
  }) => {
    await resetWorkReports()
    const signed = await createSignedWorkReport({ orderId })

    // 1) Go to list → status is Signiert
    await navigateAndWaitList(page, "/admin/work-reports")
    const listRow = page.locator(`tr:has-text("${signed.code}")`)
    await expect(listRow).toBeVisible({ timeout: 10_000 })
    await expect(listRow.getByText("Signiert")).toBeVisible()

    // 2) Click the row → Detail
    await listRow.click()
    await expect(page).toHaveURL(
      /\/admin\/work-reports\/[0-9a-f-]{36}/,
      { timeout: 10_000 },
    )

    // 3) Open VOID dialog and submit
    await page.getByRole("button", { name: /Stornieren/ }).click()
    const reason = page.locator("#void-reason")
    await reason.fill("Cache-Invalidation-Regression-Test — lang genug")
    await page.getByRole("button", { name: /^Stornieren$/ }).last().click()

    // Wait for status change on the detail page
    await expect(page.getByText("Storniert").first()).toBeVisible({
      timeout: 15_000,
    })

    // 4) Navigate back to the list *without* reload. The breadcrumb
    // link triggers Next.js client-side navigation, which relies on the
    // cached list query being invalidated (regression from d42dcc1d).
    // Using the breadcrumb keeps us on the same browser context/tab —
    // a full `page.goto()` would bypass the cache entirely and hide
    // the regression.
    await page
      .getByRole("link", { name: /^Work Reports$/ })
      .click()
    await expect(page).toHaveURL(/\/admin\/work-reports(\?|$)/, {
      timeout: 10_000,
    })

    // 5) Assert the list row shows "Storniert" WITHOUT a reload
    const listRowAfter = page.locator(`tr:has-text("${signed.code}")`)
    await expect(listRowAfter.getByText("Storniert")).toBeVisible({
      timeout: 10_000,
    })
  })
})
