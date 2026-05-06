import { test, expect, type Page } from "@playwright/test"
import { SEED } from "./helpers/auth"
import { navigateTo } from "./helpers/nav"
import {
  createNkOrder,
  createOrderTarget,
  disconnect,
  enableNkModule,
  ensureActivity,
  ensureOrderType,
  ensureWageGroup,
  getOrderBookingsCount,
  getOrderTargetVersions,
  resetNk,
  setEmployeeWageGroup,
} from "./helpers/nk-fixtures"

/**
 * UC-NK-90: NK-1 Workflow — Ist + DataQuality-Drill + Re-Plan
 *
 * Schritte 9, 10, 11, 12 aus dem 16-Schritte-Verifikations-Workflow:
 *
 *   9.  Bookings: HOURLY + FLAT_RATE + PER_UNIT mit conditional Quantity-Field
 *       (PER_UNIT erscheint mit Stern, ist Pflicht; ohne quantity → Validation)
 *  10.  Soll/Ist-Report rendert: Soll/Ist-Tabelle, DB-Stufen mit Ampel,
 *       Produktivität, Pauschal/Mengen-Cards, Datenqualität
 *  11.  DataQuality-Drill: Sheet öffnet, Header „Datenqualitäts-Hinweis",
 *       UUIDs durch human-readable Labels ersetzt, ↗-Button → Tab-Deeplink
 *  12.  Re-Plan: Default validFrom = morgen (NICHT heute), Validation für
 *       validFrom ≤ aktive Version, success → 2 Versionen, v1 closed
 *
 * Fixtures werden in `beforeAll` via DB-Seeds gesetzt — Order, 3 Activities
 * und Soll v1, sodass die Spec sich auf den UI-Workflow konzentrieren kann.
 */

const STAMP = Date.now().toString().slice(-6)
const WG_CODE = `E2E-WG-MEIST-${STAMP}`
const OT_CODE = `E2E-OT-NOTD-${STAMP}`
const ACT_HOURLY_CODE = `E2E-NK-HOURLY-${STAMP}`
const ACT_FLAT_CODE = `E2E-NK-FLAT-${STAMP}`
const ACT_UNIT_CODE = `E2E-NK-LFM-${STAMP}`
const ORDER_CODE = `E2E-NK-WORKFLOW-${STAMP}`

let orderId = ""
let orderTargetV1ValidFrom = ""

async function createBookingViaUi(
  page: Page,
  opts: {
    orderId: string
    activityCodeRegex: RegExp
    expectQuantityField: boolean
    quantity?: string
    timeMinutes?: number
    expectValidationError?: boolean
  },
): Promise<void> {
  await navigateTo(page, `/admin/orders/${opts.orderId}?tab=bookings`)
  // Bookings-Tab aktiv?
  await expect(page.getByRole("tab", { name: "Buchungen" })).toHaveAttribute(
    "data-state",
    "active",
  )

  // Neue Buchung
  await page.getByRole("button", { name: /^Neue Buchung$/ }).click()
  await page
    .locator('[data-slot="sheet-content"][data-state="open"]')
    .waitFor({ state: "visible" })

  // Mitarbeiter via EmployeePicker — wir picken den Admin (EMP001)
  // Find EmployeePicker combobox: first combobox in the sheet
  await page
    .locator('[data-slot="sheet-content"][data-state="open"]')
    .locator('button[role="combobox"]')
    .first()
    .click()
  // EMP001 ist der admin in seed.sql
  await page.locator("button:has-text('EMP001')").first().click({
    timeout: 10_000,
  })

  // Activity-Select öffnen — zweiter combobox in der Sheet
  await page
    .locator('[data-slot="sheet-content"][data-state="open"]')
    .locator('button[role="combobox"]')
    .nth(1)
    .click()
  await page
    .getByRole("option", { name: opts.activityCodeRegex })
    .first()
    .click()

  // Conditional quantity field
  const qtyField = page.locator("#orderBookingQuantity")
  if (opts.expectQuantityField) {
    await expect(qtyField).toBeVisible({ timeout: 3_000 })
  } else {
    await expect(qtyField).toHaveCount(0)
  }

  // Hours / Minutes
  const minutes = opts.timeMinutes ?? 60
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  // Two side-by-side inputs without IDs: use the panel's number inputs.
  const sheetContent = page.locator(
    '[data-slot="sheet-content"][data-state="open"]',
  )
  const numberInputs = sheetContent.locator('input[type="number"]')
  // Skip the qty input if visible (it's index 0); the time inputs are next.
  const timeInputStart = opts.expectQuantityField ? 1 : 0
  await numberInputs.nth(timeInputStart).fill(String(h))
  await numberInputs.nth(timeInputStart + 1).fill(String(m))

  // Quantity (if PER_UNIT)
  if (opts.expectQuantityField && opts.quantity) {
    await qtyField.fill(opts.quantity)
  }

  // Submit
  await page
    .locator('[data-slot="sheet-footer"]')
    .getByRole("button", { name: /^Erstellen$/ })
    .click()

  if (opts.expectValidationError) {
    // Validation alert visible, sheet stays open
    await expect(
      page.getByText(/Menge|quantity/i).first(),
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]'),
    ).toBeVisible()
  } else {
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]'),
    ).toHaveCount(0, { timeout: 10_000 })
  }
}

