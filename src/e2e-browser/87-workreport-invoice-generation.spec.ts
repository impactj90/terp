/**
 * UC-WR-87: Rechnung aus Arbeitsschein erzeugen — R-1 Desktop-Workflow
 *
 * Plan: thoughts/shared/plans/2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md
 *
 *   Flow A — Happy-Path: Schein im SIGNED-Zustand, Buchungen + Anfahrt
 *            → Klick "Rechnung erzeugen" → Dialog → Position entfernen
 *            + manuelle Position hinzufügen → "Erzeugen" → Navigation
 *            zur DRAFT-Rechnung.
 *   Flow B — Empty-State: SIGNED-Schein ohne Buchungen + ohne Anfahrt.
 *            Banner sichtbar, "Erzeugen" disabled bis manuelle Position
 *            angelegt wird.
 *   Flow C — Cleanup nach Test.
 *
 *   Erweiterungen (Manual-Verifikations-Automation, 2026-04-28):
 *     - Booking-Sheet Filter (DRAFT-only, scoped to current order)
 *     - Stundensatz-Chain (Order > Employee > 0 → manualPrice)
 *     - Inline-Edit alle 4 Felder; manuelle Position add/remove
 *     - NoAddress-Banner blockiert Submit
 *     - Storno-via-UI → Re-Generate; VOID-Schein zeigt leere Action-Bar
 *     - Audit-Log-Cross-Link Assertion
 *
 * Fixtures werden via SQL geseedet (analog zu UC-WR-01).
 */
import { test, expect } from "@playwright/test"
import { Pool } from "pg"
import { navigateTo } from "./helpers/nav"
import { SEED } from "./helpers/auth"
import {
  clearServiceObject,
  createSignedWorkReport,
  disconnect,
  ensureSeedOrderForWorkReport,
  fetchAuditLogsForEntity,
  fetchBillingDocumentByWorkReport,
  resetWorkReports,
  seedSecondOrderWithSO,
  setEmployeeRate,
  setOrderRate,
} from "./helpers/work-report-fixtures"

// Re-create the pool here so we don't need to expose it from the helper.
const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:54322/postgres"

let _pool: Pool | null = null
function pool(): Pool {
  if (_pool === null) {
    _pool = new Pool({ connectionString: CONNECTION_STRING, max: 2 })
  }
  return _pool
}
async function pgEnd() {
  if (_pool !== null) {
    await _pool.end()
    _pool = null
  }
}

const STAMP = Date.now().toString().slice(-6)

interface SeededOrder {
  id: string
  code: string
  customerAddressId: string
  serviceObjectId: string
}

async function ensureSeedAddressAndServiceObject(
  orderId: string,
): Promise<{ addressId: string; serviceObjectId: string }> {
  // Reuse existing seed customer
  const customerRes = await pool().query<{ id: string }>(
    `SELECT id FROM crm_addresses
       WHERE tenant_id = $1 AND type IN ('CUSTOMER','BOTH')
       ORDER BY created_at ASC LIMIT 1`,
    [SEED.TENANT_ID],
  )
  let addressId = customerRes.rows[0]?.id
  if (!addressId) {
    const ins = await pool().query<{ id: string }>(
      `INSERT INTO crm_addresses (tenant_id, number, type, company, is_active)
        VALUES ($1, 'K-E2E-INV', 'CUSTOMER', 'E2E Invoice Kunde GmbH', true)
        RETURNING id`,
      [SEED.TENANT_ID],
    )
    addressId = ins.rows[0]!.id
  }

  // Find or create the SO
  const soRes = await pool().query<{ id: string }>(
    `SELECT id FROM service_objects
       WHERE tenant_id = $1 AND number = 'SO-E2E-INV-1' LIMIT 1`,
    [SEED.TENANT_ID],
  )
  let serviceObjectId = soRes.rows[0]?.id
  if (!serviceObjectId) {
    const ins = await pool().query<{ id: string }>(
      `INSERT INTO service_objects (
          tenant_id, number, name, customer_address_id, is_active,
          status, kind, qr_code_payload, created_at, updated_at
        )
        VALUES ($1, 'SO-E2E-INV-1', 'E2E Invoice Anlage', $2, true,
                'OPERATIONAL', 'EQUIPMENT',
                'TERP:SO:1000:SO-E2E-INV-1', NOW(), NOW())
        RETURNING id`,
      [SEED.TENANT_ID, addressId],
    )
    serviceObjectId = ins.rows[0]!.id
  }

  // Link SO to order so address resolution finds it
  await pool().query(
    `UPDATE orders SET service_object_id = $2,
                       billing_rate_per_hour = 75.00
       WHERE id = $1`,
    [orderId, serviceObjectId],
  )

  return { addressId, serviceObjectId }
}

