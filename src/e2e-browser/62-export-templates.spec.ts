import { test, expect, type Page } from "@playwright/test"

/**
 * E2E tests for the Phase 2 template-export engine UI.
 *
 * Mirrors the manual step-by-step test plan 1:1:
 *   1. Template-Verwaltung laden
 *   2. Template erstellen
 *   3. Ungültige Liquid-Syntax wird abgelehnt
 *   4. Live-Vorschau erzeugen
 *   5. Template umbenennen (Versionierung)
 *   6. Audit-Log prüfen
 *   7. Lohnart-Mapping: liste, inline-edit, reset
 *   8. Template-basierter Export + Download via GenerateExportDialog
 *  10. Legacy CSV-Export funktioniert weiterhin
 *  11. Template löschen (Cleanup)
 *
 * Uses the seeded admin session via storageState.
 */

const TEMPLATE_NAME = `E2E LODAS ${Date.now()}`
const RENAMED_NAME = `${TEMPLATE_NAME} v2`

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

async function openTemplatesList(page: Page) {
  await page.goto("/de/admin/export-templates")
  await expect(page.getByTestId("export-templates-page")).toBeVisible({
    timeout: 15_000,
  })
}

async function createTemplateViaUi(
  page: Page,
  opts: { name: string; body: string },
) {
  await openTemplatesList(page)
  await page.getByTestId("export-template-new").click()
  await page.getByTestId("export-template-name").fill(opts.name)
  await page.getByTestId("export-template-body").fill(opts.body)
  await page.getByTestId("export-template-save").click()
  await expect(
    page.getByTestId(`export-template-row-${opts.name}`),
  ).toBeVisible({ timeout: 10_000 })
}

// ══════════════════════════════════════════════════════════════
// STEP 1 – 5 + 11 — Template-Verwaltung (serial workflow)
// ══════════════════════════════════════════════════════════════
test.describe.serial("Step 1–5, 11 — Template Verwaltung", () => {
  test("Step 1 — loads the export templates page", async ({ page }) => {
    await openTemplatesList(page)
    await expect(
      page.getByRole("heading", { name: /Export-Templates/i }),
    ).toBeVisible()
    // "Neues Template" button must be visible
    await expect(page.getByTestId("export-template-new")).toBeVisible()
  })

  test("Step 2 — creates a DATEV LODAS template", async ({ page }) => {
    const body = [
      "[Allgemein]",
      "Ziel=LODAS",
      "BeraterNr={{ exportInterface.beraterNr }}",
      "MandantenNr={{ exportInterface.mandantNumber }}",
      "Zeitraum={{ period.firstDay }}-{{ period.lastDay }}",
      "",
      "[Mitarbeiter]",
      "Personalnummer;Nachname;Vorname;Sollstunden;Iststunden",
      "{%- for emp in employees %}",
      "{{ emp.personnelNumber }};{{ emp.lastName | datev_string }};{{ emp.firstName | datev_string }};{{ emp.monthlyValues.targetHours | datev_decimal: 2 }};{{ emp.monthlyValues.workedHours | datev_decimal: 2 }}",
      "{%- endfor %}",
    ].join("\n")
    await createTemplateViaUi(page, { name: TEMPLATE_NAME, body })

    // Row shows the "v1" badge
    const row = page.getByTestId(`export-template-row-${TEMPLATE_NAME}`)
    await expect(row).toContainText("v1")
    await expect(row).toContainText(/Aktiv/i)
  })

  test("Step 3 — rejects invalid Liquid syntax", async ({ page }) => {
    await openTemplatesList(page)
    await page.getByTestId("export-template-new").click()
    await page
      .getByTestId("export-template-name")
      .fill(`Bad Liquid ${Date.now()}`)
    await page
      .getByTestId("export-template-body")
      .fill("{% if missing-end %}")
    await page.getByTestId("export-template-save").click()

    // Error alert lives inside the editor card; scope to that container so
    // we don't collide with the global toast notification.
    await expect(
      page
        .getByTestId("export-templates-page")
        .getByText(/Invalid Liquid syntax/i),
    ).toBeVisible({ timeout: 10_000 })

    // Navigate away to discard the editor before the next test runs.
    await openTemplatesList(page)
    // The bad template must NOT appear in the list.
    await expect(
      page.getByText(/Bad Liquid/i),
    ).toHaveCount(0)
  })

  test("Step 4 — renders a live preview", async ({ page }) => {
    await openTemplatesList(page)
    await page.getByTestId(`export-template-edit-${TEMPLATE_NAME}`).click()
    await expect(page.getByTestId("export-template-name")).toBeVisible()

    // Pick a past month (system seeded monthly values only exist for past months).
    const today = new Date()
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    await page.locator("#tpl-prev-year").fill(String(lastMonth.getFullYear()))
    await page.locator("#tpl-prev-month").fill(String(lastMonth.getMonth() + 1))

    await page.getByTestId("export-template-preview").click()

    // Preview output should contain the static template header.
    const previewBox = page.getByTestId("export-template-preview-output")
    await expect(previewBox).toBeVisible({ timeout: 15_000 })
    await expect(previewBox).toContainText("[Allgemein]")
    await expect(previewBox).toContainText("Ziel=LODAS")
    await expect(previewBox).toContainText("[Mitarbeiter]")

    // Navigate away — we'll come back for the rename step.
    await openTemplatesList(page)
  })

  test("Step 5 — rename bumps the version counter (archived history)", async ({
    page,
  }) => {
    await openTemplatesList(page)
    await page.getByTestId(`export-template-edit-${TEMPLATE_NAME}`).click()
    await expect(page.getByTestId("export-template-name")).toBeVisible()

    // Rename
    await page.getByTestId("export-template-name").fill(RENAMED_NAME)

    // Modify body too so the version counter bumps
    const body = page.getByTestId("export-template-body")
    const currentBody = await body.inputValue()
    await body.fill(`{%- comment -%} v2 {%- endcomment -%}\n${currentBody}`)

    await page.getByTestId("export-template-save").click()

    // The renamed row is now present with v2
    const renamedRow = page.getByTestId(`export-template-row-${RENAMED_NAME}`)
    await expect(renamedRow).toBeVisible({ timeout: 10_000 })
    await expect(renamedRow).toContainText("v2")
    // The old name has disappeared
    await expect(
      page.getByTestId(`export-template-row-${TEMPLATE_NAME}`),
    ).toHaveCount(0)
  })

  test("Step 11 — deletes the template (cleanup)", async ({ page }) => {
    await openTemplatesList(page)
    await expect(
      page.getByTestId(`export-template-row-${RENAMED_NAME}`),
    ).toBeVisible()
    await page.getByTestId(`export-template-delete-${RENAMED_NAME}`).click()
    // Confirm delete dialog — the confirm button has text "Löschen"
    await page.getByRole("button", { name: /^löschen$/i }).last().click()
    await expect(
      page.getByTestId(`export-template-row-${RENAMED_NAME}`),
    ).toHaveCount(0)
  })
})

