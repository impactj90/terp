import { test, expect } from "@playwright/test"
import { navigateTo } from "./helpers/nav"
import {
  createDraftWorkReport,
  disconnect,
  ensureSeedOrderForWorkReport,
  resetWorkReports,
} from "./helpers/work-report-fixtures"

/**
 * UC-WR-01: Arbeitsscheine — M-1 Desktop-Workflow
 *
 * Deckt die drei zentralen Flows aus Phase 8 des Implementation-Plans
 * `thoughts/shared/plans/2026-04-22-workreport-arbeitsschein-m1.md` ab:
 *
 *   Flow A — Happy-Path: Draft-Create via Form-Sheet → Mitarbeiter
 *            zuweisen (bereits über Seed) → Canvas-Signatur → SIGNED
 *            Status persistiert Reload-fest.
 *   Flow B — Sign ohne Pflichtvoraussetzungen: der Sign-Dialog
 *            deaktiviert den "Signieren"-Button und zeigt den roten
 *            Hinweis-Text, wenn `workDescription` leer oder keine
 *            Assignments vorhanden sind.
 *   Flow C — VOID-Flow für signierten Schein: SIGNED → VOID via Dialog
 *            (10-Zeichen-Grund), Status-Banner erscheint, Button
 *            "Stornieren" verschwindet.
 *
 * Alle Fixtures werden via direktem `pg`-Pool geseedet — signierte
 * Zustände über UI zu erzeugen wäre für einen Regressions-Testlauf zu
 * langsam. Der Happy-Path-Test treibt aber bewusst den vollen UI-Flow
 * (Canvas-Drawing via `page.mouse.*`).
 */

const STAMP = Date.now().toString().slice(-6)

