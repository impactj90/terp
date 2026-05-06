import { test, expect } from "@playwright/test"
import { SEED } from "./helpers/auth"
import { navigateTo } from "./helpers/nav"
import {
  createNkOrder,
  disableNkModule,
  disconnect,
  enableNkModule,
  ensureActivity,
  ensureOrderType,
  ensureWageGroup,
  resetNk,
  setEmployeeWageGroup,
} from "./helpers/nk-fixtures"

/**
 * UC-NK-92: NK-1 i18n + Module-Gate
 *
 * Schritt 16 + Negativ-Tests:
 *
 *  16. EN-Locale via /en/admin/* — alle NK-Strings übersetzt:
 *      Wage Groups, Order Types, Plan/Actual, CM I/II, Plan/Actual
 *      Thresholds, Plan/Actual — Reports, Plan/Actual — Top/Flop.
 *
 *  Modul-Off:
 *      `disableNkModule()` → NK-Tab am Order-Detail unsichtbar,
 *      Threshold-Section in /admin/settings unsichtbar, Reports-Page
 *      403 / redirect, Dashboard-Card unsichtbar.
 *      Cleanup re-aktiviert das Modul.
 *
 * Dieser Spec MUSS am Schluss laufen — er manipuliert globale Tenant-
 * State. Die Datei-Reihenfolge (92-) garantiert das.
 */

const STAMP = Date.now().toString().slice(-6)
const ORDER_CODE = `E2E-NK-I18N-${STAMP}`
const WG_CODE = `E2E-WG-I18N-${STAMP}`
const OT_CODE = `E2E-OT-I18N-${STAMP}`

let orderId = ""