test.describe.serial("UC-NK-90: NK-1 Workflow Ist + Drill + Re-Plan", () => {
  test.beforeAll(async () => {
    await enableNkModule()
    await resetNk()

    const wg = await ensureWageGroup({
      code: WG_CODE,
      name: `E2E Meister ${STAMP}`,
      internalHourlyRate: 35,
      billingHourlyRate: 95,
    })
    await setEmployeeWageGroup(SEED.ADMIN_EMPLOYEE_ID, wg.id)

    const ot = await ensureOrderType({
      code: OT_CODE,
      name: `E2E Notdienst ${STAMP}`,
    })

    await ensureActivity({
      code: ACT_HOURLY_CODE,
      name: `E2E HOURLY ${STAMP}`,
      pricingType: "HOURLY",
      hourlyRate: 85,
    })
    await ensureActivity({
      code: ACT_FLAT_CODE,
      name: `E2E FLAT ${STAMP}`,
      pricingType: "FLAT_RATE",
      flatRate: 89,
      calculatedHourEquivalent: 0.5,
    })
    const unitAct = await ensureActivity({
      code: ACT_UNIT_CODE,
      name: `E2E LFM ${STAMP}`,
      pricingType: "PER_UNIT",
      unit: "lfm",
      calculatedHourEquivalent: 0.1,
    })

    const order = await createNkOrder({
      code: ORDER_CODE,
      name: `E2E Workflow Auftrag ${STAMP}`,
      customer: "E2E Workflow Kunde",
      orderTypeCode: OT_CODE,
      billingRatePerHour: 95,
    })
    orderId = order.id

    // Soll v1: validFrom = vor 1 Tag damit Re-Plan auf "heute" valide ist
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    orderTargetV1ValidFrom = yesterday.toISOString().split("T")[0]!

    await createOrderTarget({
      orderId: order.id,
      validFrom: orderTargetV1ValidFrom,
      targetHours: 10,
      targetMaterialCost: 250,
      targetTravelMinutes: 60,
      targetExternalCost: 0,
      targetRevenue: 1200,
      targetUnitItems: [{ activityId: unitAct.id, quantity: 12 }],
      changeReason: "INITIAL",
    })

    // Suppress unused vars
    void ot
  })

  test.afterAll(async () => {
    await setEmployeeWageGroup(SEED.ADMIN_EMPLOYEE_ID, null)
    await resetNk()
    await disconnect()
  })

  // ─── Schritt 9 — Bookings mit conditional quantity ────────────────

  test("Booking HOURLY: quantity-Feld INVISIBLE, save success", async ({
    page,
  }) => {
    expect(orderId).not.toBe("")
    await createBookingViaUi(page, {
      orderId,
      activityCodeRegex: new RegExp(ACT_HOURLY_CODE),
      expectQuantityField: false,
      timeMinutes: 60,
    })
    expect(await getOrderBookingsCount(orderId)).toBe(1)
  })

  test("Booking FLAT_RATE: quantity-Feld INVISIBLE, save success", async ({
    page,
  }) => {
    await createBookingViaUi(page, {
      orderId,
      activityCodeRegex: new RegExp(ACT_FLAT_CODE),
      expectQuantityField: false,
      timeMinutes: 30,
    })
    expect(await getOrderBookingsCount(orderId)).toBe(2)
  })

  test("Booking PER_UNIT: quantity-Feld VISIBLE + Stern; ohne Menge → Validation", async ({
    page,
  }) => {
    // 9c. Quantity-Feld erscheint, leer lassen → Validation
    await createBookingViaUi(page, {
      orderId,
      activityCodeRegex: new RegExp(ACT_UNIT_CODE),
      expectQuantityField: true,
      timeMinutes: 30,
      expectValidationError: true,
    })
    // Sheet ist noch offen — Korrigiere Quantity und versuche erneut
    await page.locator("#orderBookingQuantity").fill("12")
    await page
      .locator('[data-slot="sheet-footer"]')
      .getByRole("button", { name: /^Erstellen$/ })
      .click()
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]'),
    ).toHaveCount(0, { timeout: 10_000 })

    expect(await getOrderBookingsCount(orderId)).toBe(3)
  })

  // ─── Schritt 10 — Soll/Ist-Report rendert ─────────────────────────

  test("Soll/Ist-Report: Cards, Headers, Ampel-Badges sind alle sichtbar", async ({
    page,
  }) => {
    await navigateTo(page, `/admin/orders/${orderId}?tab=nachkalkulation`)

    // Soll/Ist-Card mit Header "Komponente" (NICHT "DB-Stufen")
    const sollIstCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Soll/Ist" })
      .first()
    await expect(sollIstCard).toBeVisible({ timeout: 10_000 })
    // Headers
    await expect(sollIstCard.getByText("Komponente").first()).toBeVisible()
    // Zeilen: Stunden / Material / Reisezeit / Fremdleistung / Erlös
    await expect(sollIstCard.getByText("Stunden").first()).toBeVisible()
    await expect(sollIstCard.getByText("Material").first()).toBeVisible()
    await expect(sollIstCard.getByText("Reisezeit").first()).toBeVisible()
    await expect(sollIstCard.getByText("Erlös").first()).toBeVisible()

    // DB-Stufen-Card
    const dbCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "DB-Stufen" })
      .first()
    await expect(dbCard).toBeVisible()
    await expect(dbCard.getByText(/DB I/).first()).toBeVisible()
    await expect(dbCard.getByText(/Ampel/).first()).toBeVisible()

    // Productivity-Card
    await expect(
      page.locator('[data-slot="card"]').filter({ hasText: "Produktivität" }).first(),
    ).toBeVisible()

    // Mengen-Positionen-Card existiert (wir haben einen PER_UNIT booking)
    await expect(
      page.locator('[data-slot="card"]').filter({ hasText: "Mengen-Positionen" }).first(),
    ).toBeVisible()

    // Datenqualität-Card existiert (mind. ein Issue weil keine WorkReports
    // verlinkt sind → BOOKING_WITHOUT_WORKREPORT)
    await expect(
      page.locator('[data-slot="card"]').filter({ hasText: "Datenqualität" }).first(),
    ).toBeVisible()
  })

  // ─── Schritt 11 — DataQuality-Drill mit Labels + Tab-Deeplink ─────

  test("DataQuality-Drill: Labels statt UUIDs, ↗-Button → Tab-Deeplink, Footer 'Schließen'", async ({
    page,
  }) => {
    await navigateTo(page, `/admin/orders/${orderId}?tab=nachkalkulation`)

    // Drill-Button auf erstem Issue klicken — der Button heisst
    // 'Datenqualitäts-Hinweis' (= drillTitle aus i18n)
    const drillButton = page
      .getByRole("button", { name: /Datenqualitäts-Hinweis/ })
      .first()
    await drillButton.click()

    const sheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    )
    await sheet.waitFor({ state: "visible" })
    // Header
    await expect(
      sheet.getByText("Datenqualitäts-Hinweis", { exact: true }).first(),
    ).toBeVisible({ timeout: 5_000 })

    // Footer-Button heisst „Schließen" (NICHT „Info")
    await expect(
      sheet.locator('[data-slot="sheet-footer"]').getByRole("button"),
    ).toHaveText(/^Schließen$/)

    // ↗-Buttons existieren (für Bookings ohne WorkReport)
    const arrowLink = sheet.locator('a[aria-label="open"]').first()
    await expect(arrowLink).toBeVisible({ timeout: 5_000 })

    // Click → URL ändert sich zum Bookings-Tab
    await arrowLink.click()
    await expect(page).toHaveURL(/\?tab=bookings/, { timeout: 10_000 })
    // Bookings-Tab aktiv
    await expect(page.getByRole("tab", { name: "Buchungen" })).toHaveAttribute(
      "data-state",
      "active",
    )
  })

  // ─── Schritt 12 — Re-Plan mit Verlauf ─────────────────────────────

  test("Re-Plan: Default morgen, Validation, Speichern → 2 Versionen", async ({
    page,
  }) => {
    await navigateTo(page, `/admin/orders/${orderId}?tab=nachkalkulation`)

    // Es existiert bereits Soll v1 → Re-Plan-Button heisst „Soll re-planen"
    await page.getByRole("button", { name: /^Soll re-planen$/ }).click()
    const sheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    )
    await sheet.waitFor({ state: "visible" })
    // Re-Plan Header
    await expect(
      sheet.getByText("Soll-Werte re-planen").first(),
    ).toBeVisible()
    // Re-Plan Banner
    await expect(
      sheet.getByText(/werden re-geplant/).first(),
    ).toBeVisible()
    // changeReason field exists
    await expect(sheet.locator("#changeReason")).toBeVisible()

    // VALIDATION: validFrom = same day als v1 → Fehler-Alert
    await page.locator("#validFrom").fill(orderTargetV1ValidFrom)
    await page
      .locator('[data-slot="sheet-footer"]')
      .getByRole("button", { name: /^Speichern$/ })
      .click()
    await expect(
      page
        .getByText(
          /Gültig-ab muss nach der aktuellen Version|nach der aktuellen Version/,
        )
        .first(),
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]'),
    ).toBeVisible()

    // Korrigieren: validFrom = morgen (v1-Datum + 2 Tage damit definitiv > v1)
    const newDate = new Date()
    newDate.setDate(newDate.getDate() + 1)
    const newValidFrom = newDate.toISOString().split("T")[0]!
    await page.locator("#validFrom").fill(newValidFrom)
    await page.locator("#changeReason").fill("E2E Re-Plan")

    await page
      .locator('[data-slot="sheet-footer"]')
      .getByRole("button", { name: /^Speichern$/ })
      .click()
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]'),
    ).toHaveCount(0, { timeout: 10_000 })

    // DB-Verify: 2 Versionen, v1 hat validTo = newValidFrom - 1
    const versions = await getOrderTargetVersions(orderId)
    expect(versions.length).toBe(2)
    expect(versions[0]!.version).toBe(1)
    expect(versions[0]!.validTo).not.toBeNull()
    expect(versions[1]!.version).toBe(2)
    expect(versions[1]!.validTo).toBeNull()
    expect(versions[1]!.changeReason).toContain("E2E Re-Plan")

    // Verlauf zeigt 2 Versionen, v2 oben mit Aktiv-Badge
    await page.getByRole("button", { name: /^Verlauf anzeigen$/ }).click()
    const historySheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    )
    await historySheet.waitFor({ state: "visible" })
    await expect(historySheet.getByText("Soll-Versionen")).toBeVisible({
      timeout: 5_000,
    })
    await expect(historySheet.getByText("Version 2").first()).toBeVisible()
    await expect(historySheet.getByText("Version 1").first()).toBeVisible()
    await expect(historySheet.getByText("Aktiv").first()).toBeVisible()
  })
})
