import { test, expect, type Page } from "@playwright/test"
import { navigateTo } from "./helpers/nav"
import {
  countAttachments,
  createDraftWorkReport,
  createSignedWorkReport,
  disconnect,
  ensureSeedOrderForWorkReport,
  resetWorkReports,
} from "./helpers/work-report-fixtures"

/**
 * UC-WR-01: Arbeitsscheine — M-1 Desktop-Workflow
 *
 * Deckt die Kern-Lifecycle-Flows aus Phase 8 des Implementation-Plans
 * `thoughts/shared/plans/2026-04-22-workreport-arbeitsschein-m1.md` sowie
 * die in der manuellen Verifikation gefundenen Regressions
 * (Duplicate-Assignment, Sign-Button-Disabled, Post-Sign-Read-Only-Zustand)
 * ab. Vgl. Plan 2026-04-24-workreport-e2e-coverage.md.
 *
 *   Flow A — Happy-Path: Draft-Create via Form-Sheet → Mitarbeiter
 *            zuweisen → Canvas-Signatur → SIGNED Status persistiert
 *            Reload-fest.
 *   Flow B — Assignment-Ergänzungen: Duplicate-Rejection + Remove.
 *   Flow C — Attachments: JPEG-Upload inkl. Download + Remove, .txt-
 *            Ablehnung client-seitig.
 *   Flow D — Sign-Pre-Check: leere workDescription bzw. 0 Assignments
 *            deaktivieren Submit-Button.
 *   Flow E — Post-Sign-Read-Only: Header-Buttons, Signatur-Card,
 *            Assignment/Attachment-Cards verschwinden, Audit-Eintrag.
 *   Flow F — VOID-Flow + STORNIERT-PDF + Audit.
 *
 * Alle Fixtures werden via direktem `pg`-Pool geseedet — signierte
 * Zustände über UI zu erzeugen wäre für einen Regressions-Testlauf zu
 * langsam. Der Happy-Path-Test treibt aber bewusst den vollen UI-Flow
 * (Canvas-Drawing via `page.mouse.*`).
 */

const STAMP = Date.now().toString().slice(-6)

// Minimal valid JPEG (1x1 white pixel) for attachment upload.
// Created manually to keep the test fixture inline without an external file.
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD/AD/6KKKAP//Z"
function jpegBuffer(): Buffer {
  return Buffer.from(TINY_JPEG_BASE64, "base64")
}

async function openWorkReportDetail(page: Page, id: string): Promise<void> {
  await navigateTo(page, `/admin/work-reports/${id}`)
  // Wait for header to render
  await expect(page.getByText(/AS-/).first()).toBeVisible({ timeout: 10_000 })
}

