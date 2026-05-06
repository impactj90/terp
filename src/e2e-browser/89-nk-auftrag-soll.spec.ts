import { test, expect } from "@playwright/test"
import { SEED } from "./helpers/auth"
import { navigateTo } from "./helpers/nav"
import {
  disconnect,
  enableNkModule,
  ensureActivity,
  ensureOrderType,
  ensureWageGroup,
  getEmployeeWageGroupId,
  getOrderIdByCode,
  getOrderTargetVersions,
  resetNk,
  setEmployeeWageGroup,
} from "./helpers/nk-fixtures"

/**
 * UC-NK-89: NK-1 Auftrag + Soll-Erfassung
 *
 * Schritte 5, 6, 7, 8 aus dem 16-Schritte-Verifikations-Workflow:
 *
 *   5. Mitarbeiter mit WageGroup verknüpfen via Employee-Form-Sheet
 *   6. Auftrag mit OrderType anlegen via Order-Form-Sheet
 *   7. Tab "Nachkalkulation" sichtbar (Modul aktiv) + Empty-State + Capture-Button
 *   8. Soll-Werte erfassen mit PER_UNIT-Mengen-Position
 *      → Verlauf zeigt Version 1 mit Aktiv-Badge
 *
 * Fixtures (WageGroup, OrderType, PER_UNIT-Activity) werden in `beforeAll`
 * via Helper geseedet. Der Spec selbst treibt den UI-Flow.
 */

const STAMP = Date.now().toString().slice(-6)
const WG_CODE = `E2E-WG-MEIST-${STAMP}`
const WG_NAME = `E2E Meister ${STAMP}`
const OT_CODE = `E2E-OT-NOTD-${STAMP}`
const OT_NAME = `E2E Notdienst ${STAMP}`
const ACT_UNIT_CODE = `E2E-NK-LFM-${STAMP}`
const ACT_UNIT_NAME = `E2E Verlegung lfm ${STAMP}`
const ORDER_CODE = `E2E-NK-AUFTRAG-${STAMP}`
const ORDER_NAME = `E2E NK Auftrag ${STAMP}`

let createdOrderId = ""

