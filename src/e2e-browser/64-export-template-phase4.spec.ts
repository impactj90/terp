import { test, expect, type Page } from "@playwright/test"

/**
 * E2E browser tests for Phase 4 template polish features.
 *
 *   4.1 — Version history panel + restore button
 *   4.4 — Export-Schedules page CRUD + default-disabled behavior
 *
 * Phase 4.2 (snapshots), 4.3 (sharing) and 4.5 (multi-file) are
 * exercised at the integration-test level — they don't have a
 * dedicated UI page worth E2E coverage. The schedule and version
 * history flows DO have user-facing UIs and benefit from a happy-path
 * smoke test.
 */

const TPL_NAME = `Phase4 E2E Tpl ${Date.now()}`
const SCHED_NAME = `Phase4 Sched ${Date.now()}`

async function openTemplatesList(page: Page) {
  await page.goto("/de/admin/export-templates")
  await expect(page.getByTestId("export-templates-page")).toBeVisible({
    timeout: 15_000,
  })
}

async function createTemplate(page: Page, name: string, body: string) {
  await openTemplatesList(page)
  await page.getByTestId("export-template-new").click()
  await page.getByTestId("export-template-name").fill(name)
  await page.getByTestId("export-template-body").fill(body)
  await page.getByTestId("export-template-save").click()
  await expect(
    page.getByTestId(`export-template-row-${name}`),
  ).toBeVisible({ timeout: 10_000 })
}

