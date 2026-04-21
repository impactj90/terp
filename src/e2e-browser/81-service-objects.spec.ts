import { test, expect } from "@playwright/test"
import { navigateTo } from "./helpers/nav"
import {
  resetServiceObjects,
  ensureSeedCustomer,
  qrPayloadFor,
  exists,
  disconnect,
} from "./helpers/service-object-fixtures"

// Timestamped to avoid clashes with prior failed runs even if the suite
// ordering mis-fires.
const STAMP = Date.now().toString().slice(-6)
const SO_PARENT = `SO-E2E-P-${STAMP}`
const SO_CHILD = `SO-E2E-C-${STAMP}`
const SO_PARENT_NAME = `Parent ${STAMP}`
const SO_CHILD_NAME = `Child ${STAMP}`

test.describe.serial("UC-SO-01: Service Objects — end-to-end", () => {
  test.beforeAll(async () => {
    await resetServiceObjects()
    await ensureSeedCustomer()
  })

  test.afterAll(async () => {
    await resetServiceObjects()
    await disconnect()
  })

  // ─── 1. List page loads ────────────────────────────────────────

  test("navigate to service objects list", async ({ page }) => {
    await navigateTo(page, "/serviceobjects")
    await expect(page.getByRole("heading", { name: "Serviceobjekte" })).toBeVisible(
      { timeout: 10_000 }
    )
  })

  // ─── 2. Create parent ──────────────────────────────────────────

  test("create parent service object via form sheet", async ({ page }) => {
    await navigateTo(page, "/serviceobjects")
    await page.getByRole("button", { name: "Neu" }).click()
    await expect(page.getByText("Neues Serviceobjekt")).toBeVisible({
      timeout: 5_000,
    })

    await page.locator("#so-number").fill(SO_PARENT)
    await page.locator("#so-name").fill(SO_PARENT_NAME)

    // Pick first customer in the Select
    await page.locator("#so-customer").click()
    await page.locator('[role="option"]').first().click()

    await page.getByRole("button", { name: "Anlegen" }).click()

    await expect(page.getByText(SO_PARENT)).toBeVisible({ timeout: 10_000 })
    expect(await exists(SO_PARENT)).toBe(true)
  })

  // ─── 3. Create child ───────────────────────────────────────────

  test("create child service object with same customer", async ({ page }) => {
    await navigateTo(page, "/serviceobjects")
    await page.getByRole("button", { name: "Neu" }).click()
    await expect(page.getByText("Neues Serviceobjekt")).toBeVisible()

    await page.locator("#so-number").fill(SO_CHILD)
    await page.locator("#so-name").fill(SO_CHILD_NAME)

    await page.locator("#so-customer").click()
    await page.locator('[role="option"]').first().click()

    await page.locator("#so-kind").click()
    await page.locator('[role="option"]', { hasText: "Komponente" }).click()

    await page.getByRole("button", { name: "Anlegen" }).click()
    await expect(page.getByText(SO_CHILD)).toBeVisible({ timeout: 10_000 })
  })

  // ─── 4. Detail page shows QR payload ───────────────────────────

  test("detail page renders QR payload for parent", async ({ page }) => {
    await navigateTo(page, "/serviceobjects")
    await page.getByText(SO_PARENT).first().click()
    await expect(page.getByText(SO_PARENT_NAME)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/^TERP:SO:/)).toBeVisible()
  })

  // ─── 5. Tree view lists objects for selected customer ──────────

  test("tree view lists the parent and child for the customer", async ({
    page,
  }) => {
    await navigateTo(page, "/serviceobjects/tree")
    // Select first customer
    await page
      .locator('[role="combobox"]')
      .first()
      .click()
    await page.locator('[role="option"]').first().click()

    await expect(page.getByText(SO_PARENT)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(SO_CHILD)).toBeVisible()
  })

  // ─── 6. Import wizard reachable + validates errors ─────────────

  test("import wizard accepts a CSV preview", async ({ page }) => {
    await navigateTo(page, "/serviceobjects/import")
    await expect(
      page.getByRole("heading", { name: /CSV-Import/ })
    ).toBeVisible()
    // Parent/child already exist in DB → duplicate row will be flagged.
    const csv = `number;name;customerAddressNumber\n${SO_PARENT};dup;K-E2E-SO\n`
    await page.setInputFiles('input[type="file"]', {
      name: "preview.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    })
    await page.getByRole("button", { name: "Vorschau" }).click()
    // The preview card contains the row with its error.
    await expect(page.getByText(/already exists/i)).toBeVisible({
      timeout: 10_000,
    })
  })

  // ─── 7. QR payload retrievable via DB helper ───────────────────

  test("QR payload follows deterministic TERP:SO: format", async () => {
    const payload = await qrPayloadFor(SO_PARENT)
    expect(payload).toMatch(/^TERP:SO:[a-f0-9]{6}:/)
    expect(payload.endsWith(`:${SO_PARENT}`)).toBe(true)
  })

  // ─── 8. Soft-delete path for parent (child counts as link) ─────

  test("delete parent with linked children → soft-delete (object stays)", async ({
    page,
  }) => {
    await navigateTo(page, "/serviceobjects")
    await page.getByText(SO_PARENT).first().click()
    await page.getByRole("button", { name: /Löschen/ }).click()

    // Confirm dialog
    const confirmBtn = page.getByRole("button", { name: "Löschen" }).last()
    await confirmBtn.click()

    // Expect the row still exists in DB (soft-delete).
    await page.waitForTimeout(500)
    expect(await exists(SO_PARENT)).toBe(true)
  })
})