// ══════════════════════════════════════════════════════════════
// STEP 6 — Audit Log
// ══════════════════════════════════════════════════════════════
test.describe("Step 6 — Audit Log shows export_template events", () => {
  test("creates a template and verifies an audit entry appears", async ({
    page,
  }) => {
    const auditName = `Audit E2E ${Date.now()}`
    await createTemplateViaUi(page, {
      name: auditName,
      body: "{{ exportInterface.mandantNumber }}",
    })

    // Open the audit logs page.
    await page.goto("/de/admin/audit-logs")
    await expect(
      page
        .getByRole("heading", { name: /audit/i })
        .first(),
    ).toBeVisible({ timeout: 15_000 })

    // The audit log table should eventually contain our template name as
    // entity name. We rely on the default sort (newest first).
    await expect(page.getByText(auditName).first()).toBeVisible({
      timeout: 15_000,
    })

    // Cleanup: navigate back and delete the audit template.
    await openTemplatesList(page)
    await page.getByTestId(`export-template-delete-${auditName}`).click()
    await page.getByRole("button", { name: /^löschen$/i }).last().click()
  })
})

// ══════════════════════════════════════════════════════════════
// STEP 7 — Lohnart-Mapping
// ══════════════════════════════════════════════════════════════
test.describe.serial("Step 7 — Lohnart-Mapping (Payroll Wages)", () => {
  test("Step 7a — lists the seeded Lohnart codes", async ({ page }) => {
    await page.goto("/de/admin/payroll-wages")
    await expect(page.getByTestId("payroll-wages-page")).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId("payroll-wage-1000")).toBeVisible()
    await expect(page.getByTestId("payroll-wage-1001")).toBeVisible()
    await expect(page.getByTestId("payroll-wage-2000")).toBeVisible()
    await expect(page.getByTestId("payroll-wage-2900")).toBeVisible()
  })

  test("Step 7b — inline edit persists after reload", async ({ page }) => {
    await page.goto("/de/admin/payroll-wages")
    const row = page.getByTestId("payroll-wage-1000")
    await expect(row).toBeVisible()

    const nameInput = row.locator("input").nth(1)
    const originalValue = await nameInput.inputValue()
    const newValue = `${originalValue} (E2E)`
    await nameInput.fill(newValue)
    await page.getByTestId("payroll-wage-save-1000").click()

    await page.waitForTimeout(500)
    await page.reload()
    await expect(page.getByTestId("payroll-wage-1000")).toBeVisible()
    const refreshedValue = await page
      .getByTestId("payroll-wage-1000")
      .locator("input")
      .nth(1)
      .inputValue()
    expect(refreshedValue).toBe(newValue)
  })

  test("Step 7c — reset restores the seeded defaults", async ({ page }) => {
    await page.goto("/de/admin/payroll-wages")

    // confirm() is handled by auto-accepting the dialog.
    page.once("dialog", (dialog) => dialog.accept())
    await page.getByTestId("payroll-wages-reset").click()

    // After reset the 1000 code must be back to the seeded name.
    await page.waitForTimeout(1000)
    await page.reload()
    const nameInput = page
      .getByTestId("payroll-wage-1000")
      .locator("input")
      .nth(1)
    await expect(nameInput).toHaveValue("Sollstunden")
  })
})

