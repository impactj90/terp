import { test, expect } from "@playwright/test"
import { Pool } from "pg"
import { navigateTo } from "./helpers/nav"
import { SEED } from "./helpers/auth"
import {
  resetServiceObjects,
  ensureSeedCustomer,
  serviceObjectIdByNumber,
  disconnect,
} from "./helpers/service-object-fixtures"

/**
 * UC-SO-03: Wartungspläne — 1-Click-Auftragserzeugung
 *
 * Deckt die 5 Flows aus dem Implementierungsplan
 * `thoughts/shared/plans/2026-04-22-serviceobjekte-wartungsintervalle.md`
 * Phase F ab:
 *
 *   Flow 1 — Schedule via Detail-Tab anlegen
 *   Flow 2 — Globale Liste zeigt Schedule
 *   Flow 3 — Generate Order aus Liste (1-Klick)
 *   Flow 4 — Order completen rollt Fälligkeit
 *   Flow 5 — Dashboard-Widget sichtbar + Deep-Link
 *
 * Setup nutzt SQL-Fixtures (wie `82-service-object-history.spec.ts`),
 * weil ein UI-Setup für ServiceObject + Activity redundant wäre — das
 * ist bereits durch Spec 81 und durch den Admin-Seed abgedeckt.
 */

const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:54322/postgres"

const STAMP = Date.now().toString().slice(-6)
const SO_NUMBER = `SO-E2E-S-${STAMP}`
const SO_NAME = `Kältemaschine ${STAMP}`
const ACTIVITY_CODE = `WART-${STAMP}`
const ACTIVITY_NAME = `Wartung ${STAMP}`
const SCHEDULE_NAME = `Quartalsservice ${STAMP}`

let soId = ""
let orderCode = ""

async function directPool(): Promise<Pool> {
  return new Pool({
    connectionString: CONNECTION_STRING,
    max: 1,
  })
}

async function cleanupSchedulesAndOrders(): Promise<void> {
  const pool = await directPool()
  // Orders first (referenced by service-schedule-generated rows).
  await pool.query(
    `DELETE FROM orders WHERE tenant_id = $1 AND code LIKE 'WA-%' AND name LIKE $2`,
    [SEED.TENANT_ID, `%${STAMP}%`]
  )
  await pool.query(
    `DELETE FROM service_schedules WHERE tenant_id = $1 AND name LIKE $2`,
    [SEED.TENANT_ID, `%${STAMP}%`]
  )
  await pool.query(
    `DELETE FROM activities WHERE tenant_id = $1 AND code = $2`,
    [SEED.TENANT_ID, ACTIVITY_CODE]
  )
  await pool.end()
}