test.describe.serial("UC-NK-92: NK-1 i18n + Module-Gate", () => {
  test.beforeAll(async () => {
    await enableNkModule()
    await resetNk()

    // Wir brauchen einen Auftrag, um den NK-Tab am Order-Detail prüfen
    // zu können (mit/ohne Modul).
    const wg = await ensureWageGroup({
      code: WG_CODE,
      name: `E2E i18n WG ${STAMP}`,
      internalHourlyRate: 30,
      billingHourlyRate: 80,
    })
    await setEmployeeWageGroup(SEED.ADMIN_EMPLOYEE_ID, wg.id)
    await ensureOrderType({ code: OT_CODE, name: `E2E i18n OT ${STAMP}` })
    await ensureActivity({
      code: `E2E-NK-I18N-ACT-${STAMP}`,
      name: `E2E i18n Activity ${STAMP}`,
      pricingType: "HOURLY",
      hourlyRate: 60,
    })
    const order = await createNkOrder({
      code: ORDER_CODE,
      name: `E2E i18n Auftrag ${STAMP}`,
      orderTypeCode: OT_CODE,
    })
    orderId = order.id
  })

  test.afterAll(async () => {
    // Modul wieder aktivieren falls Negativ-Tests fehlschlagen
    await enableNkModule()
    await setEmployeeWageGroup(SEED.ADMIN_EMPLOYEE_ID, null)
    await resetNk()
    await disconnect()
  })

  // ─── Schritt 16 — i18n EN ─────────────────────────────────────────

  test("EN-Locale: Wage Groups Page-Title übersetzt", async ({ page }) => {
    await navigateTo(page, "/en/admin/wage-groups")
    await expect(
      page.getByRole("heading", { name: "Wage Groups", exact: true }),
    ).toBeVisible({ timeout: 10_000 })
    // NICHT die deutsche Variante
    await expect(
      page.getByRole("heading", { name: "Lohngruppen", exact: true }),
    ).toHaveCount(0)
  })

  test("EN-Locale: Order Types Page-Title übersetzt", async ({ page }) => {
    await navigateTo(page, "/en/admin/order-types")
    await expect(
      page.getByRole("heading", { name: "Order Types", exact: true }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("EN-Locale: NK-Tab am Order-Detail heisst 'Plan/Actual'", async ({
    page,
  }) => {
    await navigateTo(page, `/en/admin/orders/${orderId}?tab=nachkalkulation`)
    // Tab-Trigger 'Plan/Actual'
    await expect(
      page.getByRole("tab", { name: "Plan/Actual" }),
    ).toBeVisible({ timeout: 10_000 })
    // CM I, CM II via DB-Stufen
    await expect(page.getByText(/CM I /).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test("EN-Locale: Settings-Section heisst 'Plan/Actual Thresholds'", async ({
    page,
  }) => {
    await navigateTo(page, "/en/admin/settings")
    const section = page.locator("section#nachkalkulation")
    await expect(
      section.getByRole("heading", { name: "Plan/Actual Thresholds" }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("EN-Locale: Reports-Page Header übersetzt", async ({ page }) => {
    await navigateTo(page, "/en/admin/nachkalkulation/reports")
    await expect(
      page.getByRole("heading", { name: "Plan/Actual — Reports" }),
    ).toBeVisible({ timeout: 10_000 })
    // Tab-Labels
    await expect(page.getByRole("tab", { name: /By Customer/ })).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /By Order Type/ }),
    ).toBeVisible()
  })

  test("EN-Locale: Dashboard-Card 'Plan/Actual — Top/Flop'", async ({
    page,
  }) => {
    await navigateTo(page, "/en/dashboard")
    await expect(
      page
        .locator('[data-slot="card"]')
        .filter({ hasText: "Plan/Actual — Top/Flop" })
        .first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  // ─── Modul-Gate Negativ-Tests ─────────────────────────────────────

  test("Modul-Off: NK-Tab, Reports-Page und Settings-Section verschwinden", async ({
    page,
  }) => {
    // 1) Modul ausschalten
    await disableNkModule()

    try {
      // Order-Detail: kein „Nachkalkulation"-Tab
      await navigateTo(page, `/admin/orders/${orderId}`)
      await expect(
        page.getByRole("tab", { name: "Nachkalkulation" }),
      ).toHaveCount(0, { timeout: 10_000 })

      // /admin/settings: keine Threshold-Section
      await navigateTo(page, "/admin/settings")
      await expect(page.locator("section#nachkalkulation")).toHaveCount(0, {
        timeout: 10_000,
      })

      // Dashboard: keine NkDashboardCard
      await navigateTo(page, "/dashboard")
      await expect(
        page
          .locator('[data-slot="card"]')
          .filter({ hasText: "Nachkalkulation — Top/Flop" }),
      ).toHaveCount(0, { timeout: 10_000 })

      // Reports-Page: lädt zwar als URL, der Inhalt sollte aber den
      // Modul-Off-Hinweis (loadError) zeigen oder leer sein. Hauptsache:
      // keine erfolgreiche Aggregation rendert.
      await navigateTo(page, "/admin/nachkalkulation/reports")
      // moduleDisabled-Alert-Text ('module ist nicht aktiviert' / 'load error')
      // Soll mind. EINER der beiden Indikatoren zutreffen:
      //   - moduleDisabled-Alert
      //   - keine Tabelle mit Daten (rein leerer Zustand)
      const noRows = page.locator("table tbody tr")
      const moduleOffAlert = page
        .locator('[role="alert"]')
        .filter({ hasText: /Daten konnten nicht geladen werden|Modul/ })
      // Mindestens eine der Bedingungen
      const tableCount = await noRows.count()
      const alertCount = await moduleOffAlert.count()
      expect(tableCount === 0 || alertCount > 0).toBe(true)
    } finally {
      // Modul IMMER wieder aktivieren
      await enableNkModule()
    }
  })

  test("Modul-On (restored): NK-Tab und Settings-Section sind wieder sichtbar", async ({
    page,
  }) => {
    await enableNkModule()
    // Order-Detail
    await navigateTo(page, `/admin/orders/${orderId}`)
    await expect(
      page.getByRole("tab", { name: "Nachkalkulation" }),
    ).toBeVisible({ timeout: 10_000 })

    // Settings-Section
    await navigateTo(page, "/admin/settings")
    await expect(page.locator("section#nachkalkulation")).toBeVisible({
      timeout: 10_000,
    })
  })
})
