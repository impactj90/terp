import { test, expect, type Page } from "@playwright/test"

/**
 * Phase 3 — Automated coverage of the manual verification checklist.
 *
 * Mirrors the step-by-step manual test plan 1:1 (EXCEPT the bulk-import
 * section 4, which the human runs by hand because it requires real
 * personnel numbers / payroll data). Each `test.describe.serial` block
 * maps to one step from the checklist.
 *
 *   Step 1 — Template library lists all 6 shipped standard templates
 *   Step 2 — "Als Vorlage verwenden" copies + (Kopie) suffix
 *   Step 3 — Edit copied template → body, preview
 *   Step 5 — Gehaltshistorie: create, auto-close, employee sync, delete
 *   Step 6 — DATEV-Onboarding-Checkliste
 *   Step 7 — Steuerberater-PDF download
 *   Step 8 — Sidebar integration
 *   Step 9 — Audit-Log entries for export_template + salary history
 *
 * Uses the seeded admin session via storageState.
 */

const LIBRARY_URL = "/de/admin/export-templates/library"
const TEMPLATES_URL = "/de/admin/export-templates"
const ONBOARDING_URL = "/de/admin/datev-onboarding"
const EMPLOYEES_URL = "/de/admin/employees"
const AUDIT_LOGS_URL = "/de/admin/audit-logs"

// Unique names per test run so leftover rows from prior runs don't
// collide with the assertions of the current run.
const RUN_ID = Date.now()
const COPIED_BASE_NAME = "DATEV LODAS — Bewegungsdaten"
const LIBRARY_PAGE_ID = "export-template-library-page"

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

async function openLibrary(page: Page) {
  await page.goto(LIBRARY_URL)
  await expect(page.getByTestId(LIBRARY_PAGE_ID)).toBeVisible({
    timeout: 15_000,
  })
}

async function openTemplatesList(page: Page) {
  await page.goto(TEMPLATES_URL)
  await expect(page.getByTestId("export-templates-page")).toBeVisible({
    timeout: 15_000,
  })
}

/**
 * Deletes every tenant template whose name starts with
 * "DATEV LODAS — Bewegungsdaten" — used by the copy test to start
 * from a clean slate.
 *
 * The delete confirmation uses a bottom Sheet; its confirm button is
 * labelled "Löschen" and is the LAST button with that label on the
 * page (the row's delete icon-button also matches that text via the
 * sr-only label). We follow the 62-export-templates pattern of using
 * `.last()` to scope to the dialog's confirm button.
 */
async function deletePreviousLodasCopies(page: Page) {
  await openTemplatesList(page)
  // Snapshot all matching row names up front, then delete sequentially.
  // Re-querying inside the loop works too but is slower because of
  // the list re-render after each delete.
  let guard = 10
  while (guard-- > 0) {
    const rows = page
      .locator('[data-testid^="export-template-row-"]')
      .filter({ hasText: COPIED_BASE_NAME })
    const count = await rows.count()
    if (count === 0) break
    const rowTestId = (await rows.first().getAttribute("data-testid")) ?? ""
    const name = rowTestId.replace("export-template-row-", "")
    if (!name) break
    await page.getByTestId(`export-template-delete-${name}`).click()
    await page
      .getByRole("button", { name: /^löschen$/i })
      .last()
      .click()
    await expect(
      page.getByTestId(`export-template-row-${name}`),
    ).toHaveCount(0, { timeout: 10_000 })
  }
}