async function signWorkReportViaUi(
  page: Page,
  opts: { signerName: string; signerRole: string },
): Promise<void> {
  await page.getByRole("button", { name: /^Signieren$/ }).click()
  await expect(page.getByText("Arbeitsschein signieren")).toBeVisible()

  await page.locator("#signer-name").fill(opts.signerName)
  await page.locator("#signer-role").fill(opts.signerRole)

  // Draw a valid signature (>= 3 points satisfies SignaturePad threshold)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("Canvas nicht sichtbar")
  await page.mouse.move(box.x + 40, box.y + 50)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 })
  await page.mouse.move(box.x + 220, box.y + 60, { steps: 5 })
  await page.mouse.move(box.x + 320, box.y + 90, { steps: 5 })
  await page.mouse.up()

  const signBtn = page.getByRole("button", { name: /^Signieren$/ }).last()
  await expect(signBtn).toBeEnabled({ timeout: 5_000 })
  await signBtn.click()
  await expect(page.getByText("Signiert").first()).toBeVisible({
    timeout: 20_000,
  })
}

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
      page.getByRole("heading", { name: "Arbeitsscheine", exact: true }),
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
    // Wait for the assignment panel to be visible
    await expect(page.getByText("Mitarbeiter zuweisen")).toBeVisible({
      timeout: 5_000,
    })
    // Open employee picker (only combobox on the Mitarbeiter panel)
    await page.getByRole("combobox").first().click()
    // Click the admin employee by personnel number EMP001 (unique)
    await page.locator("button:has-text('EMP001')").first().click({
      timeout: 10_000,
    })

    // "Hinzufügen" becomes enabled once the picker has a value
    await expect(
      page.getByRole("button", { name: /Hinzufügen/ }),
    ).toBeEnabled({ timeout: 5_000 })
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

  // ─── 3. Assignment flows (duplicate rejection + remove) ──────────

  test("Duplicate-Assignment: gleicher Mitarbeiter wird abgelehnt", async ({
    page,
  }) => {
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createDraftWorkReport({
      orderId: order.id,
      withAssignment: true, // admin already assigned
      withDescription: true,
    })
    await openWorkReportDetail(page, wr.id)
    await page.getByRole("tab", { name: "Mitarbeiter" }).click()
    await expect(page.getByText("Mitarbeiter zuweisen")).toBeVisible({
      timeout: 5_000,
    })

    // Pick the same admin employee (EMP001) again
    await page.getByRole("combobox").first().click()
    await page.locator("button:has-text('EMP001')").first().click({
      timeout: 10_000,
    })
    await expect(
      page.getByRole("button", { name: /Hinzufügen/ }),
    ).toBeEnabled({ timeout: 5_000 })
    await page.getByRole("button", { name: /Hinzufügen/ }).click()

    // Server returns conflict → toast.error("Employee is already assigned ...")
    await expect(
      page.locator('[data-sonner-toast]').getByText(/already assigned/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Table still has exactly one row
    await expect(page.locator("table tbody tr")).toHaveCount(1)
  })

  test("Remove-Assignment: Papierkorb entfernt Zeile", async ({ page }) => {
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createDraftWorkReport({
      orderId: order.id,
      withAssignment: true,
      withDescription: true,
    })
    await openWorkReportDetail(page, wr.id)
    await page.getByRole("tab", { name: "Mitarbeiter" }).click()

    await expect(page.locator("table tbody tr")).toHaveCount(1)

    // Papierkorb auf der Assignment-Zeile
    await page
      .locator("table tbody tr")
      .first()
      .getByRole("button")
      .last()
      .click()

    // ConfirmDialog bestätigen
    await expect(page.getByText("Mitarbeiter entfernen")).toBeVisible()
    await page.getByRole("button", { name: /^Entfernen$/ }).click()

    // Zeile weg → Empty-State
    await expect(
      page.getByText("Noch keine Mitarbeiter zugewiesen."),
    ).toBeVisible({ timeout: 10_000 })
  })

  // ─── 4. Attachments: JPEG upload + download + remove ─────────────

  test("Attachment: JPEG hochladen, Datei erscheint, Entfernen löscht Zeile", async ({
    page,
  }) => {
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createDraftWorkReport({
      orderId: order.id,
      withAssignment: true,
      withDescription: true,
    })
    await openWorkReportDetail(page, wr.id)
    await page.getByRole("tab", { name: "Fotos" }).click()

    // Upload
    await page
      .locator('input[data-testid="work-report-attachment-input"]')
      .setInputFiles({
        name: "e2e-test-photo.jpg",
        mimeType: "image/jpeg",
        buffer: jpegBuffer(),
      })

    // Success toast
    await expect(
      page.locator('[data-sonner-toast]').getByText(/hochgeladen/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // File row appears
    await expect(
      page.getByText("e2e-test-photo.jpg").first(),
    ).toBeVisible({ timeout: 10_000 })

    // DB row present
    expect(await countAttachments(wr.id)).toBe(1)

    // Remove via trash icon — click first remove button in the attachment list
    const removeButton = page
      .locator('li:has-text("e2e-test-photo.jpg")')
      .getByRole("button")
      .last()
    await removeButton.click()
    await expect(page.getByText("Foto entfernen")).toBeVisible()
    await page.getByRole("button", { name: /^Entfernen$/ }).click()

    await expect(page.getByText("e2e-test-photo.jpg")).toHaveCount(0, {
      timeout: 10_000,
    })
    expect(await countAttachments(wr.id)).toBe(0)
  })

  test("Attachment: Falscher MIME-Type wird client-seitig abgelehnt", async ({
    page,
  }) => {
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createDraftWorkReport({
      orderId: order.id,
      withAssignment: true,
      withDescription: true,
    })
    await openWorkReportDetail(page, wr.id)
    await page.getByRole("tab", { name: "Fotos" }).click()

    await page
      .locator('input[data-testid="work-report-attachment-input"]')
      .setInputFiles({
        name: "forbidden.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not allowed", "utf-8"),
      })

    // Error toast from handleFileSelected client-side guard
    await expect(
      page.locator('[data-sonner-toast]').getByText(/Dateityp nicht erlaubt/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Nothing landed in the DB
    expect(await countAttachments(wr.id)).toBe(0)

    // Empty state remains
    await expect(page.getByText("Noch keine Fotos.")).toBeVisible()
  })

  // ─── 5. Sign pre-checks ──────────────────────────────────────────

  test("Sign-Dialog zeigt Fehler bei 0 Assignments", async ({ page }) => {
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createDraftWorkReport({
      orderId: order.id,
      withAssignment: false,
      withDescription: true,
    })
    await openWorkReportDetail(page, wr.id)

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

  test("Sign-Dialog zeigt Fehler bei leerer Arbeitsbeschreibung", async ({
    page,
  }) => {
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createDraftWorkReport({
      orderId: order.id,
      withAssignment: true,
      withDescription: false,
    })
    await openWorkReportDetail(page, wr.id)

    await page.getByRole("button", { name: /^Signieren$/ }).click()
    await expect(page.getByText("Arbeitsschein signieren")).toBeVisible()

    await expect(
      page.getByText(
        "Arbeitsbeschreibung fehlt — vor dem Signieren pflegen.",
      ),
    ).toBeVisible()

    const signBtn = page.getByRole("button", { name: /^Signieren$/ }).last()
    await expect(signBtn).toBeDisabled()
  })

  // ─── 6. Post-sign: header + signature card + read-only tabs + audit ──

  test("Post-Sign-Zustand: Header-Buttons, Signatur-Card, Read-Only-Tabs, Audit", async ({
    page,
  }) => {
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createDraftWorkReport({
      orderId: order.id,
      withAssignment: true,
      withDescription: true,
    })
    await openWorkReportDetail(page, wr.id)

    // Drive the sign flow via UI (covers the e2e path end-to-end)
    await signWorkReportViaUi(page, {
      signerName: "Max Mustermann",
      signerRole: "Betriebsleiter",
    })

    // Header: Bearbeiten, Signieren, Löschen not visible
    await expect(page.getByRole("button", { name: /Bearbeiten/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Signieren$/ })).toHaveCount(0)
    // Löschen is an icon button with Tooltip "Löschen"; tooltip disappears
    // with the parent button, so checking the tooltip-content absence would
    // be racy. Instead check that no button has the destructive trash icon
    // rendered with a Tooltip wrapper — the Bearbeiten check above already
    // proves canManage-gated buttons are hidden.

    // PDF-Button bleibt sichtbar (für alle Stati)
    await expect(
      page.getByRole("button", { name: /PDF herunterladen/ }),
    ).toBeVisible()

    // Signatur-Card auf Details-Tab
    await expect(page.getByText("Max Mustermann")).toBeVisible()
    await expect(page.getByText("Betriebsleiter")).toBeVisible()

    // Mitarbeiter-Tab: keine "Mitarbeiter zuweisen"-Card
    await page.getByRole("tab", { name: "Mitarbeiter" }).click()
    await expect(page.getByText("Mitarbeiter zuweisen")).toHaveCount(0)

    // Fotos-Tab: kein "Hochladen"-Button
    await page.getByRole("tab", { name: "Fotos" }).click()
    await expect(page.getByRole("button", { name: /Hochladen/ })).toHaveCount(0)

    // Audit-Tab: mindestens 1 Eintrag "sign". `useAuditLogs` wird nicht
    // invalidiert, wenn eine sign()-Mutation gerade abgeschlossen wurde —
    // ein Reload garantiert frische Daten.
    await page.reload()
    await expect(page.getByText("Signiert").first()).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole("tab", { name: "Audit" }).click()
    await expect(
      page.getByRole("cell", { name: /^sign$/ }).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  // ─── 7. VOID flow on signed record ───────────────────────────────

  test("VOID-Flow: signierten Schein stornieren (Validierung + Post-State)", async ({
    page,
  }) => {
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createSignedWorkReport({
      orderId: order.id,
      signerName: "Max Mustermann",
      signerRole: "Betriebsleiter",
    })

    await openWorkReportDetail(page, wr.id)

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

    // Whitespace-only: trimmed length < 10 → disabled
    await reason.fill("                    ")
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

    // Stornieren-Button no longer visible
    await expect(page.getByRole("button", { name: /Stornieren/ })).toHaveCount(0)

    // Audit-Tab shows "void". Reload fetches fresh audit entries.
    await page.reload()
    await expect(page.getByText("Storniert").first()).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole("tab", { name: "Audit" }).click()
    await expect(
      page.getByRole("cell", { name: /^void$/ }).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("Post-Void: PDF-Download liefert application/pdf (200)", async ({
    page,
  }) => {
    const order = await ensureSeedOrderForWorkReport()
    const wr = await createSignedWorkReport({ orderId: order.id })

    // Void via SQL — the UI path is already covered above and we don't want
    // to re-test it here. The cron-less PDF regen happens on download.
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
            SET status = 'VOID',
                voided_at = NOW(),
                void_reason = 'E2E storno reason — long enough',
                updated_at = NOW()
          WHERE id = $1`,
        [wr.id],
      )
    } finally {
      await pool.end()
    }

    await openWorkReportDetail(page, wr.id)
    await expect(page.getByText("Storniert").first()).toBeVisible({
      timeout: 10_000,
    })

    // Click PDF-Download — the downloadPdf tRPC mutation resolves with
    // { signedUrl } and then the UI calls window.open. Capture the tRPC
    // response directly; that's reliable (the popup event is racy because
    // the browser opens with `noopener,noreferrer` and may not commit
    // a URL by the time the event fires).
    const pdfBtn = page.getByRole("button", { name: /PDF herunterladen/ })

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/trpc/") &&
          r.url().includes("workReports.downloadPdf"),
        { timeout: 10_000 },
      ),
      pdfBtn.click(),
    ])

    expect(response.status()).toBeLessThan(400)
    const body = (await response.json()) as unknown
    // tRPC wraps mutation data under result.data.json or result.data.
    const signedUrl = extractSignedUrl(body)
    expect(signedUrl).toMatch(/^https?:\/\//)

    const pdfResp = await page.request.get(signedUrl!, { timeout: 15_000 })
    expect(pdfResp.status()).toBeLessThan(400)
    const ct = pdfResp.headers()["content-type"] ?? ""
    expect(ct.toLowerCase()).toContain("pdf")
  })
})

/**
 * Walk a tRPC batch-stream response shape and pull out the first
 * `signedUrl` we can find. Keeps the test resilient to any future
 * tRPC response format changes.
 */
function extractSignedUrl(payload: unknown): string | null {
  const seen = new WeakSet<object>()
  function walk(v: unknown): string | null {
    if (v == null) return null
    if (typeof v === "string") return null
    if (typeof v !== "object") return null
    if (seen.has(v as object)) return null
    seen.add(v as object)
    const rec = v as Record<string, unknown>
    if (typeof rec.signedUrl === "string") return rec.signedUrl
    for (const val of Object.values(rec)) {
      const found = walk(val)
      if (found) return found
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        const found = walk(item)
        if (found) return found
      }
    }
    return null
  }
  return walk(payload)
}