async function seedBookingsForWorkReport(
  orderId: string,
  workReportId: string,
  bookings: Array<{ timeMinutes: number; description?: string }>,
) {
  for (const b of bookings) {
    await pool().query(
      `INSERT INTO order_bookings (
          tenant_id, employee_id, order_id, work_report_id,
          booking_date, time_minutes, description, source,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, 'manual', NOW(), NOW())`,
      [
        SEED.TENANT_ID,
        SEED.ADMIN_EMPLOYEE_ID,
        orderId,
        workReportId,
        b.timeMinutes,
        b.description ?? null,
      ],
    )
  }
}

async function setTravelMinutes(workReportId: string, minutes: number) {
  await pool().query(
    `UPDATE work_reports SET travel_minutes = $2 WHERE id = $1`,
    [workReportId, minutes],
  )
}

async function setSeedOrder(): Promise<SeededOrder> {
  const order = await ensureSeedOrderForWorkReport()
  const { addressId, serviceObjectId } = await ensureSeedAddressAndServiceObject(
    order.id,
  )
  return {
    id: order.id,
    code: order.code,
    customerAddressId: addressId,
    serviceObjectId,
  }
}

async function cleanupBillingArtifacts() {
  await pool().query(
    `DELETE FROM billing_documents
       WHERE tenant_id = $1 AND number LIKE 'RE-%'
         AND work_report_id IS NOT NULL`,
    [SEED.TENANT_ID],
  )
  await pool().query(
    `DELETE FROM order_bookings
       WHERE tenant_id = $1 AND work_report_id IS NOT NULL`,
    [SEED.TENANT_ID],
  )
}

/**
 * Reset Order + all Employee rates to a known baseline:
 *   - Seed Order keeps rate 75.00 (matches `setSeedOrder()` baseline)
 *   - All employees: hourly_rate = NULL
 *
 * Called from the Stundensatz-Chain sub-describe's `beforeEach` so each
 * test starts from a deterministic state regardless of execution order.
 */
async function restoreSeedRates(): Promise<void> {
  await pool().query(
    `UPDATE orders
        SET billing_rate_per_hour = 75.00, updated_at = NOW()
      WHERE tenant_id = $1 AND code = 'E2E-WR-AUFTRAG-1'`,
    [SEED.TENANT_ID],
  )
  await pool().query(
    `UPDATE employees
        SET hourly_rate = NULL, updated_at = NOW()
      WHERE tenant_id = $1`,
    [SEED.TENANT_ID],
  )
}