// ══════════════════════════════════════════════════════════════
// 4.1 — Version history panel
// ══════════════════════════════════════════════════════════════
test.describe.serial("Phase 4.1 — Version history panel", () => {
  test("setup — create a template, then bump it twice to build history", async ({
    page,
  }) => {
    await createTemplate(page, TPL_NAME, "v1 body line\n")

    // Open the editor again, change the body → archives v1 + bumps to v2
    await openTemplatesList(page)
    await page.getByTestId(`export-template-edit-${TPL_NAME}`).click()
    await expect(page.getByTestId("export-template-body")).toBeVisible()
    await page
      .getByTestId("export-template-body")
      .fill("v2 body line\n")
    await page.getByTestId("export-template-save").click()

    const row = page.getByTestId(`export-template-row-${TPL_NAME}`)
    await expect(row).toContainText("v2", { timeout: 10_000 })

    // Bump to v3
    await page.getByTestId(`export-template-edit-${TPL_NAME}`).click()
    await expect(page.getByTestId("export-template-body")).toBeVisible()
    await page
      .getByTestId("export-template-body")
      .fill("v3 body line\n")
    await page.getByTestId("export-template-save").click()
    await expect(row).toContainText("v3", { timeout: 10_000 })
  })

  test("displays the version history panel and restores v1", async ({
    page,
  }) => {
    await openTemplatesList(page)
    await page.getByTestId(`export-template-edit-${TPL_NAME}`).click()
    await expect(page.getByTestId("export-template-body")).toBeVisible()

    // Toggle the version panel
    await page.getByTestId("export-template-versions-toggle").click()
    const panel = page.getByTestId("export-template-versions-panel")
    await expect(panel).toBeVisible({ timeout: 10_000 })

    // Two archived versions: v1 and v2 (current = v3)
    await expect(panel.getByTestId("export-template-version-1")).toBeVisible()
    await expect(panel.getByTestId("export-template-version-2")).toBeVisible()

    // Restore v1
    await panel.getByTestId("export-template-restore-1").click()
    // After restore, the editor closes (onSaved). The list now shows v4
    // (restore archives current and bumps).
    const row = page.getByTestId(`export-template-row-${TPL_NAME}`)
    await expect(row).toContainText("v4", { timeout: 10_000 })

    // Re-open and confirm the body matches v1
    await page.getByTestId(`export-template-edit-${TPL_NAME}`).click()
    await expect(page.getByTestId("export-template-body")).toHaveValue(
      "v1 body line\n",
    )
  })

  test("cleanup — delete the template", async ({ page }) => {
    await openTemplatesList(page)
    await page.getByTestId(`export-template-delete-${TPL_NAME}`).click()
    await page.getByRole("button", { name: /^löschen$/i }).last().click()
    await expect(
      page.getByTestId(`export-template-row-${TPL_NAME}`),
    ).toHaveCount(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 4.4 — Export schedules CRUD page
// ══════════════════════════════════════════════════════════════
test.describe.serial("Phase 4.4 — Export schedules page", () => {
  const SCHED_TPL = `Phase4 Sched Tpl ${Date.now()}`

  test("setup — create a template the schedule can target", async ({
    page,
  }) => {
    await createTemplate(
      page,
      SCHED_TPL,
      "Personalnummer\n{% for emp in employees %}{{ emp.personnelNumber }}\n{% endfor %}",
    )
  })

  test("schedules page loads with empty state", async ({ page }) => {
    await page.goto("/de/admin/export-templates/schedules")
    await expect(
      page.getByTestId("export-template-schedules-page"),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole("heading", { name: /Export-Zeitpläne/i }),
    ).toBeVisible()
  })

  test("creates a monthly schedule (default OFF) and toggles activation", async ({
    page,
  }) => {
    await page.goto("/de/admin/export-templates/schedules")
    await expect(
      page.getByTestId("export-template-schedules-page"),
    ).toBeVisible()

    await page.getByTestId("schedule-new").click()
    await page.getByTestId("schedule-name").fill(SCHED_NAME)
    // Pick the just-created template.
    await page.getByTestId("schedule-template").click()
    await page.getByRole("option", { name: SCHED_TPL }).click()
    // Default frequency is monthly — leave as-is.
    await page.getByTestId("schedule-day-of-month").fill("5")
    await page.getByTestId("schedule-hour").fill("8")
    await page
      .getByTestId("schedule-recipients")
      .fill("steuer@example.com")
    await page.getByTestId("schedule-save").click()

    const row = page.getByTestId(`schedule-row-${SCHED_NAME}`)
    await expect(row).toBeVisible({ timeout: 10_000 })
    // Default is DEACTIVATED — must be visible in the row badge.
    await expect(row).toContainText(/Deaktiviert/i)

    // Toggle to active
    await page.getByTestId(`schedule-toggle-${SCHED_NAME}`).click()
    await expect(row).toContainText(/Aktiv/i, { timeout: 10_000 })

    // Toggle back off
    await page.getByTestId(`schedule-toggle-${SCHED_NAME}`).click()
    await expect(row).toContainText(/Deaktiviert/i, { timeout: 10_000 })
  })

  test("rejects an invalid email address", async ({ page }) => {
    await page.goto("/de/admin/export-templates/schedules")
    await page.getByTestId("schedule-new").click()
    await page
      .getByTestId("schedule-name")
      .fill(`Invalid email ${Date.now()}`)
    await page.getByTestId("schedule-template").click()
    await page.getByRole("option", { name: SCHED_TPL }).click()
    await page.getByTestId("schedule-day-of-month").fill("5")
    await page.getByTestId("schedule-hour").fill("8")
    await page
      .getByTestId("schedule-recipients")
      .fill("not-an-email")
    await page.getByTestId("schedule-save").click()

    // The validation error appears as inline text inside the form
    await expect(
      page
        .getByTestId("export-template-schedules-page")
        .getByText(/Invalid email/i),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("cleanup — delete the schedule and its template", async ({ page }) => {
    await page.goto("/de/admin/export-templates/schedules")
    await page.getByTestId(`schedule-delete-${SCHED_NAME}`).click()
    await page.getByRole("button", { name: /^löschen$/i }).last().click()
    await expect(
      page.getByTestId(`schedule-row-${SCHED_NAME}`),
    ).toHaveCount(0)

    // Delete the supporting template
    await openTemplatesList(page)
    await page.getByTestId(`export-template-delete-${SCHED_TPL}`).click()
    await page.getByRole("button", { name: /^löschen$/i }).last().click()
  })
})