test.describe.serial("UC-SO-03: Wartungspläne — Fälligkeit + 1-Klick-Order", () => {
  test.beforeAll(async () => {
    // 1) Cleanup ZUERST, damit Reste aus einem früheren Run nicht unsere
    //    Setup-Inserts überleben.
    await cleanupSchedulesAndOrders()
    await resetServiceObjects()

    const customer = await ensureSeedCustomer()
    const pool = await directPool()

    // 2) Activity (benötigt für Zeitbuchung am erzeugten Auftrag und als
    //    Default-Activity im Schedule-Form). Wir schreiben nur in die DB —
    //    der Activity-Picker im Form filtert über tenant + isActive, die
    //    Test-Assertion matched per Code-Regex auf der Option.
    await pool.query(
      `INSERT INTO activities (tenant_id, code, name, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name`,
      [SEED.TENANT_ID, ACTIVITY_CODE, ACTIVITY_NAME]
    )

    // 3) ServiceObject (Equipment) — der Pivot für den Schedule.
    await pool.query(
      `INSERT INTO service_objects (tenant_id, number, name, kind, customer_address_id, qr_code_payload)
       VALUES ($1, $2, $3, 'EQUIPMENT', $4, $5)`,
      [
        SEED.TENANT_ID,
        SO_NUMBER,
        SO_NAME,
        customer.id,
        `TERP:SO:${SEED.TENANT_ID.slice(0, 6)}:${SO_NUMBER}`,
      ]
    )
    await pool.end()

    soId = await serviceObjectIdByNumber(SO_NUMBER)
  })

  test.afterAll(async () => {
    await cleanupSchedulesAndOrders()
    await resetServiceObjects()
    await disconnect()
  })

  // ── Flow 1: Schedule über Detail-Tab anlegen ─────────────────────

  test("Flow 1: Wartungsplan im Detail-Tab anlegen", async ({ page }) => {
    await navigateTo(page, `/serviceobjects/${soId}`)
    await expect(page.getByText(SO_NAME)).toBeVisible({ timeout: 10_000 })

    // Tab „Wartungsplan" (dritter Tab, zwischen „Historie" und „Hierarchie")
    await page.getByRole("tab", { name: "Wartungsplan" }).click()

    // Empty-state ist sichtbar, bis wir anlegen
    await expect(
      page.getByText("Für dieses Serviceobjekt ist noch kein Wartungsplan hinterlegt.")
    ).toBeVisible({ timeout: 5_000 })

    // Sheet öffnen
    await page.getByRole("button", { name: "Neuer Wartungsplan" }).click()
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]')
    ).toBeVisible({ timeout: 5_000 })

    // Pflichtfelder: Name + Intervall (Type + Value + Unit sind default
    // TIME_BASED / 3 / MONTHS — passt fürs Szenario)
    await page.locator("#sched-name").fill(SCHEDULE_NAME)

    // Intervall-Typ explizit auf „Zeit-basiert" halten (default), aber
    // wir setzen Wert + Einheit trotzdem explizit, um den Select-Flow
    // zu prüfen
    await page.locator("#sched-interval-value").fill("3")

    // Einheit auf „Monate" setzen (Default, aber wir klicken es an)
    await page.locator("#sched-interval-unit").click()
    await page.getByRole("option", { name: "Monate" }).click()

    // Default-Aktivität = unser Test-WARTUNG
    await page.locator("#sched-activity").click()
    await page
      .getByRole("option", { name: new RegExp(`${ACTIVITY_CODE}.*${ACTIVITY_NAME}`) })
      .click()

    // Verantwortliche/r: Admin-Employee (liste ist alphabetisch — pick first)
    await page.locator("#sched-employee").click()
    await page.locator('[role="option"]').first().click()

    // Speichern — Footer-Button hat hier Text „Anlegen" (create mode)
    await page.getByRole("button", { name: "Anlegen" }).click()

    // Toast + Sheet schließt sich
    await expect(
      page.getByText("Wartungsplan angelegt")
    ).toBeVisible({ timeout: 5_000 })

    // Der Plan erscheint in der Tab-Liste. Viewport ist 1280x1080 → die
    // Desktop-Table ist sichtbar; die Mobile-Card-Variante hat `sm:hidden`
    // und fällt aus. Wir selecten explizit im `table`-Scope.
    await expect(
      page
        .locator("table tbody tr")
        .filter({ hasText: SCHEDULE_NAME })
        .first()
    ).toBeVisible({ timeout: 5_000 })
  })

  // ── Flow 2: Globale Schedules-Liste zeigt den neuen Plan ─────────

  test("Flow 2: Globale Liste /serviceobjects/schedules zeigt den Plan", async ({
    page,
  }) => {
    await navigateTo(page, "/serviceobjects/schedules")
    await expect(
      page.getByRole("heading", { name: "Wartungspläne" })
    ).toBeVisible({ timeout: 10_000 })

    // Tab „Alle" ist Default → Plan ist sichtbar
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: SCHEDULE_NAME })
      .first()
    await expect(row).toBeVisible({ timeout: 10_000 })

    // ServiceObject-Spalte zeigt Nummer + Name
    await expect(row).toContainText(SO_NUMBER)

    // Intervall-Zelle zeigt „Zeit-basiert · 3 Monate"
    await expect(row).toContainText("Zeit-basiert")
    await expect(row).toContainText("Monate")
  })

  // ── Flow 3: 1-Klick-Generate öffnet Dialog, erzeugt WA-<n>-Order ──

  test("Flow 3: Auftrag aus Wartungsplan erzeugen (1-Klick)", async ({
    page,
  }) => {
    await navigateTo(page, "/serviceobjects/schedules")

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: SCHEDULE_NAME })
      .first()
    await expect(row).toBeVisible({ timeout: 10_000 })

    // „Auftrag erzeugen"-Button in der Row klicken
    await row.getByRole("button", { name: "Auftrag erzeugen" }).click()

    // Dialog öffnet sich (Sheet von unten, mobile-first)
    const dialog = page.locator(
      '[data-slot="sheet-content"][data-state="open"]'
    )
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog).toContainText("Auftrag aus Wartungsplan erzeugen")

    // Schedule-Zusammenfassung im Dialog sichtbar
    await expect(dialog).toContainText(SCHEDULE_NAME)
    await expect(dialog).toContainText(SO_NUMBER)

    // Confirm-Button klicken — Checkbox „Erste Zuweisung anlegen" ist
    // default aktiv, wir lassen sie aktiv
    await dialog
      .getByRole("button", { name: "Auftrag jetzt erzeugen" })
      .click()

    // Erfolgs-Toast mit Order-Code (Pattern WA-<n>)
    const toast = page.getByText(/Auftrag WA-\d+ wurde erzeugt/)
    await expect(toast).toBeVisible({ timeout: 10_000 })

    // Order-Code aus dem Toast extrahieren für spätere Asserts
    const toastText = await toast.textContent()
    const match = toastText?.match(/WA-\d+/)
    expect(match).not.toBeNull()
    orderCode = match![0]

    // Redirect nach /admin/orders/<uuid>
    await page.waitForURL(/\/admin\/orders\/[0-9a-f-]+/, { timeout: 10_000 })

    // Detailseite zeigt den Order-Code + Status-Badge „Aktiv"
    await expect(page.getByText(orderCode)).toBeVisible({ timeout: 10_000 })
  })

  // ── Flow 4: Order completen rollt Fälligkeit ─────────────────────

  test("Flow 4: Auftrag komplettieren rollt nextDueAt vorwärts", async ({
    page,
  }) => {
    // Die Voraussetzung: Flow 3 hat `orderCode` gesetzt.
    expect(orderCode).toMatch(/^WA-\d+$/)

    // Over admin/orders die Order via Code finden und zur Detailseite.
    await navigateTo(page, "/admin/orders")
    const orderRow = page
      .locator("table tbody tr")
      .filter({ hasText: orderCode })
      .first()
    await expect(orderRow).toBeVisible({ timeout: 10_000 })
    await orderRow.click()

    await page.waitForURL(/\/admin\/orders\/[0-9a-f-]+/, { timeout: 10_000 })

    // „Bearbeiten"-Button auf der Detailseite
    await page.getByRole("button", { name: "Bearbeiten" }).first().click()

    // Status-Select auf „Abgeschlossen" stellen
    const sheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]'
    )
    await expect(sheet).toBeVisible({ timeout: 5_000 })
    await sheet.locator("#status").click()
    await page.getByRole("option", { name: "Abgeschlossen" }).click()

    // Speichern
    await sheet
      .getByRole("button", { name: /^(Änderungen speichern|Speichern)$/ })
      .click()

    // Sheet schließt sich, Detailseite zeigt Status-Badge „Abgeschlossen"
    await expect(
      page.getByText("Abgeschlossen", { exact: true }).first()
    ).toBeVisible({ timeout: 10_000 })

    // Jetzt zurück zur Schedules-Liste: der Plan sollte nicht mehr
    // den Default-„Noch nie ausgeführt"-Status haben, sondern ein
    // konkretes `nextDueAt` (heute + 3 Monate → JJJJ-Format in der
    // Liste). Wir prüfen den Plan-Row und dass das neue Datum
    // dort steht.
    await navigateTo(page, "/serviceobjects/schedules")
    const scheduleRow = page
      .locator("table tbody tr")
      .filter({ hasText: SCHEDULE_NAME })
      .first()
    await expect(scheduleRow).toBeVisible({ timeout: 10_000 })

    // Der Row zeigt jetzt nicht mehr „Noch nie ausgeführt"
    await expect(scheduleRow).not.toContainText("Noch nie ausgeführt")

    // Und es ist ein deutsches Datum sichtbar (dd.mm.yyyy)
    await expect(scheduleRow).toContainText(/\d{1,2}\.\d{1,2}\.\d{4}/)
  })

  // ── Flow 5: Dashboard-Widget sichtbar + Deep-Link ────────────────

  test("Flow 5: Dashboard-Widget 'Anstehende Wartungen' sichtbar", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard")

    // Widget-Titel
    await expect(
      page.getByText("Anstehende Wartungen")
    ).toBeVisible({ timeout: 10_000 })

    // Widget-Beschreibung
    await expect(
      page.getByText("Überfällige und bald fällige Wartungspläne.")
    ).toBeVisible()

    // „Alle anzeigen"-Link führt zur globalen Liste (ohne Filter)
    await page.getByRole("link", { name: "Alle anzeigen" }).click()
    await page.waitForURL(/\/serviceobjects\/schedules(?:\?|$)/, {
      timeout: 10_000,
    })
    await expect(
      page.getByRole("heading", { name: "Wartungspläne" })
    ).toBeVisible({ timeout: 10_000 })
  })
})