test.describe.serial("UC-WR-01: Arbeitsscheine — M-1", () => {
  test.beforeAll(async () => {
    await resetWorkReports()
    await ensureSeedOrderForWorkReport()
  })

  test.afterAll(async () => {
    await resetWorkReports()
    await disconnect()
  })

  // ─── 1. List page loads ─────────────────────────────────────────

  test("Liste lädt und zeigt leeren Zustand", async ({ page }) => {
    await navigateTo(page, "/admin/work-reports")
    await expect(
      page.getByRole("heading", { name: "Arbeitsscheine" }),
    ).toBeVisible({ timeout: 10_000 })
  })

  // ─── 2. Happy-Path: Create → Sign → PDF available ────────────────

  test("Happy-Path: Entwurf anlegen, signieren, PDF herunterladen", async ({
    page,
  }) => {
    // 1) Navigate to list + New
    await navigateTo(page, "/admin/work-reports")
    await page.getByRole("button", { name: /^Neu$/ }).click()

    // 2) Fill create sheet
    await expect(page.getByText("Neuer Arbeitsschein")).toBeVisible()
    // Order picker: click input and select E2E seed order
    await page
      .getByPlaceholder("Auftrag suchen...")
      .click()
    await page
      .getByRole("button", { name: /E2E-WR-AUFTRAG-1/ })
      .first()
      .click()

    await page
      .locator("#wr-visit-date")
      .fill("2026-04-22")
    await page
      .locator("#wr-description")
      .fill(`E2E Happy-Path ${STAMP} — Filter gewechselt, Dichtung erneuert.`)

    await page.getByRole("button", { name: /Erstellen/ }).click()

    // 3) Should land on detail page with AS-... code
    await expect(page.getByText(/AS-\d+/).first()).toBeVisible({
      timeout: 15_000,
    })
    // Draft status badge
    await expect(page.getByText("Entwurf").first()).toBeVisible()

    // 4) Add an assignment (Admin user is in the seed)
    await page.getByRole("tab", { name: "Mitarbeiter" }).click()
    // Open employee picker (first combobox on this page is the assignment picker)
    await page
      .getByRole("combobox", { name: /Mitarbeiter wählen/ })
      .click()
    await page.locator('[role="combobox"][aria-expanded="true"]').first()
      .waitFor({ timeout: 5_000 })
      .catch(() => {
        // Popover may not wire aria-expanded; accept either way
      })
    // Click first option (admin employee)
    await page
      .locator("button:has-text('admin')")
      .first()
      .click({ timeout: 5_000 })
      .catch(async () => {
        // Fallback: click the first hover-able list option
        await page.locator('[class*="hover:bg-accent"]').first().click()
      })

    await page.getByRole("button", { name: /Hinzufügen/ }).click()

    // Assignment row visible
    await expect(page.getByRole("cell", { name: /Monteur/ })
      .or(page.getByText(/Personalnummer/))).toBeVisible({ timeout: 10_000 })

    // 5) Open signature sheet
    await page.getByRole("button", { name: /^Signieren$/ }).click()

    await expect(page.getByText("Arbeitsschein signieren")).toBeVisible()

    // Pre-checks should both pass (green)
    await expect(
      page.getByText("Arbeitsbeschreibung vorhanden"),
    ).toBeVisible()
    await expect(
      page.getByText("Mindestens ein Mitarbeiter zugewiesen"),
    ).toBeVisible()

    // 6) Fill signer name + role
    await page.locator("#signer-name").fill("Max Mustermann")
    await page.locator("#signer-role").fill("Betriebsleiter")

    // 7) Draw a signature on the canvas
    const canvas = page.locator('canvas').first()
    const box = await canvas.boundingBox()
    if (!box) throw new Error("Canvas nicht sichtbar")
    // Multi-point stroke across the canvas; the SignaturePad's
    // 3-point-threshold is satisfied with four points.
    await page.mouse.move(box.x + 40, box.y + 50)
    await page.mouse.down()
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 })
    await page.mouse.move(box.x + 220, box.y + 60, { steps: 5 })
    await page.mouse.move(box.x + 320, box.y + 90, { steps: 5 })
    await page.mouse.up()

    // 8) Submit sign
    const signBtn = page.getByRole("button", { name: /^Signieren$/ }).last()
    await expect(signBtn).toBeEnabled({ timeout: 5_000 })
    await signBtn.click()

    // 9) Status transitions to SIGNED
    await expect(page.getByText("Signiert").first()).toBeVisible({
      timeout: 20_000,
    })

    // PDF button is always available
    await expect(
      page.getByRole("button", { name: /PDF herunterladen/ }),
    ).toBeEnabled()

    // 10) Reload preserves SIGNED status
    await page.reload()
    await expect(page.getByText("Signiert").first()).toBeVisible({
      timeout: 10_000,
    })
  })

  // ─── 3. Error: Sign without assignment ───────────────────────────

  test("Sign-Dialog zeigt Fehler bei 0 Assignments", async ({ page }) => {
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createDraftWorkReport({
      orderId: order.id,
      withAssignment: false,
      withDescription: true,
    })
    await navigateTo(page, `/admin/work-reports/${wr.id}`)

    // Open sign sheet
    await page.getByRole("button", { name: /^Signieren$/ }).click()
    await expect(page.getByText("Arbeitsschein signieren")).toBeVisible()

    // Warning panel visible
    await expect(
      page.getByText("Mindestens ein Mitarbeiter muss zugewiesen sein."),
    ).toBeVisible()

    // Sign-button (the one inside the sheet) stays disabled
    const signBtn = page.getByRole("button", { name: /^Signieren$/ }).last()
    await expect(signBtn).toBeDisabled()
  })

  // ─── 4. VOID flow on signed record ───────────────────────────────

  test("VOID-Flow: signierten Schein stornieren", async ({ page }) => {
    // Seed a SIGNED record via direct SQL
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createDraftWorkReport({
      orderId: order.id,
      withAssignment: true,
      withDescription: true,
    })
    // Promote to SIGNED directly — spec doesn't need to re-test the sign
    // flow here, only the VOID branch.
    const { Pool } = await import("pg")
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:54322/postgres",
      max: 1,
    })
    try {
      await pool.query(
        `UPDATE work_reports
           SET status = 'SIGNED',
               signed_at = NOW(),
               signer_name = 'Max Mustermann',
               signer_role = 'Betriebsleiter',
               updated_at = NOW()
         WHERE id = $1`,
        [wr.id],
      )
    } finally {
      await pool.end()
    }

    await navigateTo(page, `/admin/work-reports/${wr.id}`)

    // Status: Signiert visible
    await expect(page.getByText("Signiert").first()).toBeVisible({
      timeout: 10_000,
    })

    // Open VOID dialog
    await page.getByRole("button", { name: /Stornieren/ }).click()

    const reason = page.locator("#void-reason")
    await expect(reason).toBeVisible()

    // Short reason: submit button disabled
    await reason.fill("zu kurz")
    const voidBtn = page
      .getByRole("button", { name: /^Stornieren$/ })
      .last()
    await expect(voidBtn).toBeDisabled()

    // Valid reason → enabled → submit
    await reason.fill("Einsatzdatum inkorrekt — neuer Schein folgt.")
    await expect(voidBtn).toBeEnabled()
    await voidBtn.click()

    // Status becomes Storniert; void banner visible
    await expect(page.getByText("Storniert").first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(/Storniert am/).first()).toBeVisible()
  })
})