// ══════════════════════════════════════════════════════════════
// STEP 8 — Template-basierter Export via GenerateExportDialog
// ══════════════════════════════════════════════════════════════
test.describe.serial("Step 8 — GenerateExportDialog template export", () => {
  const EXPORT_TPL = `Export Dialog ${Date.now()}`

  test("setup — create a minimal template for the export", async ({ page }) => {
    await createTemplateViaUi(page, {
      name: EXPORT_TPL,
      body: "Header\n{% for emp in employees %}{{ emp.personnelNumber }};{{ emp.lastName | datev_string }}\n{% endfor %}",
    })
  })

  test("Step 8 — switches export method to template and selects template", async ({
    page,
  }) => {
    await page.goto("/de/admin/payroll-exports")

    // Open the generate sheet.
    const trigger = page
      .getByRole("button", { name: /Export erstellen/i })
      .first()
    await trigger.click()

    // Select template method
    await expect(page.getByTestId("export-method-select")).toBeVisible({
      timeout: 10_000,
    })
    await page.getByTestId("export-method-select").click()
    await page.getByRole("option", { name: /Template-basiert/i }).click()

    // The template dropdown must appear
    await expect(page.getByTestId("export-template-select")).toBeVisible()
    await page.getByTestId("export-template-select").click()
    await page.getByRole("option", { name: EXPORT_TPL }).click()

    // Submit is a click — we only assert the button becomes clickable and
    // the download is triggered. Downloads go through a browser prompt
    // handled by Playwright's event.
    const submit = page.getByTestId("generate-export-submit")
    await expect(submit).toBeEnabled()

    // Listen for a download before clicking
    const downloadPromise = page.waitForEvent("download", { timeout: 20_000 })
    await submit.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.txt$/)
  })

  test("cleanup — delete the export dialog template", async ({ page }) => {
    await openTemplatesList(page)
    await page
      .getByTestId(`export-template-delete-${EXPORT_TPL}`)
      .click()
    await page.getByRole("button", { name: /^löschen$/i }).last().click()
  })
})

// ══════════════════════════════════════════════════════════════
// STEP 10 — Legacy CSV export still works
// ══════════════════════════════════════════════════════════════
test.describe("Step 10 — Legacy CSV export still opens", () => {
  test("legacy method shows the legacy fields", async ({ page }) => {
    await page.goto("/de/admin/payroll-exports")
    await page.getByRole("button", { name: /Export erstellen/i }).first().click()

    await expect(page.getByTestId("export-method-select")).toBeVisible({
      timeout: 10_000,
    })

    // Legacy is the default — the template dropdown must NOT be visible.
    await expect(page.getByTestId("export-template-select")).toHaveCount(0)

    // Legacy-specific fields must be visible: "Format" and "Export-Type"
    // labels exist in the legacy path.
    await expect(page.getByText(/Format/i).first()).toBeVisible()
  })
})
