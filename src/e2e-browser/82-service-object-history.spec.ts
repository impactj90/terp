import { test, expect } from "@playwright/test"
import { navigateTo } from "./helpers/nav"
import { SEED } from "./helpers/auth"
import {
  resetServiceObjects,
  ensureSeedCustomer,
  serviceObjectIdByNumber,
  resetHistoryForServiceObject,
  createOrderForServiceObject,
  createOrderAssignment,
  createOrderBooking,
  ensureSeedArticle,
  createWithdrawalForServiceObject,
  adminUserId,
  disconnect,
} from "./helpers/service-object-fixtures"

const STAMP = Date.now().toString().slice(-6)
const SO_NUMBER = `SO-HIST-${STAMP}`
const SO_NAME = `History SO ${STAMP}`
const SO_EMPTY_NUMBER = `SO-HIST-E-${STAMP}`
const SO_EMPTY_NAME = `Empty SO ${STAMP}`
const ORDER_OLD = `ORD-HIST-O-${STAMP}`
const ORDER_NEW = `ORD-HIST-N-${STAMP}`
const ART_NUMBER = `ART-HIST-${STAMP}`

let soId = ""
let soEmptyId = ""
let orderOldId = ""
let orderNewId = ""
let articleId = ""
let adminUid = ""

test.describe.serial("UC-SO-02: Service Object — Historie-Tab", () => {
  test.beforeAll(async () => {
    await resetServiceObjects()
    const customer = await ensureSeedCustomer()
    adminUid = await adminUserId()

    // Create two service objects via SQL (faster than the UI path — UI
    // creation is already covered by 81-service-objects.spec.ts).
    const { Pool } = await import("pg")
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:54322/postgres",
      max: 1,
    })
    await pool.query(
      `INSERT INTO service_objects (tenant_id, number, name, kind, customer_address_id, qr_code_payload)
       VALUES ($1, $2, $3, 'EQUIPMENT', $4, $5), ($1, $6, $7, 'EQUIPMENT', $4, $8)`,
      [
        SEED.TENANT_ID,
        SO_NUMBER,
        SO_NAME,
        customer.id,
        `TERP:SO:${SEED.TENANT_ID.slice(0, 6)}:${SO_NUMBER}`,
        SO_EMPTY_NUMBER,
        SO_EMPTY_NAME,
        `TERP:SO:${SEED.TENANT_ID.slice(0, 6)}:${SO_EMPTY_NUMBER}`,
      ]
    )
    await pool.end()

    soId = await serviceObjectIdByNumber(SO_NUMBER)
    soEmptyId = await serviceObjectIdByNumber(SO_EMPTY_NUMBER)
    await resetHistoryForServiceObject(soId)
    await resetHistoryForServiceObject(soEmptyId)

    // 2 orders, staggered dates — ORDER_NEW must be the "last service"
    orderOldId = await createOrderForServiceObject({
      code: ORDER_OLD,
      name: `${ORDER_OLD} name`,
      serviceObjectId: soId,
      createdAtIso: "2026-01-10T10:00:00Z",
    })
    orderNewId = await createOrderForServiceObject({
      code: ORDER_NEW,
      name: `${ORDER_NEW} name`,
      serviceObjectId: soId,
      createdAtIso: "2026-03-15T10:00:00Z",
    })

    // Admin employee as assigned technician on both orders
    await createOrderAssignment({
      orderId: orderOldId,
      employeeId: SEED.ADMIN_EMPLOYEE_ID,
    })
    await createOrderAssignment({
      orderId: orderNewId,
      employeeId: SEED.ADMIN_EMPLOYEE_ID,
    })

    // 3 bookings total
    await createOrderBooking({
      orderId: orderOldId,
      employeeId: SEED.ADMIN_EMPLOYEE_ID,
      minutes: 60,
      bookingDateIso: "2026-01-12",
    })
    await createOrderBooking({
      orderId: orderNewId,
      employeeId: SEED.ADMIN_EMPLOYEE_ID,
      minutes: 120,
      bookingDateIso: "2026-03-18",
    })
    await createOrderBooking({
      orderId: orderNewId,
      employeeId: SEED.ADMIN_EMPLOYEE_ID,
      minutes: 30,
      bookingDateIso: "2026-03-19",
    })

    // Article + 2 withdrawals (pinned to admin user so we can assert the
    // user-column renders "Admin" style rather than a UUID) + 1 DELIVERY_NOTE
    // movement (needed for the article-movements-tab badge assertion).
    articleId = await ensureSeedArticle({
      number: ART_NUMBER,
      name: `Article ${STAMP}`,
    })
    await createWithdrawalForServiceObject({
      serviceObjectId: soId,
      articleId,
      quantity: 3,
      createdById: adminUid || undefined,
      dateIso: "2026-03-10T09:00:00Z",
    })
    await createWithdrawalForServiceObject({
      serviceObjectId: soId,
      articleId,
      quantity: 1,
      createdById: adminUid || undefined,
      dateIso: "2026-03-11T09:00:00Z",
    })
    await createWithdrawalForServiceObject({
      serviceObjectId: soId,
      articleId,
      quantity: 2,
      createdById: adminUid || undefined,
      dateIso: "2026-03-12T09:00:00Z",
      type: "DELIVERY_NOTE",
    })
  })

  test.afterAll(async () => {
    if (soId) await resetHistoryForServiceObject(soId)
    if (soEmptyId) await resetHistoryForServiceObject(soEmptyId)
    await resetServiceObjects()
    await disconnect()
  })

  // ─── Populated SO: overview + Historie tab ───────────────────

  test("last-service card shows the newest order (UC-B1)", async ({ page }) => {
    await navigateTo(page, `/serviceobjects/${soId}`)
    await expect(page.getByText(SO_NAME)).toBeVisible({ timeout: 10_000 })

    await expect(page.getByText("Letzter Einsatz")).toBeVisible()
    await expect(page.getByText(new RegExp(ORDER_NEW))).toBeVisible()
  })

  test("history tab renders orders + movements with correct totals (UC-B2)", async ({
    page,
  }) => {
    await navigateTo(page, `/serviceobjects/${soId}`)

    await page.getByRole("tab", { name: "Historie" }).click()

    await expect(page.getByText("Einsätze", { exact: true })).toBeVisible()
    await expect(
      page.getByText("Materialentnahmen", { exact: true })
    ).toBeVisible()

    await expect(page.getByText(ORDER_OLD).first()).toBeVisible()
    await expect(page.getByText(ORDER_NEW).first()).toBeVisible()

    // Totals: 2 orders, 3 movements
    await expect(page.getByText(/2\s*Einsätze/)).toBeVisible()
    await expect(page.getByText(/3\s*Entnahmen/)).toBeVisible()

    // Article number appears in a movement row
    await expect(page.getByText(ART_NUMBER).first()).toBeVisible()
  })

  test('"Zur Historie" link switches to Historie tab (UC-B3)', async ({ page }) => {
    await navigateTo(page, `/serviceobjects/${soId}`)
    await page.getByRole("button", { name: "Zur Historie" }).click()
    await expect(
      page.getByText("Einsätze", { exact: true })
    ).toBeVisible({ timeout: 5_000 })
  })

  // ─── Empty-state SO (UC-G1) ──────────────────────────────────

  test("SO without history: last-service card shows empty state", async ({
    page,
  }) => {
    await navigateTo(page, `/serviceobjects/${soEmptyId}`)
    await expect(page.getByText(SO_EMPTY_NAME)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Noch kein Einsatz erfasst")).toBeVisible()
  })

  test("SO without history: Historie tab shows both empty-section placeholders", async ({
    page,
  }) => {
    await navigateTo(page, `/serviceobjects/${soEmptyId}`)
    await page.getByRole("tab", { name: "Historie" }).click()
    await expect(
      page.getByText("Keine Einsätze für dieses Serviceobjekt.")
    ).toBeVisible()
    await expect(
      page.getByText("Keine Materialentnahmen für dieses Serviceobjekt.")
    ).toBeVisible()
  })

  // ─── CRM tab (UC-B4 + UC-G13) ────────────────────────────────

  test("CRM address detail exposes the Serviceobjekte tab (UC-B4)", async ({
    page,
  }) => {
    const customer = await ensureSeedCustomer()
    await navigateTo(page, `/crm/addresses/${customer.id}`)
    await page.getByRole("tab", { name: "Serviceobjekte" }).click()
    await expect(page.getByText(SO_NUMBER).first()).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByText(SO_EMPTY_NUMBER).first()).toBeVisible()
  })

  test("CRM tab → click SO → navigates to SO detail (UC-G13)", async ({
    page,
  }) => {
    const customer = await ensureSeedCustomer()
    await navigateTo(page, `/crm/addresses/${customer.id}`)
    await page.getByRole("tab", { name: "Serviceobjekte" }).click()
    // The tree renders each SO as an anchor to /serviceobjects/<id>.
    await page.locator(`a[href*="/serviceobjects/${soId}"]`).first().click()
    await page.waitForURL(new RegExp(`/serviceobjects/${soId}`), {
      timeout: 5_000,
    })
    await expect(page.getByText(SO_NAME)).toBeVisible({ timeout: 5_000 })
  })

  // ─── Warehouse Withdrawal-History (UC-G7, UC-G9) ─────────────

  test("Warehouse Withdrawal-History renders SO name + user column", async ({
    page,
  }) => {
    await navigateTo(page, `/warehouse/withdrawals`)
    await page.getByRole("tab", { name: /Verlauf/ }).click()

    // SO-referenced withdrawals render name + number from serviceObject
    // include (UC-G7). Use `first()` because there are multiple.
    await expect(page.getByText(SO_NUMBER).first()).toBeVisible({
      timeout: 10_000,
    })

    // User column renders the admin display name, not a UUID (UC-G9).
    await expect(page.getByText(/Admin|admin@dev\.local/i).first()).toBeVisible()
  })

  // ─── Article Movements tab (UC-G10, UC-G11) ──────────────────

  test("Article Movements tab shows user column + DELIVERY_NOTE badge", async ({
    page,
  }) => {
    await navigateTo(page, `/warehouse/articles/${articleId}`)
    // Article detail → "Bestand" tab contains the movements table.
    await page.getByRole("tab", { name: "Bestand" }).click()

    // DELIVERY_NOTE badge renders with its i18n label (UC-G11)
    await expect(page.getByText("Lieferschein").first()).toBeVisible({
      timeout: 10_000,
    })

    // User column shows the admin name (UC-G10)
    await expect(page.getByText(/Admin|admin@dev\.local/i).first()).toBeVisible()
  })

  // ─── T-2.1: Order-Form-Picker attaches SO via UI ───────────────

  test("T-2.1: create order via UI with ServiceObjectPicker → appears in Historie", async ({
    page,
  }) => {
    const orderCode = `T21-UI-${STAMP}`

    await navigateTo(page, `/admin/orders`)
    await page.getByRole("button", { name: /Neuer Auftrag|New Order/ }).first().click()

    // Fill required fields
    await page.locator("#code").fill(orderCode)
    await page.locator("#name").fill(`T-2.1 UI ${STAMP}`)

    // Pick the service object using the combobox picker.
    await page.locator('[data-testid="order-service-object-field"]')
      .getByRole("combobox")
      .click()
    // Combobox Popover renders an <Input> + filterable <button> list.
    await page
      .getByPlaceholder(/Nummer, Name, Seriennummer/i)
      .fill(SO_EMPTY_NUMBER)
    await page
      .getByRole("button", { name: new RegExp(SO_EMPTY_NUMBER) })
      .first()
      .click()

    // Submit — the footer button reads "Erstellen" on create, "Speichern" in English
    await page
      .getByRole("button", { name: /^(Erstellen|Create)$/ })
      .click()

    // Expect row to appear in the list
    await expect(page.getByText(orderCode)).toBeVisible({ timeout: 10_000 })

    // Navigate to the empty SO → Historie → order should be listed now
    await navigateTo(page, `/serviceobjects/${soEmptyId}`)
    await page.getByRole("tab", { name: "Historie" }).click()
    await expect(page.getByText(orderCode).first()).toBeVisible({
      timeout: 10_000,
    })

    // Cleanup: delete via API-adjacent DB path
    const { Pool } = await import("pg")
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:54322/postgres",
      max: 1,
    })
    await pool.query(
      `DELETE FROM orders WHERE tenant_id = $1 AND code = $2`,
      [SEED.TENANT_ID, orderCode]
    )
    await pool.end()
  })

  // ─── T-2.2: Auto-fill customer from picked SO ─────────────────

  test("T-2.2: edit order without SO → pick SO → customer field auto-fills with company", async ({
    page,
  }) => {
    const orderCode = `T22-${STAMP}`
    const customer = await ensureSeedCustomer()
    const expectedCompany = customer.company

    // Seed an order with NO service object and NO customer string.
    const { Pool } = await import("pg")
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:54322/postgres",
      max: 1,
    })
    await pool.query(
      `INSERT INTO orders (tenant_id, code, name, status)
       VALUES ($1, $2, $3, 'active')`,
      [SEED.TENANT_ID, orderCode, `T-2.2 auto-fill ${STAMP}`]
    )

    // Open edit form via /admin/orders → click row → Bearbeiten button.
    await navigateTo(page, `/admin/orders`)
    await page.getByText(orderCode).first().click()
    await page.getByRole("button", { name: /Bearbeiten|Edit/ }).first().click()

    // Wait for the sheet to open, and the customer field should be empty.
    await expect(page.locator("#customer")).toHaveValue("")

    // Pick the SO that is attached to our seed customer.
    await page.locator('[data-testid="order-service-object-field"]')
      .getByRole("combobox")
      .click()
    await page
      .getByPlaceholder(/Nummer, Name, Seriennummer/i)
      .fill(SO_NUMBER)
    await page
      .getByRole("button", { name: new RegExp(SO_NUMBER) })
      .first()
      .click()

    // Customer field should now hold the SO's customer company.
    await expect(page.locator("#customer")).toHaveValue(expectedCompany, {
      timeout: 5_000,
    })

    // Cleanup
    await pool.query(
      `DELETE FROM orders WHERE tenant_id = $1 AND code = $2`,
      [SEED.TENANT_ID, orderCode]
    )
    await pool.end()
  })

  test("T-2.2: edit order WITH existing customer text → opening form does NOT overwrite it from the already-linked SO", async ({
    page,
  }) => {
    const orderCode = `T22B-${STAMP}`
    const sticky = "Original Kunde (manuell)"

    const { Pool } = await import("pg")
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:54322/postgres",
      max: 1,
    })
    // Seed an order that already has both an SO and a manually typed
    // customer string. Opening the edit form must NOT overwrite it.
    await pool.query(
      `INSERT INTO orders (tenant_id, code, name, status, customer, service_object_id)
       VALUES ($1, $2, $3, 'active', $4, $5)`,
      [SEED.TENANT_ID, orderCode, `T-2.2b ${STAMP}`, sticky, soId]
    )

    await navigateTo(page, `/admin/orders`)
    await page.getByText(orderCode).first().click()
    await page.getByRole("button", { name: /Bearbeiten|Edit/ }).first().click()

    await expect(page.locator("#customer")).toHaveValue(sticky, {
      timeout: 5_000,
    })
    // Give the SO query time to settle, then re-check — the guard must
    // not fire late.
    await page.waitForTimeout(600)
    await expect(page.locator("#customer")).toHaveValue(sticky)

    await pool.query(
      `DELETE FROM orders WHERE tenant_id = $1 AND code = $2`,
      [SEED.TENANT_ID, orderCode]
    )
    await pool.end()
  })

  // ─── Historie refreshes after inserting a new withdrawal (UC-G12) ────

  test("Historie tab reflects new withdrawal after navigation (UC-G12)", async ({
    page,
  }) => {
    await navigateTo(page, `/serviceobjects/${soId}`)
    await page.getByRole("tab", { name: "Historie" }).click()
    await expect(page.getByText(/3\s*Entnahmen/)).toBeVisible()

    // Insert a fourth withdrawal via SQL (direct DB write) — simulating
    // the outcome of a mutation through the warehouse UI.
    await createWithdrawalForServiceObject({
      serviceObjectId: soId,
      articleId,
      quantity: 1,
      createdById: adminUid || undefined,
      dateIso: "2026-03-20T09:00:00Z",
    })

    // Navigate away + back to force a re-fetch — proves the query wiring,
    // not the hook-level invalidateQueries() call.
    await page.reload()
    await page.getByRole("tab", { name: "Historie" }).click()
    await expect(page.getByText(/4\s*Entnahmen/)).toBeVisible({
      timeout: 10_000,
    })
  })
})