test.describe.serial("UC-NK-89: NK-1 Auftrag + Soll-Erfassung", () => {
  test.beforeAll(async () => {
    await enableNkModule()
    await resetNk()
    await ensureWageGroup({
      code: WG_CODE,
      name: WG_NAME,
      internalHourlyRate: 35,
      billingHourlyRate: 95,
    })
    await ensureOrderType({ code: OT_CODE, name: OT_NAME })
    // PER_UNIT-Activity wird im UI-Flow per Code referenziert (im Soll-Sheet
    // über das Activity-Dropdown). Wir erstellen die Activity hier, aber
    // verwenden den ID nicht als Variable — der Test liest die ID via
    // Activity-Code-Filter im Dropdown.
    await ensureActivity({
      code: ACT_UNIT_CODE,
      name: ACT_UNIT_NAME,
      pricingType: "PER_UNIT",
      unit: "lfm",
      calculatedHourEquivalent: 0.1,
    })
  })

  test.afterAll(async () => {
    // Restore admin employee's wage_group_id (we set it during the spec).
    await setEmployeeWageGroup(SEED.ADMIN_EMPLOYEE_ID, null)
    await resetNk()
    await disconnect()
  })

  // ─── Schritt 5 — Mitarbeiter mit WageGroup ────────────────────────

  test("Mitarbeiter erhält WageGroup im Employee-Form-Sheet", async ({
    page,
  }) => {
    await navigateTo(page, `/admin/employees/${SEED.ADMIN_EMPLOYEE_ID}`)
    // Bearbeiten-Button im Header öffnen
    await page.getByRole("button", { name: /^Bearbeiten$/ }).click()
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" })

    // Lohngruppe-Select öffnen — nicht alle Selects haben einen ID-Trigger,
    // wir adressieren via Label.
    const wageGroupLabel = page.getByText("Lohngruppe", { exact: true })
    const wageGroupContainer = wageGroupLabel.locator("..")
    await wageGroupContainer.locator('button[role="combobox"]').click()
    await page
      .getByRole("option", { name: new RegExp(`${WG_CODE}.*${WG_NAME}`) })
      .first()
      .click()

    // Speichern
    await page
      .locator('[data-slot="sheet-footer"]')
      .getByRole("button", { name: /Änderungen speichern|Speichern/ })
      .last()
      .click()
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]'),
    ).toHaveCount(0, { timeout: 10_000 })

    // Reload + DetailRow "Lohngruppe" zeigt unseren Wert
    await page.reload()
    const lohngruppeRow = page
      .locator("div")
      .filter({ has: page.getByText("Lohngruppe", { exact: true }) })
      .first()
    await expect(lohngruppeRow).toContainText(WG_NAME)

    // DB-Check
    const dbWgId = await getEmployeeWageGroupId(SEED.ADMIN_EMPLOYEE_ID)
    expect(dbWgId).not.toBeNull()
  })

  // ─── Schritt 6 — Auftrag mit OrderType ────────────────────────────

  test("Auftrag mit OrderType anlegen", async ({ page }) => {
    await navigateTo(page, "/admin/orders")
    // Standard-Tab ist „Aufträge" — Header-Plus-Button heisst „Neuer Auftrag"
    await page
      .locator("main#main-content")
      .getByRole("button", { name: /Neuer Auftrag/i })
      .first()
      .click()
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" })

    await page.locator("#code").fill(ORDER_CODE)
    await page.locator("#name").fill(ORDER_NAME)

    // OrderType-Select
    await page.locator("#orderType").click()
    await page
      .getByRole("option", { name: new RegExp(`${OT_CODE}.*${OT_NAME}`) })
      .first()
      .click()

    // Submit
    await page
      .locator('[data-slot="sheet-footer"]')
      .getByRole("button", { name: /^Erstellen$/ })
      .click()
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]'),
    ).toHaveCount(0, { timeout: 10_000 })

    // Tabelle hat unseren Auftrag
    await expect(
      page.locator("table tbody tr").filter({ hasText: ORDER_CODE }),
    ).toBeVisible({ timeout: 10_000 })

    const orderId = await getOrderIdByCode(ORDER_CODE)
    expect(orderId).not.toBeNull()
    createdOrderId = orderId!
  })

  // ─── Schritt 7 — Tab "Nachkalkulation" sichtbar + Empty-State ─────

  test("Tab 'Nachkalkulation' sichtbar mit Empty-State und Capture-Button", async ({
    page,
  }) => {
    expect(createdOrderId).not.toBe("")
    await navigateTo(page, `/admin/orders/${createdOrderId}`)

    const nkTab = page.getByRole("tab", { name: "Nachkalkulation" })
    await expect(nkTab).toBeVisible({ timeout: 10_000 })
    await nkTab.click()

    // Tab aktiv?
    await expect(nkTab).toHaveAttribute("data-state", "active")

    // Capture-Button sichtbar (kein activeTarget → primary 'Soll-Werte erfassen')
    await expect(
      page.getByRole("button", { name: /^Soll-Werte erfassen$/ }),
    ).toBeVisible({ timeout: 5_000 })

    // Empty-State der NkSollIstSection zeigt 'Keine Soll-Werte'
    await expect(page.getByText("Keine Soll-Werte")).toBeVisible({
      timeout: 5_000,
    })
  })

  // ─── Schritt 8 — Soll-Werte erfassen (mit PER_UNIT-Mengen) ────────

  test("Soll-Werte v1 anlegen mit PER_UNIT-Mengen-Position + Verlauf", async ({
    page,
  }) => {
    expect(createdOrderId).not.toBe("")
    await navigateTo(
      page,
      `/admin/orders/${createdOrderId}?tab=nachkalkulation`,
    )

    // Capture öffnen
    await page
      .getByRole("button", { name: /^Soll-Werte erfassen$/ })
      .click()
    const sheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    )
    await sheet.waitFor({ state: "visible" })
    await expect(
      sheet.getByRole("heading", { name: "Soll-Werte erfassen" }),
    ).toBeVisible()

    // validFrom heute
    const today = new Date().toISOString().split("T")[0] ?? ""
    await page.locator("#validFrom").fill(today)

    // Standard-Werte
    await page.locator("#targetHours").fill("10")
    await page.locator("#targetMaterialCost").fill("250")
    await page.locator("#targetTravelMinutes").fill("60")
    await page.locator("#targetRevenue").fill("1200")

    // Mengen-Position hinzufügen
    await page
      .getByRole("button", { name: /Mengen-Position hinzufügen/ })
      .click()

    // Activity-Select öffnen — der Select-Trigger trägt die Placeholder
    // "Aktivität wählen" (i18n key `nachkalkulation.target.selectActivity`).
    // Wir warten bis er erscheint nach dem add-Click.
    const activityTrigger = page
      .locator('button[role="combobox"]')
      .filter({ hasText: "Aktivität wählen" })
      .first()
    await activityTrigger.waitFor({ state: "visible" })
    await activityTrigger.click()
    await page
      .getByRole("option", {
        name: new RegExp(`${ACT_UNIT_CODE}.*${ACT_UNIT_NAME}`),
      })
      .first()
      .click()

    // Quantity (Input mit placeholder = "Menge")
    await page.getByPlaceholder("Menge").first().fill("12")

    // Submit
    await page
      .locator('[data-slot="sheet-footer"]')
      .getByRole("button", { name: /^Speichern$/ })
      .click()
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]'),
    ).toHaveCount(0, { timeout: 10_000 })

    // DB-Verify: Version 1 existiert mit unseren Werten
    const versions = await getOrderTargetVersions(createdOrderId)
    expect(versions.length).toBe(1)
    expect(versions[0]!.version).toBe(1)
    expect(versions[0]!.targetHours).toBe(10)
    expect(versions[0]!.validTo).toBeNull() // active

    // 8b. „Verlauf anzeigen" → Sheet zeigt Version 1 mit Aktiv-Badge
    await page
      .getByRole("button", { name: /^Verlauf anzeigen$/ })
      .click()
    const historySheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    )
    await historySheet.waitFor({ state: "visible" })
    // Header
    await expect(historySheet.getByText("Soll-Versionen")).toBeVisible({
      timeout: 5_000,
    })
    // Version 1 + Aktiv-Badge
    await expect(historySheet.getByText("Version 1")).toBeVisible()
    await expect(historySheet.getByText("Aktiv")).toBeVisible()
  })
})
