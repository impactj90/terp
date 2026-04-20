import { test, expect, type Page } from "@playwright/test"
import { navigateTo, waitForTableLoad } from "./helpers/nav"
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
} from "./helpers/forms"

// --- Constants ---
const COMPANY = "E2E Leistungszeitraum GmbH"

async function openDocument(page: Page, pattern: RegExp) {
  await navigateTo(page, "/orders/documents")
  await waitForTableLoad(page)
  const row = page
    .locator("table tbody tr")
    .filter({ hasText: pattern })
    .filter({ hasText: COMPANY })
  await row.first().click()
  await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, { timeout: 10000 })
}

async function createDocumentOfType(page: Page, type: "INVOICE" | "OFFER"): Promise<void> {
  await navigateTo(page, `/orders/documents/new?type=${type}`)
  await expect(page.getByText("Neuer Beleg")).toBeVisible({ timeout: 10000 })
  await page.getByRole("combobox", { name: /Kundenadresse/ }).click()
  await page.getByRole("option", { name: new RegExp(COMPANY) }).click()
  await page.getByRole("button", { name: "Speichern" }).click()
  await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, { timeout: 10000 })
  await expect(page.getByText("Entwurf")).toBeVisible({ timeout: 10000 })
}

test.describe.serial("UC-BILL-A: Leistungszeitraum (§14 UStG)", () => {
  // ── Pre-condition: Ensure address exists ─────────────────────────
  test("create address for Leistungszeitraum tests", async ({ page }) => {
    await navigateTo(page, "/crm/addresses")
    await page.getByRole("button", { name: "Neue Adresse" }).click()
    await waitForSheet(page)
    await fillInput(page, "company", COMPANY)
    await fillInput(page, "street", "Leistungsstraße 14")
    await fillInput(page, "zip", "10115")
    await fillInput(page, "city", "Berlin")
    await submitAndWaitForClose(page)
    await waitForTableLoad(page)
    await expectTableContains(page, COMPANY)
  })

  // ── Card visible on INVOICE draft, editable ─────────────────────
  test("invoice draft shows Leistungszeitraum card with editable inputs", async ({ page }) => {
    await createDocumentOfType(page, "INVOICE")

    // Card header is visible
    await expect(page.getByText("Leistungszeitraum").first()).toBeVisible({ timeout: 10000 })

    // Two date inputs are present and editable
    const fromInput = page
      .locator("label")
      .filter({ hasText: "Leistungszeitraum von" })
      .locator("xpath=following-sibling::input")
    const toInput = page
      .locator("label")
      .filter({ hasText: "Leistungszeitraum bis" })
      .locator("xpath=following-sibling::input")
    await expect(fromInput).toBeEditable({ timeout: 5000 })
    await expect(toInput).toBeEditable()
  })

  // ── Persistence round-trip via reload ────────────────────────────
  test("entered period persists after reload", async ({ page }) => {
    await openDocument(page, /RE-/)

    const fromInput = page
      .locator("label")
      .filter({ hasText: "Leistungszeitraum von" })
      .locator("xpath=following-sibling::input")
    const toInput = page
      .locator("label")
      .filter({ hasText: "Leistungszeitraum bis" })
      .locator("xpath=following-sibling::input")

    await fromInput.fill("2026-03-01")
    await fromInput.blur()
    await page.waitForTimeout(500)
    await toInput.fill("2026-03-31")
    await toInput.blur()
    await page.waitForTimeout(500)

    await page.reload()
    await expect(fromInput).toHaveValue("2026-03-01", { timeout: 10000 })
    await expect(toInput).toHaveValue("2026-03-31")
  })

  // ── Card NOT visible on OFFER ────────────────────────────────────
  test("offer draft does NOT show Leistungszeitraum card", async ({ page }) => {
    await createDocumentOfType(page, "OFFER")

    // The specific card header is not present. Other mentions of the word
    // must not exist on an offer detail page — the card is purely invoice/
    // credit-note scoped.
    await expect(page.getByText("Leistungszeitraum").first()).toHaveCount(0)
  })

  // ── Finalize-Warnung: fires when period + delivery both empty ────
  test("finalize warning fires when both period and delivery date empty", async ({ page }) => {
    await createDocumentOfType(page, "INVOICE")

    // Add a minimal position so finalize is allowed
    await page.getByRole("button", { name: /Position hinzufügen/ }).click()
    await page.waitForTimeout(1000)

    await page.getByRole("button", { name: "Abschließen" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText(/Leistungszeitraum fehlt/i)).toBeVisible()
    await dialog.getByRole("button", { name: "Abbrechen" }).click()
  })
})
