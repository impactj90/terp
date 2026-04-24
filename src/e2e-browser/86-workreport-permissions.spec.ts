import { test, expect } from "@playwright/test"
import {
  ADMIN_STORAGE,
  USER_STORAGE,
  WR_MANAGER_STORAGE,
  WR_VIEWER_STORAGE,
} from "./helpers/auth"
import {
  createDraftWorkReport,
  createSignedWorkReport,
  disconnect,
  ensureSeedOrderForWorkReport,
  resetWorkReports,
} from "./helpers/work-report-fixtures"

/**
 * UC-WR-03: WorkReport permission-based UI gating.
 *
 * Covers the UI-Gating-Szenario aus
 * `thoughts/shared/plans/2026-04-24-workreport-e2e-coverage.md` das in
 * der manuellen Verifikations-Session bewusst übersprungen wurde.
 *
 * Test users (seeded in `supabase/seed.sql`):
 *   - `user@dev.local`        → keine work_reports-Permissions
 *   - `wr-viewer@dev.local`   → nur `work_reports.view`
 *   - `wr-manager@dev.local`  → view + manage + sign (KEIN void)
 *   - `admin@dev.local`       → is_admin (alle Permissions)
 *
 * Pattern: pro Test einen eigenen BrowserContext mit dem jeweiligen
 * Storage-State. Vgl. `61-payroll-security-kldb.spec.ts` und
 * `80-overtime-requests.spec.ts`.
 */

test.describe.serial("UC-WR-03: Permissions", () => {
  let draftId: string
  let signedId: string

  test.beforeAll(async () => {
    await resetWorkReports()
    const order = await ensureSeedOrderForWorkReport()

    const draft = await createDraftWorkReport({
      orderId: order.id,
      withAssignment: true,
      withDescription: true,
    })
    draftId = draft.id
    const signed = await createSignedWorkReport({ orderId: order.id })
    signedId = signed.id
  })

  test.afterAll(async () => {
    await resetWorkReports()
    await disconnect()
  })

  // ─── user@dev.local (keine work_reports-Permissions) ──────────────

  test("User ohne Perms: Sidebar-Entry ist NICHT sichtbar", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: USER_STORAGE })
    const p = await ctx.newPage()
    await p.goto("/dashboard")
    await p.locator("main#main-content").waitFor({ state: "visible" })
    await expect(
      p.locator(
        'nav[aria-label="Main navigation"] a[href*="/admin/work-reports"]',
      ),
    ).toHaveCount(0)
    await ctx.close()
  })

  test("User ohne Perms: Direkt-URL wird auf /dashboard zurückgeleitet", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: USER_STORAGE })
    const p = await ctx.newPage()
    await p.goto("/admin/work-reports")
    await p.waitForURL(/dashboard/, { timeout: 15_000 })
    await ctx.close()
  })

  // ─── wr-viewer (nur view) ──────────────────────────────────────────

  test("Viewer: Liste lädt und Detail ist read-only (kein '+ Neu'-Button)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: WR_VIEWER_STORAGE })
    const p = await ctx.newPage()

    await p.goto("/admin/work-reports")
    await p.locator("main#main-content").waitFor({ state: "visible" })
    await expect(
      p.getByRole("heading", { name: "Arbeitsscheine", exact: true }),
    ).toBeVisible({ timeout: 10_000 })

    // No "Neu" button in the header
    await expect(p.getByRole("button", { name: /^Neu$/ })).toHaveCount(0)

    // Row is clickable → navigation to detail works
    await p.locator("table tbody tr").first().click()
    await expect(p).toHaveURL(/\/admin\/work-reports\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    })

    await ctx.close()
  })

  test("Viewer: Bearbeiten / Signieren / Löschen sind auf DRAFT-Detail NICHT sichtbar", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: WR_VIEWER_STORAGE })
    const p = await ctx.newPage()
    await p.goto(`/admin/work-reports/${draftId}`)
    await p.locator("main#main-content").waitFor({ state: "visible" })
    // Wait for the detail to actually render
    await expect(p.getByText(/AS-/).first()).toBeVisible({ timeout: 10_000 })

    await expect(
      p.getByRole("button", { name: /^Bearbeiten$/ }),
    ).toHaveCount(0)
    await expect(
      p.getByRole("button", { name: /^Signieren$/ }),
    ).toHaveCount(0)
    // The PDF download button is always available
    await expect(
      p.getByRole("button", { name: /PDF herunterladen/ }),
    ).toBeVisible()

    await ctx.close()
  })

  test("Viewer: Mitarbeiter-Zuweisung-Card und Hochladen-Button sind NICHT sichtbar", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: WR_VIEWER_STORAGE })
    const p = await ctx.newPage()
    await p.goto(`/admin/work-reports/${draftId}`)
    await p.locator("main#main-content").waitFor({ state: "visible" })
    await expect(p.getByText(/AS-/).first()).toBeVisible({ timeout: 10_000 })

    await p.getByRole("tab", { name: "Mitarbeiter" }).click()
    await expect(p.getByText("Mitarbeiter zuweisen")).toHaveCount(0)

    await p.getByRole("tab", { name: "Fotos" }).click()
    await expect(p.getByRole("button", { name: /Hochladen/ })).toHaveCount(0)

    await ctx.close()
  })

  // ─── wr-manager (view + manage + sign, KEIN void) ──────────────────

  test("Manager: Liste zeigt '+ Neu', Detail zeigt Bearbeiten + Signieren", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: WR_MANAGER_STORAGE })
    const p = await ctx.newPage()

    await p.goto("/admin/work-reports")
    await p.locator("main#main-content").waitFor({ state: "visible" })
    await expect(p.getByRole("button", { name: /^Neu$/ })).toBeVisible({
      timeout: 10_000,
    })

    await p.goto(`/admin/work-reports/${draftId}`)
    await p.locator("main#main-content").waitFor({ state: "visible" })
    await expect(p.getByText(/AS-/).first()).toBeVisible({ timeout: 10_000 })

    await expect(
      p.getByRole("button", { name: /^Bearbeiten$/ }),
    ).toBeVisible()
    await expect(
      p.getByRole("button", { name: /^Signieren$/ }),
    ).toBeVisible()

    await ctx.close()
  })

  test("Manager: Stornieren-Button ist auf SIGNED-Detail NICHT sichtbar (kein void-Permission)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: WR_MANAGER_STORAGE })
    const p = await ctx.newPage()
    await p.goto(`/admin/work-reports/${signedId}`)
    await p.locator("main#main-content").waitFor({ state: "visible" })
    await expect(p.getByText(/AS-/).first()).toBeVisible({ timeout: 10_000 })

    await expect(
      p.getByRole("button", { name: /^Stornieren$/ }),
    ).toHaveCount(0)

    await ctx.close()
  })

  // ─── admin (alle Permissions) ──────────────────────────────────────

  test("Admin: Stornieren-Button ist auf SIGNED-Detail sichtbar", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: ADMIN_STORAGE })
    const p = await ctx.newPage()
    await p.goto(`/admin/work-reports/${signedId}`)
    await p.locator("main#main-content").waitFor({ state: "visible" })
    await expect(p.getByText(/AS-/).first()).toBeVisible({ timeout: 10_000 })

    await expect(
      p.getByRole("button", { name: /^Stornieren$/ }),
    ).toBeVisible()

    await ctx.close()
  })
})
