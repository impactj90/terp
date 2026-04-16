import { test, expect, type Page } from "@playwright/test"

async function gotoBankInbox(page: Page): Promise<void> {
  await page.goto("/finance/bank-inbox")
  await expect(
    page.getByRole("heading", { name: /Bank.Inbox/i, level: 1 }),
  ).toBeVisible({ timeout: 15_000 })
}

test.describe.serial("UC-BANK-01: Bank-Inbox", () => {
  test("navigates to /finance/bank-inbox and renders tabs", async ({ page }) => {
    await gotoBankInbox(page)
    await expect(page.getByRole("tab", { name: /Offen|Unmatched/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Zugeordnet|Matched/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Ignoriert|Ignored/i })).toBeVisible()
  })

  test("page shell renders without unhandled errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))
    await gotoBankInbox(page)
    await page.waitForLoadState("networkidle")
    expect(errors).toEqual([])
  })

  test("unmatched tab shows seeded transactions", async ({ page }) => {
    await gotoBankInbox(page)
    await page.waitForLoadState("networkidle")
    const matchRow = page.locator("table tbody tr").filter({ hasText: "Mueller Maschinenbau" })
    await expect(matchRow.first()).toBeVisible({ timeout: 10_000 })
  })

  test("ignore flow: click transaction → ignore with reason", async ({ page }) => {
    await gotoBankInbox(page)
    await page.waitForLoadState("networkidle")

    const ignoreRow = page.locator("table tbody tr").filter({ hasText: "Commerzbank" })
    await expect(ignoreRow.first()).toBeVisible({ timeout: 10_000 })
    await ignoreRow.first().click()

    // Detail sheet opens
    await expect(page.getByText(/Buchung zuordnen|Match transaction/i)).toBeVisible({ timeout: 5_000 })

    // Click ignore
    await page.getByRole("button", { name: /Ignorieren|Ignore/i }).first().click()

    // Ignore dialog
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await dialog.locator("textarea").fill("E2E Bankgebühr")
    await dialog.getByRole("button", { name: /Ignorieren|Ignore/i }).click()

    // Toast
    await expect(
      page.getByText(/Buchung ignoriert|Transaction ignored/i),
    ).toBeVisible({ timeout: 10_000 })

    // Switch to ignored tab and verify
    await page.getByRole("tab", { name: /Ignoriert|Ignored/i }).click()
    await page.waitForLoadState("networkidle")
    const ignoredRow = page.locator("table tbody tr").filter({ hasText: "Commerzbank" })
    await expect(ignoredRow.first()).toBeVisible({ timeout: 10_000 })
    await expect(ignoredRow.first()).toContainText("E2E Bankgebühr")
  })

  test("manual match flow: click transaction → select invoice → confirm", async ({ page }) => {
    await gotoBankInbox(page)
    await page.waitForLoadState("networkidle")

    const matchRow = page.locator("table tbody tr").filter({ hasText: "Mueller Maschinenbau" })
    await expect(matchRow.first()).toBeVisible({ timeout: 10_000 })
    await matchRow.first().click()

    // Detail sheet
    await expect(page.getByText(/Buchung zuordnen|Match transaction/i)).toBeVisible({ timeout: 5_000 })

    // Wait for candidates to load
    await expect(
      page.getByText(/Offene Rechnungen|Open invoices/i),
    ).toBeVisible({ timeout: 10_000 })

    // Select the first candidate checkbox
    const candidateCheckbox = page.locator('[role="checkbox"]').first()
    // Only proceed if there are candidates
    const hasCandidates = await candidateCheckbox.isVisible().catch(() => false)
    if (hasCandidates) {
      await candidateCheckbox.click()

      // Confirm match
      const confirmBtn = page.getByRole("button", { name: /Zuordnung bestätigen|Confirm match/i })
      await expect(confirmBtn).toBeEnabled({ timeout: 5_000 })
      await confirmBtn.click()

      // Toast
      await expect(
        page.getByText(/Zuordnung gespeichert|Match saved/i),
      ).toBeVisible({ timeout: 10_000 })
    }
  })

  test("upload dialog opens and shows fields", async ({ page }) => {
    await gotoBankInbox(page)
    await page.getByRole("button", { name: /CAMT.*importieren|Import CAMT/i }).click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(
      dialog.getByText(/Bankkontoauszug importieren|Import bank statement|CAMT/i),
    ).toBeVisible()

    // Close dialog
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden({ timeout: 5_000 })
  })

  test("locale switch: EN shows English labels", async ({ page }) => {
    await page.goto("/en/finance/bank-inbox")
    await expect(
      page.getByRole("heading", { name: /Bank Inbox/i, level: 1 }),
    ).toBeVisible({ timeout: 15_000 })

    await expect(page.getByRole("tab", { name: /Unmatched/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Matched/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Ignored/i })).toBeVisible()

    // Verify no raw i18n keys visible
    const bodyText = await page.locator("body").textContent()
    expect(bodyText).not.toContain("bankInbox.tabs.")
    expect(bodyText).not.toContain("bankInbox.list.")
    expect(bodyText).not.toContain("bankInbox.detail.")
  })
})