// ══════════════════════════════════════════════════════════════
// STEP 1 + 2 — Template library listing + copy workflow
// ══════════════════════════════════════════════════════════════
test.describe.serial("Phase 3 Step 1+2 — Template-Bibliothek + Als Vorlage verwenden", () => {
  test("Step 1 — library shows all 6 shipped standard templates with metadata", async ({
    page,
  }) => {
    // Step 1.1: start on /admin/export-templates and click the library button
    await openTemplatesList(page)
    await page
      .getByTestId("export-template-library-link")
      .click()
    await expect(page).toHaveURL(/\/admin\/export-templates\/library$/)
    await expect(page.getByTestId(LIBRARY_PAGE_ID)).toBeVisible()

    // Step 1.4: exactly 6 shipped cards
    const cards = page.locator('[data-testid^="system-template-card-"]')
    await expect(cards).toHaveCount(6)

    // Step 1.4: all 6 names (use exact text matches to avoid substring confusion)
    const expectedNames = [
      "DATEV LODAS — Bewegungsdaten",
      "DATEV LODAS — Stamm + Bewegungsdaten",
      "DATEV Lohn und Gehalt — Bewegungsdaten",
      "Lexware Lohn+Gehalt — Standard",
      "SAGE HR — Standard",
      "Generische CSV — Standard",
    ]
    for (const name of expectedNames) {
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible()
    }

    // Step 1.5: each card shows a target-system badge + encoding metadata
    const firstCard = cards.first()
    await expect(firstCard).toContainText(/Encoding:/)
    await expect(firstCard).toContainText(/Zeilenende:/)
    await expect(firstCard).toContainText(/Trenner:/)
  })

  test("Step 2 — copy template → confirmation dialog → new tenant template", async ({
    page,
  }) => {
    // Start clean so the first copy creates the base name (no "(Kopie)" suffix)
    await deletePreviousLodasCopies(page)

    await openLibrary(page)

    // Locate the "DATEV LODAS — Bewegungsdaten" card and click its copy button
    const card = page
      .locator('[data-testid^="system-template-card-"]')
      .filter({
        has: page.getByRole("heading", {
          name: COPIED_BASE_NAME,
          exact: true,
        }),
      })
      .first()
    await expect(card).toBeVisible()
    await card.locator('[data-testid^="system-template-copy-"]').click()

    // Step 2.2: the ConfirmDialog asks for consent
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/kopiert/i)
    await dialog.getByRole("button", { name: /Kopieren/ }).click()

    // Step 2.3: success toast
    await expect(
      page.getByText(/in Ihre Templates kopiert/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Step 2.4: back-link to tenant templates
    await openTemplatesList(page)

    // Step 2.5: the tenant list now contains an entry with the original name + v1
    const row = page.getByTestId(`export-template-row-${COPIED_BASE_NAME}`)
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row).toContainText("v1")
  })

  test("Step 2b — copying the same system template twice appends (Kopie)", async ({
    page,
  }) => {
    // Prerequisite: the first copy from the previous test is still in place.
    await openLibrary(page)

    const card = page
      .locator('[data-testid^="system-template-card-"]')
      .filter({
        has: page.getByRole("heading", {
          name: COPIED_BASE_NAME,
          exact: true,
        }),
      })
      .first()
    await card.locator('[data-testid^="system-template-copy-"]').click()
    await page.getByRole("dialog").getByRole("button", { name: /Kopieren/ }).click()
    await expect(
      page.getByText(/in Ihre Templates kopiert/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // The tenant list now has BOTH rows: the base + a "(Kopie)" variant
    await openTemplatesList(page)
    await expect(
      page.getByTestId(`export-template-row-${COPIED_BASE_NAME}`),
    ).toBeVisible()
    await expect(
      page.getByTestId(
        `export-template-row-${COPIED_BASE_NAME} (Kopie)`,
      ),
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ══════════════════════════════════════════════════════════════
// STEP 3 — Open copied template → body + live preview
// ══════════════════════════════════════════════════════════════
test.describe.serial("Phase 3 Step 3 — DATEV-LODAS-Template: Editor + Live-Vorschau", () => {
  test("opens the copied template and verifies the Liquid body content", async ({
    page,
  }) => {
    await openTemplatesList(page)
    await page
      .getByTestId(`export-template-edit-${COPIED_BASE_NAME}`)
      .click()
    await expect(page.getByTestId("export-template-name")).toBeVisible()

    // Step 3.3: body contains the hallmark LODAS sections
    const body = page.getByTestId("export-template-body")
    const bodyText = await body.inputValue()
    expect(bodyText).toContain("{%- comment -%}")
    expect(bodyText).toContain("[Allgemein]")
    expect(bodyText).toContain("Ziel=LODAS")
    expect(bodyText).toContain("[Bewegungsdaten]")
  })

  test("live preview renders the template for a past period", async ({
    page,
  }) => {
    await openTemplatesList(page)
    await page
      .getByTestId(`export-template-edit-${COPIED_BASE_NAME}`)
      .click()
    await expect(page.getByTestId("export-template-name")).toBeVisible()

    // Step 3.5: pick a past period that has seeded monthly values
    const today = new Date()
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    await page.locator("#tpl-prev-year").fill(String(lastMonth.getFullYear()))
    await page
      .locator("#tpl-prev-month")
      .fill(String(lastMonth.getMonth() + 1))

    // Step 3.6: click "Vorschau"
    await page.getByTestId("export-template-preview").click()

    // Step 3.7: preview output contains the static LODAS header
    const previewBox = page.getByTestId("export-template-preview-output")
    await expect(previewBox).toBeVisible({ timeout: 15_000 })
    await expect(previewBox).toContainText("[Allgemein]")
    await expect(previewBox).toContainText("Ziel=LODAS")
    await expect(previewBox).toContainText("[Bewegungsdaten]")
  })
})

// ══════════════════════════════════════════════════════════════
// STEP 5 — Salary history workflow
// ══════════════════════════════════════════════════════════════
//
// Implementation notes:
//  - The first test ("locate") clicks the first employee in the list
//    and STORES the resulting employee UUID in module-scope state.
//  - All subsequent tests navigate DIRECTLY to `/admin/employees/<uuid>`
//    to guarantee they operate on the same employee across a run and
//    across re-runs (the list is sorted deterministically by lastName
//    → firstName, but URL-based navigation removes all doubt).
//  - Row counting uses a single flat locator (`tr[data-testid^=...]`)
//    which is simpler and more forgiving than scoping to the tbody.
//  - All count assertions use `expect.poll` so they survive the
//    asynchronous cache-invalidation cycle after a mutation.
test.describe.serial("Phase 3 Step 5 — Gehaltshistorie", () => {
  // Shared state across all tests in this describe block
  let employeeId = ""

  function historyRows(page: Page) {
    return page.locator('tr[data-testid^="salary-history-row-"]')
  }

  /**
   * Waits until the salary-history query has finished loading so that
   * row counts become trustworthy. Without this, `historyRows.count()`
   * can return 0 while the useQuery is still in its loading state and
   * the test sees "empty" even though the database has leftover rows
   * that arrive one tick later.
   */
  async function waitForHistoryLoaded(page: Page) {
    await Promise.race([
      page
        .getByTestId("salary-history-empty")
        .waitFor({ state: "visible", timeout: 10_000 }),
      historyRows(page)
        .first()
        .waitFor({ state: "visible", timeout: 10_000 }),
    ])
  }

  async function gotoEmployeeVerguetung(page: Page) {
    if (!employeeId) {
      throw new Error(
        "employeeId not set — Step 5.locate must run first in this describe.serial block",
      )
    }
    await page.goto(`/de/admin/employees/${employeeId}`)
    await page.getByRole("tab", { name: /Vergütung/ }).click()
    await expect(page.getByTestId("salary-history-section")).toBeVisible({
      timeout: 10_000,
    })
    await waitForHistoryLoaded(page)
  }

  async function deleteAllRows(page: Page) {
    let guard = 20
    while (guard-- > 0) {
      const rows = historyRows(page)
      const count = await rows.count()
      if (count === 0) return
      const rowId = (await rows.first().getAttribute("data-testid"))!.replace(
        "salary-history-row-",
        "",
      )
      await page.getByTestId(`salary-history-delete-${rowId}`).click()
      await page
        .getByRole("button", { name: /^löschen$/i })
        .last()
        .click()
      await expect(
        page.getByTestId(`salary-history-row-${rowId}`),
      ).toHaveCount(0, { timeout: 10_000 })
    }
    throw new Error(
      "deleteAllRows exceeded its guard — the salary history is stuck with leftover rows",
    )
  }

  test("Step 5.locate — pick the first employee and lock onto their UUID", async ({
    page,
  }) => {
    await page.goto(EMPLOYEES_URL)
    const firstRow = page.locator("table tbody tr").first()
    await firstRow.waitFor({ state: "visible", timeout: 15_000 })
    await firstRow.click()
    await expect(page).toHaveURL(/\/admin\/employees\/[0-9a-f-]{36}/)
    const match = page.url().match(/\/admin\/employees\/([0-9a-f-]{36})/)
    expect(match).not.toBeNull()
    employeeId = match![1]!
    expect(employeeId).toBeTruthy()

    // Verify the Vergütung tab + salary history section render on this
    // employee so subsequent tests can rely on it.
    await page.getByRole("tab", { name: /Vergütung/ }).click()
    await expect(page.getByTestId("salary-history-section")).toBeVisible({
      timeout: 10_000,
    })
  })

  test("Step 5.1 — cleanup: remove any leftover salary history rows", async ({
    page,
  }) => {
    await gotoEmployeeVerguetung(page)
    await deleteAllRows(page)
    // Hard assertion after reload — the list is authoritative
    await page.reload()
    await page.getByRole("tab", { name: /Vergütung/ }).click()
    await expect(page.getByTestId("salary-history-section")).toBeVisible()
    await waitForHistoryLoaded(page)
    await expect
      .poll(async () => historyRows(page).count(), { timeout: 5_000 })
      .toBe(0)
  })

  test("Step 5.4–5.6 — create the initial entry", async ({ page }) => {
    await gotoEmployeeVerguetung(page)
    // Double-check we really start from zero
    await expect
      .poll(async () => historyRows(page).count(), { timeout: 5_000 })
      .toBe(0)

    await page.getByTestId("salary-history-add").click()
    await page.getByTestId("salary-history-valid-from").fill("2023-01-01")
    // paymentType defaults to "monthly"
    await page.getByTestId("salary-history-gross").fill("3000")
    // changeReason defaults to "raise" — explicitly set to "initial"
    await page.getByTestId("salary-history-reason").click()
    await page.getByRole("option", { name: "Initial" }).click()
    await page.getByTestId("salary-history-save").click()

    // Success toast confirms the mutation completed
    await expect(
      page.getByText(/Gehaltshistorie-Eintrag angelegt/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Exactly one row, marked "aktuell" inside the history table
    await expect
      .poll(async () => historyRows(page).count(), { timeout: 10_000 })
      .toBe(1)
    await expect(
      page.getByTestId("salary-history-rows").getByText(/aktuell/i),
    ).toBeVisible()
  })

  test("Step 5.7–5.10 — second entry auto-closes the first + Employee.grossSalary sync", async ({
    page,
  }) => {
    await gotoEmployeeVerguetung(page)
    // Start with exactly one row from the previous test
    await expect
      .poll(async () => historyRows(page).count(), { timeout: 5_000 })
      .toBe(1)

    await page.getByTestId("salary-history-add").click()
    await page.getByTestId("salary-history-valid-from").fill("2023-07-01")
    await page.getByTestId("salary-history-gross").fill("3300")
    // changeReason defaults to "raise" — keep as-is
    await page.getByTestId("salary-history-save").click()

    await expect(
      page.getByText(/Gehaltshistorie-Eintrag angelegt/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Two rows now
    await expect
      .poll(async () => historyRows(page).count(), { timeout: 10_000 })
      .toBe(2)

    // The newest row has the "aktuell" marker
    await expect(
      page.getByTestId("salary-history-rows").getByText(/aktuell/i),
    ).toBeVisible()
    // The old row shows the auto-computed validTo (30.06.2023)
    await expect(page.getByTestId("salary-history-rows")).toContainText(
      "30.06.2023",
    )

    // Step 5.10: Employee master salary is synchronized. The Vergütung
    // overview renders grossSalary with `.toFixed(2)` → "3300.00 EUR".
    // Look for it anywhere in the compensation tabpanel.
    await expect(
      page.getByRole("tabpanel", { name: /Vergütung/ }),
    ).toContainText(/3300\.00\s*EUR/)
  })

  test("Step 5.11 — rejecting a validFrom older than the open entry", async ({
    page,
  }) => {
    await gotoEmployeeVerguetung(page)
    await expect
      .poll(async () => historyRows(page).count(), { timeout: 5_000 })
      .toBe(2)

    await page.getByTestId("salary-history-add").click()
    await page.getByTestId("salary-history-valid-from").fill("2023-03-01")
    await page.getByTestId("salary-history-gross").fill("2900")
    await page.getByTestId("salary-history-save").click()

    // Error toast surfaces the German validation message
    await expect(
      page.getByText(/darf nicht vor dem validFrom/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Row count unchanged — still only the 2 valid rows
    await expect
      .poll(async () => historyRows(page).count(), { timeout: 5_000 })
      .toBe(2)
  })

  test("Step 5.12 — cleanup: delete both entries via the trash icon", async ({
    page,
  }) => {
    await gotoEmployeeVerguetung(page)
    // The Step 5.11 form might still be open with an error state.
    // Close it if the Cancel button is visible, then delete rows.
    const cancelBtn = page.getByRole("button", { name: /^Abbrechen$/ })
    if (await cancelBtn.count()) {
      await cancelBtn.first().click()
    }
    await deleteAllRows(page)
    await page.reload()
    await page.getByRole("tab", { name: /Vergütung/ }).click()
    await expect(page.getByTestId("salary-history-section")).toBeVisible()
    await waitForHistoryLoaded(page)
    await expect
      .poll(async () => historyRows(page).count(), { timeout: 5_000 })
      .toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// STEP 6 — DATEV-Onboarding-Checkliste
// ══════════════════════════════════════════════════════════════
test("Phase 3 Step 6 — DATEV-Onboarding-Checkliste rendert alle Status-Zeilen", async ({
  page,
}) => {
  await page.goto(ONBOARDING_URL)
  await expect(page.getByTestId("datev-onboarding-page")).toBeVisible({
    timeout: 15_000,
  })

  // Step 6.2: the two cards with the checklist
  await expect(
    page.getByRole("heading", { name: /Schnittstellen-Konfiguration/ }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: /Mitarbeiter-Vollständigkeit/ }),
  ).toBeVisible()

  // Step 6.3: all six checklist labels render
  const expectedLabels = [
    /BeraterNr gepflegt/,
    /MandantNr gepflegt/,
    /Aktives Template vorhanden/,
    /Default-Template auf Schnittstelle gesetzt/,
    /Test-\/Produktivexport bereits ausgeführt/,
    /Lohnart-Mapping angepasst/,
  ]
  for (const label of expectedLabels) {
    await expect(page.getByText(label)).toBeVisible()
  }

  // Step 6.4: employee completion counter — format "X / Y vollständig"
  const counter = page.getByTestId("onboarding-complete-counter")
  await expect(counter).toBeVisible()
  await expect(counter).toContainText(/\d+\s*\/\s*\d+\s+vollständig/)

  // The Steuerberater-PDF button is present (verified in its own test)
  await expect(page.getByTestId("onboarding-download-pdf")).toBeVisible()
})

// ══════════════════════════════════════════════════════════════
// STEP 7 — Steuerberater-PDF download
// ══════════════════════════════════════════════════════════════
test("Phase 3 Step 7 — Steuerberater-PDF wird generiert und heruntergeladen", async ({
  page,
}) => {
  await page.goto(ONBOARDING_URL)
  await expect(page.getByTestId("datev-onboarding-page")).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.getByTestId("onboarding-download-pdf").click(),
  ])

  // Step 7.2: filename pattern
  expect(download.suggestedFilename()).toMatch(
    /^DATEV_Import_Anleitung_\d{8}\.pdf$/,
  )

  // Step 7.3: verify it is actually a PDF — check the magic bytes
  const path = await download.path()
  expect(path).toBeTruthy()
  const fs = await import("node:fs")
  const header = fs.readFileSync(path!).subarray(0, 4).toString("ascii")
  expect(header).toBe("%PDF")
  // And the file is non-trivial
  expect(fs.statSync(path!).size).toBeGreaterThan(1000)
})

// ══════════════════════════════════════════════════════════════
// STEP 8 — Sidebar integration
// ══════════════════════════════════════════════════════════════
test("Phase 3 Step 8 — Sidebar: Administration-Sektion enthält die neuen Einträge", async ({
  page,
}) => {
  await page.goto("/de/dashboard")

  // Open the "Administration" collapsible section in the sidebar
  await page.getByRole("button", { name: /^Administration$/ }).click()

  // The three new entries are reachable — we assert by role+name on the
  // link elements inside the expanded section.
  await expect(
    page.getByRole("link", { name: /^Lohn-Massenimport$/ }),
  ).toBeVisible({ timeout: 5_000 })
  await expect(
    page.getByRole("link", { name: /^DATEV-Onboarding$/ }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: /^Export-Templates$/ }),
  ).toBeVisible()

  // And the legacy "Exportschnittstellen" entry has been removed from nav
  // (the route still exists — only the sidebar entry is gone).
  await expect(
    page.getByRole("link", { name: /^Exportschnittstellen$/ }),
  ).toHaveCount(0)
})

// ══════════════════════════════════════════════════════════════
// STEP 9 — Audit-Log entries
// ══════════════════════════════════════════════════════════════
// The audit log page displays entity_type via a localized label
// (e.g. "Export-Template") rather than the raw value — filtering
// by raw value via URL params therefore does not match a cell by
// name. We use the pattern from 62-export-templates.spec.ts: look
// for the audited *entity name* (which is the template name itself,
// rendered verbatim in the entity-name column) in the default view.
test("Phase 3 Step 9 — Audit-Log zeigt Einträge der vorhergehenden Tests", async ({
  page,
}) => {
  await page.goto(AUDIT_LOGS_URL)
  await expect(
    page.getByRole("heading", { name: /Audit/i }).first(),
  ).toBeVisible({ timeout: 15_000 })

  // After the copy tests in Step 1+2, there should be an audit entry
  // whose entity_name is the LODAS template name. The table renders
  // entity names verbatim, so a plain getByText match is enough.
  await expect(
    page.getByText(COPIED_BASE_NAME, { exact: true }).first(),
  ).toBeVisible({ timeout: 15_000 })
})

// ══════════════════════════════════════════════════════════════
// Cleanup — remove the tenant templates created during the copy tests
// ══════════════════════════════════════════════════════════════
test("cleanup — remove tenant templates created by the copy tests", async ({
  page,
}) => {
  await deletePreviousLodasCopies(page)
  // Sanity: no LODAS-Bewegungsdaten rows left
  await openTemplatesList(page)
  const leftover = page
    .locator('[data-testid^="export-template-row-"]')
    .filter({ hasText: COPIED_BASE_NAME })
  expect(await leftover.count()).toBe(0)
})