test.describe.serial("UC-WR-87: Rechnung aus Arbeitsschein — R-1", () => {
  let order: SeededOrder

  test.beforeAll(async () => {
    await cleanupBillingArtifacts()
    await resetWorkReports()
    order = await setSeedOrder()
  })

  test.afterAll(async () => {
    await cleanupBillingArtifacts()
    await resetWorkReports()
    await disconnect()
    await pgEnd()
  })

  test("Booking-Sheet zeigt nur DRAFT-Arbeitsscheine des Auftrags", async ({
    page,
  }) => {
    // Setup: ORDER1 (existing seed) + ORDER2 (fresh) — each with a SO so
    // the address-resolution does not fall over during seeding. Three WRs
    // span both orders + both statuses to prove the dropdown filter.
    const order2 = await seedSecondOrderWithSO()

    const wrDraft1 = await pool().query<{ id: string; code: string }>(
      `INSERT INTO work_reports (tenant_id, order_id, service_object_id,
                                 code, visit_date, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, 'DRAFT', NOW(), NOW())
        RETURNING id, code`,
      [
        SEED.TENANT_ID,
        order.id,
        order.serviceObjectId,
        `AS-E2E-FILTER-D1-${STAMP}`,
      ],
    )
    const wrSigned2 = await createSignedWorkReport({
      orderId: order.id,
      serviceObjectId: order.serviceObjectId,
    })
    const wrDraft3 = await pool().query<{ id: string; code: string }>(
      `INSERT INTO work_reports (tenant_id, order_id, service_object_id,
                                 code, visit_date, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, 'DRAFT', NOW(), NOW())
        RETURNING id, code`,
      [
        SEED.TENANT_ID,
        order2.id,
        order2.serviceObjectId,
        `AS-E2E-FILTER-D3-${STAMP}`,
      ],
    )

    await navigateTo(page, `/admin/orders/${order.id}`)
    // Click the "Buchungen" tab
    await page.getByRole("tab", { name: /Buchungen/ }).click()
    // Click "Neue Buchung" — opens the order-booking-form-sheet
    await page.getByRole("button", { name: /Neue Buchung/ }).click()

    // Open the Arbeitsschein <Select> (radix combobox)
    const wrSelect = page
      .getByRole("combobox", { name: /Arbeitsschein/ })
      .first()
    await expect(wrSelect).toBeVisible({ timeout: 10_000 })
    await wrSelect.click()

    // Assertions: only WR-DRAFT-1 (current order, DRAFT) is offered.
    const draft1Code = wrDraft1.rows[0]!.code
    const signed2Code = wrSigned2.code
    const draft3Code = wrDraft3.rows[0]!.code

    await expect(
      page.getByRole("option", { name: new RegExp(draft1Code) }),
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      page.getByRole("option", { name: new RegExp(signed2Code) }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("option", { name: new RegExp(draft3Code) }),
    ).toHaveCount(0)

    // Pick WR-DRAFT-1 + minimum-required form values, then save.
    await page
      .getByRole("option", { name: new RegExp(draft1Code) })
      .click()
    // Date input is type=date and pre-filled to today; leave it.
    // Hours: 1, minutes: 0 → 60 minutes total.
    await page.locator('input[type="number"]').first().fill("1")
    // Submit (Erstellen)
    await page.getByRole("button", { name: /^Erstellen$/ }).click()

    // SQL: the booking now references the picked DRAFT WR.
    const linked = await pool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM order_bookings
         WHERE tenant_id = $1 AND order_id = $2 AND work_report_id = $3`,
      [SEED.TENANT_ID, order.id, wrDraft1.rows[0]!.id],
    )
    expect(parseInt(linked.rows[0]!.count, 10)).toBe(1)
  })

  test("Happy path: Dialog erzeugt DRAFT-Rechnung mit allen Positionen", async ({
    page,
  }) => {
    const wr = await createSignedWorkReport({
      orderId: order.id,
      serviceObjectId: order.serviceObjectId,
    })
    await seedBookingsForWorkReport(order.id, wr.id, [
      { timeMinutes: 60, description: "Filter A" },
      { timeMinutes: 90, description: "Filter B" },
    ])
    await setTravelMinutes(wr.id, 30)

    await navigateTo(page, `/admin/work-reports/${wr.id}`)
    await expect(page.getByText(wr.code).first()).toBeVisible({ timeout: 10_000 })

    // Click "Rechnung erzeugen"
    const generateBtn = page.getByRole("button", { name: /^Rechnung erzeugen$/ })
    await expect(generateBtn).toBeVisible({ timeout: 5_000 })
    await generateBtn.click()

    // Dialog should show 3 proposed positions (2 labor + 1 travel)
    await expect(
      page.getByText(/Rechnung aus Arbeitsschein/),
    ).toBeVisible({ timeout: 10_000 })

    // Wait for the proposals to load — the Filter A row should appear.
    // Use input value selector via locator, since Page#getByDisplayValue
    // is not available in the @playwright/test version used here.
    await expect(page.locator('input[value="Filter A"]')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.locator('input[value="Filter B"]')).toBeVisible()

    // Click "Erzeugen"
    const submitBtn = page.getByRole("button", { name: /^Erzeugen$/ })
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 })
    await submitBtn.click()

    // Toast + navigation to billing-document detail page
    await page.waitForURL(/\/orders\/documents\/[a-f0-9-]+/, {
      timeout: 15_000,
    })

    // Verify in DB that doc exists with workReportId set + 3 positions
    const docs = await pool().query<{ id: string; status: string }>(
      `SELECT id, status FROM billing_documents
         WHERE tenant_id = $1 AND work_report_id = $2`,
      [SEED.TENANT_ID, wr.id],
    )
    expect(docs.rows.length).toBe(1)
    expect(docs.rows[0]!.status).toBe("DRAFT")

    const positions = await pool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM billing_document_positions
         WHERE document_id = $1`,
      [docs.rows[0]!.id],
    )
    expect(parseInt(positions.rows[0]!.count, 10)).toBe(3) // 2 labor + 1 travel
  })

  // -------------------------------------------------------------------------
  // Stundensatz-Chain — proves Order > Employee > 0/null fallback. Each test
  // re-establishes a known baseline via `restoreSeedRates()` so order-of-
  // execution does not bleed state. Inner `describe.serial` is fine — the
  // outer block is already serial.
  // -------------------------------------------------------------------------
  test.describe.serial("Stundensatz-Chain", () => {
    test.beforeEach(async () => {
      await restoreSeedRates()
    })

    test("Order-Rate gewinnt vor Employee-Rate", async ({ page }) => {
      await setOrderRate(order.id, 75)
      await setEmployeeRate(SEED.ADMIN_EMPLOYEE_ID, 99)

      const wr = await createSignedWorkReport({
        orderId: order.id,
        serviceObjectId: order.serviceObjectId,
      })
      await seedBookingsForWorkReport(order.id, wr.id, [
        { timeMinutes: 60, description: "Arbeit X" },
      ])

      await navigateTo(page, `/admin/work-reports/${wr.id}`)
      await page.getByRole("button", { name: /^Rechnung erzeugen$/ }).click()
      await expect(page.locator('input[value="Arbeit X"]')).toBeVisible({
        timeout: 10_000,
      })

      // Order rate (75) wins over Employee rate (99).
      const priceInputs = page.locator('input[type="number"]')
      // input layout: [quantity, unitPrice, vatRate] per row → index 1 is unitPrice
      const unitPrice = await priceInputs.nth(1).inputValue()
      expect(parseFloat(unitPrice)).toBe(75)

      // No requiresManualPrice border.
      await expect(
        page.locator('div.border-destructive'),
      ).toHaveCount(0)
    })

    test("Employee-Rate als Fallback wenn Order-Rate null", async ({ page }) => {
      await setOrderRate(order.id, null)
      await setEmployeeRate(SEED.ADMIN_EMPLOYEE_ID, 50)

      const wr = await createSignedWorkReport({
        orderId: order.id,
        serviceObjectId: order.serviceObjectId,
      })
      await seedBookingsForWorkReport(order.id, wr.id, [
        { timeMinutes: 60, description: "Arbeit Y" },
      ])

      await navigateTo(page, `/admin/work-reports/${wr.id}`)
      await page.getByRole("button", { name: /^Rechnung erzeugen$/ }).click()
      await expect(page.locator('input[value="Arbeit Y"]')).toBeVisible({
        timeout: 10_000,
      })

      const unitPrice = await page
        .locator('input[type="number"]')
        .nth(1)
        .inputValue()
      expect(parseFloat(unitPrice)).toBe(50)
      await expect(
        page.locator('div.border-destructive'),
      ).toHaveCount(0)
    })

    test("Keine Rate → 0 EUR + rote Border + Tooltip", async ({ page }) => {
      await setOrderRate(order.id, null)
      await setEmployeeRate(SEED.ADMIN_EMPLOYEE_ID, null)

      const wr = await createSignedWorkReport({
        orderId: order.id,
        serviceObjectId: order.serviceObjectId,
      })
      await seedBookingsForWorkReport(order.id, wr.id, [
        { timeMinutes: 60, description: "Arbeit Z" },
      ])

      await navigateTo(page, `/admin/work-reports/${wr.id}`)
      await page.getByRole("button", { name: /^Rechnung erzeugen$/ }).click()
      await expect(page.locator('input[value="Arbeit Z"]')).toBeVisible({
        timeout: 10_000,
      })

      const unitPrice = await page
        .locator('input[type="number"]')
        .nth(1)
        .inputValue()
      expect(parseFloat(unitPrice)).toBe(0)
      // The wrapping div carries the destructive border classes.
      await expect(
        page.locator('div.border-destructive').first(),
      ).toBeVisible()
    })

    test("0,00 Order-Rate fällt auf Employee-Rate zurück (Regression)", async ({
      page,
    }) => {
      // Regression for the manual-verifikation bug: Order.billingRatePerHour
      // = 0 was treated as "rate set, equal to 0 EUR". The bridge service
      // now coerces <= 0 to NULL via toPositiveRate(), falling back to the
      // Employee.hourlyRate. This test guards against that fix regressing.
      await setOrderRate(order.id, 0)
      await setEmployeeRate(SEED.ADMIN_EMPLOYEE_ID, 50)

      const wr = await createSignedWorkReport({
        orderId: order.id,
        serviceObjectId: order.serviceObjectId,
      })
      await seedBookingsForWorkReport(order.id, wr.id, [
        { timeMinutes: 60, description: "Regression Test" },
      ])

      await navigateTo(page, `/admin/work-reports/${wr.id}`)
      await page.getByRole("button", { name: /^Rechnung erzeugen$/ }).click()
      await expect(
        page.locator('input[value="Regression Test"]'),
      ).toBeVisible({ timeout: 10_000 })

      const unitPrice = await page
        .locator('input[type="number"]')
        .nth(1)
        .inputValue()
      // Must NOT be 0 — Employee-Rate (50) takes over.
      expect(parseFloat(unitPrice)).toBe(50)
    })
  })

  // -------------------------------------------------------------------------
  // Inline-Edit — manipulates all four mutable fields in one row, asserts
  // recalc + DB persistence after submit.
  // -------------------------------------------------------------------------
  test("Inline-Edit aller 4 Felder aktualisiert Summen + DB", async ({
    page,
  }) => {
    await restoreSeedRates() // Order-Rate=75, Employee-Rate=null
    const wr = await createSignedWorkReport({
      orderId: order.id,
      serviceObjectId: order.serviceObjectId,
    })
    await seedBookingsForWorkReport(order.id, wr.id, [
      { timeMinutes: 60, description: "Original Beschreibung" },
    ])

    await navigateTo(page, `/admin/work-reports/${wr.id}`)
    await page.getByRole("button", { name: /^Rechnung erzeugen$/ }).click()
    await expect(
      page.locator('input[value="Original Beschreibung"]'),
    ).toBeVisible({ timeout: 10_000 })

    // input layout per row: [Beschreibung text] [Menge num] [Einheit text]
    //                       [Einzel num] [VAT num]. We target the only
    // editable row in the table.
    const descInput = page.locator('input[value="Original Beschreibung"]')
    await descInput.fill("E2E Test Beschreibung")

    const numInputs = page.locator('input[type="number"]')
    // Menge (idx 0): 1 → 2
    await numInputs.nth(0).fill("2")
    // Einzel (idx 1): 75 → 100
    await numInputs.nth(1).fill("100")

    // Einheit (text): "h" → "Std"  — only text input that is not the desc.
    // The desc input now holds "E2E Test Beschreibung" so we target by
    // its current value: any text input that holds "h".
    const unitInput = page.locator('input[type="text"][value="h"]').first()
    await unitInput.fill("Std")

    // Footer net total: 2 * 100 = 200,00 EUR
    await expect(page.getByText(/200,00\s*EUR|200\.00\s*EUR/)).toBeVisible()

    // Submit
    await page.getByRole("button", { name: /^Erzeugen$/ }).click()
    await page.waitForURL(/\/orders\/documents\/[a-f0-9-]+/, {
      timeout: 15_000,
    })

    // SQL: position reflects all 4 edits.
    const docs = await pool().query<{ id: string }>(
      `SELECT id FROM billing_documents
         WHERE tenant_id = $1 AND work_report_id = $2 AND status = 'DRAFT'`,
      [SEED.TENANT_ID, wr.id],
    )
    const docId = docs.rows[0]!.id
    const positions = await pool().query<{
      description: string
      quantity: string
      unit: string
      unit_price: string
    }>(
      `SELECT description, quantity::text, unit, unit_price::text
         FROM billing_document_positions
        WHERE document_id = $1`,
      [docId],
    )
    expect(positions.rows.length).toBe(1)
    expect(positions.rows[0]!.description).toBe("E2E Test Beschreibung")
    expect(parseFloat(positions.rows[0]!.quantity)).toBe(2)
    expect(positions.rows[0]!.unit).toBe("Std")
    expect(parseFloat(positions.rows[0]!.unit_price)).toBe(100)
  })

  // -------------------------------------------------------------------------
  // Manuelle Position add/remove — verifies the Plus/Trash buttons work
  // in tandem and the totals re-aggregate.
  // -------------------------------------------------------------------------
  test("Manuelle Position hinzufügen + via Trash entfernen", async ({
    page,
  }) => {
    await restoreSeedRates()
    const wr = await createSignedWorkReport({
      orderId: order.id,
      serviceObjectId: order.serviceObjectId,
    })
    await seedBookingsForWorkReport(order.id, wr.id, [
      { timeMinutes: 60, description: "Ausgangs-Buchung" },
    ])

    await navigateTo(page, `/admin/work-reports/${wr.id}`)
    await page.getByRole("button", { name: /^Rechnung erzeugen$/ }).click()
    await expect(
      page.locator('input[value="Ausgangs-Buchung"]'),
    ).toBeVisible({ timeout: 10_000 })

    // Initial total: 60min * 75/h = 75
    await expect(page.getByText(/75,00\s*EUR|75\.00\s*EUR/).first()).toBeVisible()

    // Add manual position
    await page
      .getByRole("button", { name: /Manuelle Position hinzufügen/ })
      .click()

    const descInput = page
      .getByPlaceholder(/Beschreibung der manuellen Position/)
      .first()
    await descInput.fill("Material")

    // The new manual row's number inputs come AFTER the labor row's
    // [quantity, unitPrice, vatRate] block (idx 0,1,2) → manual row's
    // quantity=idx 3, unitPrice=idx 4. quantity defaults to 1; we set
    // unitPrice to 50.
    const numInputs = page.locator('input[type="number"]')
    await numInputs.nth(4).fill("50")

    // Total now 75 + 50 = 125
    await expect(
      page.getByText(/125,00\s*EUR|125\.00\s*EUR/).first(),
    ).toBeVisible()

    // Click Trash icon on the manual row (last row → last trash button).
    const trashBtns = page.getByRole("button", { name: /Entfernen/ })
    await trashBtns.last().click()

    // Total back to 75
    await expect(
      page.getByText(/75,00\s*EUR|75\.00\s*EUR/).first(),
    ).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // NoAddress-Banner — proves the dialog refuses to submit when the WR has
  // no resolvable customer address (ServiceObject detached).
  // -------------------------------------------------------------------------
  test("NoAddress-Banner sichtbar wenn ServiceObject fehlt", async ({
    page,
  }) => {
    const wr = await createSignedWorkReport({
      orderId: order.id,
      serviceObjectId: order.serviceObjectId,
    })
    await seedBookingsForWorkReport(order.id, wr.id, [
      { timeMinutes: 60, description: "NoAddress-Buchung" },
    ])
    await clearServiceObject(wr.id)

    await navigateTo(page, `/admin/work-reports/${wr.id}`)
    await page.getByRole("button", { name: /^Rechnung erzeugen$/ }).click()

    // Banner — regex stays loose so a translation tweak does not snap it.
    await expect(
      page.getByText(/Service-Objekt.*Kunden-Adresse|kein Service-Objekt/i),
    ).toBeVisible({ timeout: 10_000 })

    // Submit disabled
    await expect(
      page.getByRole("button", { name: /^Erzeugen$/ }),
    ).toBeDisabled()

    // The position table is suppressed when hasNoAddress.
    await expect(page.locator('input[value="NoAddress-Buchung"]')).toHaveCount(
      0,
    )
  })

  // -------------------------------------------------------------------------
  // Empty-State (existing) — kept here in slot 7 per plan ordering.
  // -------------------------------------------------------------------------
  test("Empty-State: Schein ohne Buchungen + ohne Anfahrt — manuelle Position aktiviert Submit", async ({
    page,
  }) => {
    const wr = await createSignedWorkReport({
      orderId: order.id,
      serviceObjectId: order.serviceObjectId,
    })
    // No bookings, travelMinutes already null after seed
    await navigateTo(page, `/admin/work-reports/${wr.id}`)
    await expect(page.getByText(wr.code).first()).toBeVisible()

    await page.getByRole("button", { name: /^Rechnung erzeugen$/ }).click()

    // Empty-state info banner visible
    await expect(
      page.getByText(/Keine Buchungen.*keine Anfahrt|Sie können manuelle/i),
    ).toBeVisible({ timeout: 10_000 })

    // Erzeugen disabled
    const submitBtn = page.getByRole("button", { name: /^Erzeugen$/ })
    await expect(submitBtn).toBeDisabled()

    // Add manual position via the button
    await page
      .getByRole("button", { name: /Manuelle Position hinzufügen/ })
      .click()

    // Fill in the new manual row — the empty description input is the only
    // text input in the table now.
    const descInput = page
      .getByPlaceholder(/Beschreibung der manuellen Position/)
      .first()
    await descInput.fill("Sondermaterial")

    // Submit should now be enabled
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 })
  })

  // -------------------------------------------------------------------------
  // Idempotenz (existing) — moved into slot 8 per plan order.
  // -------------------------------------------------------------------------
  test("Zweiter Generate-Versuch zeigt 'Zur Rechnung'-Button statt Erzeugen", async ({
    page,
  }) => {
    // Re-open any SIGNED WorkReport that has a non-CANCELLED billing doc
    // (Happy-Path + Inline-Edit + Manuelle Position all leave such state
    // behind). The assertion holds for every match.
    const wrRow = await pool().query<{ id: string }>(
      `SELECT id FROM work_reports
         WHERE tenant_id = $1 AND status = 'SIGNED'
           AND id IN (
             SELECT work_report_id FROM billing_documents
              WHERE tenant_id = $1 AND work_report_id IS NOT NULL
                AND status != 'CANCELLED'
           )
         LIMIT 1`,
      [SEED.TENANT_ID],
    )
    const wrId = wrRow.rows[0]?.id
    if (!wrId) {
      test.skip(true, "Setup-Order: vorheriger Test erzeugt keine Rechnung")
      return
    }

    await navigateTo(page, `/admin/work-reports/${wrId}`)
    // The Action-Bar should now show "Zur Rechnung RE-…" instead of
    // "Rechnung erzeugen".
    await expect(
      page.getByRole("link", { name: /Zur Rechnung RE-/ }),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByRole("button", { name: /^Rechnung erzeugen$/ }),
    ).toHaveCount(0)
  })

  // -------------------------------------------------------------------------
  // Storno + Re-Generate — drives Storno via the document-detail UI so the
  // audit log + status transition match real operator behavior. After
  // Storno, the WR action-bar offers "Rechnung erzeugen" again, and a
  // second invoice can be created with the same `work_report_id`.
  // -------------------------------------------------------------------------
  test("Nach Storno-UI ist Re-Generate möglich; work_report_id bleibt verlinkt", async ({
    page,
  }) => {
    await restoreSeedRates()
    const wr = await createSignedWorkReport({
      orderId: order.id,
      serviceObjectId: order.serviceObjectId,
    })
    await seedBookingsForWorkReport(order.id, wr.id, [
      { timeMinutes: 60, description: "Storno-Buchung" },
    ])

    // Generate first invoice via the dialog.
    await navigateTo(page, `/admin/work-reports/${wr.id}`)
    await page.getByRole("button", { name: /^Rechnung erzeugen$/ }).click()
    await expect(page.locator('input[value="Storno-Buchung"]')).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole("button", { name: /^Erzeugen$/ }).click()
    await page.waitForURL(/\/orders\/documents\/[a-f0-9-]+/, {
      timeout: 15_000,
    })

    const initialDoc = await fetchBillingDocumentByWorkReport(wr.id)
    expect(initialDoc).not.toBeNull()
    const initialDocId = initialDoc!.id

    // Storno: click the "Stornieren" button, then confirm in the sheet.
    // The detail page renders the i18n key `cancelDocument` ("Stornieren"
    // in de.json). The confirm sheet's primary button reuses the same key.
    await page
      .getByRole("button", { name: /^Stornieren$/ })
      .first()
      .click()

    // Confirm sheet: click the destructive Stornieren button (now there
    // are two — page-level + sheet — so wait for the sheet then click
    // the second one).
    const confirmBtns = page.getByRole("button", { name: /^Stornieren$/ })
    await expect(confirmBtns).toHaveCount(2, { timeout: 5_000 })
    await confirmBtns.last().click()

    // Wait for the API to commit; assert via SQL.
    await expect
      .poll(
        async () => {
          const r = await pool().query<{ status: string }>(
            `SELECT status FROM billing_documents WHERE id = $1`,
            [initialDocId],
          )
          return r.rows[0]?.status ?? null
        },
        { timeout: 10_000 },
      )
      .toBe("CANCELLED")

    // Back to WR detail: action-bar should offer "Rechnung erzeugen" again.
    await navigateTo(page, `/admin/work-reports/${wr.id}`)
    const generateBtn2 = page.getByRole("button", {
      name: /^Rechnung erzeugen$/,
    })
    await expect(generateBtn2).toBeVisible({ timeout: 10_000 })
    await generateBtn2.click()
    await expect(page.locator('input[value="Storno-Buchung"]')).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole("button", { name: /^Erzeugen$/ }).click()
    await page.waitForURL(/\/orders\/documents\/[a-f0-9-]+/, {
      timeout: 15_000,
    })

    // SQL: 2 docs with the same work_report_id, one CANCELLED + one DRAFT.
    const docs = await pool().query<{ id: string; status: string }>(
      `SELECT id, status FROM billing_documents
         WHERE tenant_id = $1 AND work_report_id = $2
         ORDER BY created_at ASC`,
      [SEED.TENANT_ID, wr.id],
    )
    expect(docs.rows.length).toBe(2)
    const statuses = docs.rows.map((r) => r.status).sort()
    expect(statuses).toEqual(["CANCELLED", "DRAFT"])
  })

  // -------------------------------------------------------------------------
  // VOID — once a WR is VOID, the action-bar offers no invoice actions.
  // We drive VOID through the existing void-dialog (Reason ≥10 chars).
  // -------------------------------------------------------------------------
  test("VOID-Schein zeigt leere Action-Bar", async ({ page }) => {
    const wr = await createSignedWorkReport({
      orderId: order.id,
      serviceObjectId: order.serviceObjectId,
    })

    await navigateTo(page, `/admin/work-reports/${wr.id}`)
    await expect(page.getByText(wr.code).first()).toBeVisible({
      timeout: 10_000,
    })

    // Click the page-level "Stornieren" button (opens VoidDialog).
    await page
      .getByRole("button", { name: /^Stornieren$/ })
      .first()
      .click()

    // Reason ≥10 chars (16 chars below).
    await page
      .getByPlaceholder(/Warum wird der Arbeitsschein/)
      .fill("E2E Test Storno")

    // Click the Stornieren button inside the void dialog.
    const voidConfirmBtns = page.getByRole("button", { name: /^Stornieren$/ })
    await expect(voidConfirmBtns).toHaveCount(2, { timeout: 5_000 })
    await voidConfirmBtns.last().click()

    // Wait until DB reports VOID.
    await expect
      .poll(
        async () => {
          const r = await pool().query<{ status: string }>(
            `SELECT status FROM work_reports WHERE id = $1`,
            [wr.id],
          )
          return r.rows[0]?.status ?? null
        },
        { timeout: 10_000 },
      )
      .toBe("VOID")

    // Hard reload to pick up server state, then assert no invoice action.
    await navigateTo(page, `/admin/work-reports/${wr.id}`)
    await expect(
      page.getByRole("button", { name: /^Rechnung erzeugen$/ }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("link", { name: /Zur Rechnung/ }),
    ).toHaveCount(0)
  })

  // -------------------------------------------------------------------------
  // Audit-Log dual-write — `generate_invoice` on the WR + `create_from_wr`
  // on the BillingDocument, both with cross-link metadata.
  // -------------------------------------------------------------------------
  test("Generate schreibt 2 Cross-Link audit_logs (generate_invoice + create_from_wr)", async ({
    page,
  }) => {
    await restoreSeedRates()
    const wr = await createSignedWorkReport({
      orderId: order.id,
      serviceObjectId: order.serviceObjectId,
    })
    await seedBookingsForWorkReport(order.id, wr.id, [
      { timeMinutes: 60, description: "Audit-Test-Buchung" },
    ])

    await navigateTo(page, `/admin/work-reports/${wr.id}`)
    await page.getByRole("button", { name: /^Rechnung erzeugen$/ }).click()
    await expect(
      page.locator('input[value="Audit-Test-Buchung"]'),
    ).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: /^Erzeugen$/ }).click()
    await page.waitForURL(/\/orders\/documents\/[a-f0-9-]+/, {
      timeout: 15_000,
    })

    const doc = await fetchBillingDocumentByWorkReport(wr.id)
    expect(doc).not.toBeNull()
    const docId = doc!.id

    // WR-side audit row: action='generate_invoice', metadata.generated*.
    const wrLogs = await fetchAuditLogsForEntity("work_report", wr.id)
    const generateLog = wrLogs.find((l) => l.action === "generate_invoice")
    expect(generateLog).toBeTruthy()
    expect(generateLog!.metadata).toMatchObject({
      generatedDocumentId: docId,
      generatedDocumentNumber: doc!.number,
    })

    // Doc-side audit row: action='create_from_wr', metadata.sourceWorkReport*.
    const docLogs = await fetchAuditLogsForEntity("billing_document", docId)
    const createFromLog = docLogs.find((l) => l.action === "create_from_wr")
    expect(createFromLog).toBeTruthy()
    expect(createFromLog!.metadata).toMatchObject({
      sourceWorkReportId: wr.id,
      sourceWorkReportCode: wr.code,
    })
  })
})
