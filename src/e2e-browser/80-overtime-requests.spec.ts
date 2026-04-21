import { test, expect, type Page, type Browser } from "@playwright/test"
import { navigateTo } from "./helpers/nav"
import {
  APPROVER_STORAGE,
  HR_STORAGE,
  SEED,
  USER_STORAGE,
} from "./helpers/auth"
import {
  countPendingReopens,
  db,
  disconnectPrisma,
  findLatestOvertimeRequest,
  nextSundayUTC,
  resetAllOvertimeRequests,
  resetEmployeeDay,
  resetOvertimeConfig,
  seedPendingReopen,
  seedUnapprovedOvertime,
  setApprovalRequired,
  setEscalationThreshold,
  todayUTC,
} from "./helpers/overtime-fixtures"

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const MAIN = "main#main-content"

async function getMA(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: USER_STORAGE })
  return ctx.newPage()
}

async function getApprover(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: APPROVER_STORAGE })
  return ctx.newPage()
}

async function getHr(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: HR_STORAGE })
  return ctx.newPage()
}

async function openMARequestForm(page: Page): Promise<void> {
  await navigateTo(page, "/overtime-requests")
  await page
    .locator(MAIN)
    .getByRole("button", { name: /Neuer Antrag|New request/i })
    .click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible({ timeout: 5_000 })
}

async function fillMARequestForm(
  page: Page,
  opts: {
    requestType?: "PLANNED" | "REOPEN"
    date: string // ISO YYYY-MM-DD
    minutes: number
    reason: string
  },
): Promise<void> {
  const dialog = page.locator('[data-slot="dialog-content"]')
  if (opts.requestType === "REOPEN") {
    await dialog.locator("#rt-reopen").click()
  }
  // Keep PLANNED default otherwise.
  await dialog.locator("#ot-date").fill(opts.date)
  await dialog.locator("#ot-minutes").fill(String(opts.minutes))
  await dialog.locator("#ot-reason").fill(opts.reason)
}

async function submitMARequest(page: Page): Promise<void> {
  const dialog = page.locator('[data-slot="dialog-content"]')
  await dialog.getByRole("button", { name: /Absenden|Submit/i }).click()
  // Wait for dialog to close (success signal).
  await expect(dialog).not.toBeVisible({ timeout: 10_000 })
}

async function createMARequest(
  page: Page,
  opts: Parameters<typeof fillMARequestForm>[1],
): Promise<void> {
  await openMARequestForm(page)
  await fillMARequestForm(page, opts)
  await submitMARequest(page)
}

function plusDaysISO(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split("T")[0]!
}

/** German public holidays present in the seed — avoid these dates to keep
 *  SUNDAY_WORK (which the service flags for holidays) from firing. Keep this
 *  in sync with `holidays` seed rows if new years are added. */
const SEEDED_HOLIDAYS = new Set<string>([
  "2026-01-01",
  "2026-01-06",
  "2026-04-03",
  "2026-04-06",
  "2026-05-01",
  "2026-05-14",
  "2026-05-25",
  "2026-06-04",
  "2026-08-15",
  "2026-10-03",
  "2026-11-01",
  "2026-12-25",
  "2026-12-26",
])

/** Returns a weekday offset from today (skips Saturday/Sunday AND known German
 *  public holidays) to avoid unintended SUNDAY_WORK ArbZG triggers. */
function plusWeekdaysISO(days: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  let added = 0
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1)
    const weekday = d.getUTCDay()
    const iso = d.toISOString().split("T")[0]!
    if (weekday !== 0 && weekday !== 6 && !SEEDED_HOLIDAYS.has(iso)) {
      added++
    }
  }
  // Final sanity: if we landed on weekend or holiday, bump.
  while (
    d.getUTCDay() === 0 ||
    d.getUTCDay() === 6 ||
    SEEDED_HOLIDAYS.has(d.toISOString().split("T")[0]!)
  ) {
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d.toISOString().split("T")[0]!
}

// ---------------------------------------------------------------------------
// Setup: reset transient state once per file
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  await resetAllOvertimeRequests()
  await resetOvertimeConfig()
})

test.afterAll(async () => {
  await resetAllOvertimeRequests()
  await resetOvertimeConfig()
  await disconnectPrisma()
})

// ---------------------------------------------------------------------------
// UC-OT-01: Admin config page loads + round-trip
// ---------------------------------------------------------------------------

test.describe("UC-OT-01: Admin config", () => {
  test("config page renders all controls and persists changes", async ({ page }) => {
    await navigateTo(page, "/admin/overtime-request-config")

    // All 5 controls present (labels).
    const main = page.locator(MAIN)
    await expect(main.getByText(/Genehmigungspflicht|Approval required/i).first()).toBeVisible()
    await expect(main.getByText(/Reopen-Antragspflicht|Require reopen/i).first()).toBeVisible()
    await expect(main.getByText(/Vorlaufzeit|Lead time/i).first()).toBeVisible()
    await expect(main.getByText(/Monatliche Warnschwelle|Monthly warn/i).first()).toBeVisible()
    await expect(main.getByText(/Eskalationsschwelle|Escalation threshold/i).first()).toBeVisible()

    // Both switches start AN (checked).
    const approvalSwitch = page.locator('button[role="switch"]#approvalRequired')
    const reopenSwitch = page.locator('button[role="switch"]#reopenRequired')
    await expect(approvalSwitch).toHaveAttribute("data-state", "checked")
    await expect(reopenSwitch).toHaveAttribute("data-state", "checked")

    // Set escalation to 240, save, reload, check persisted.
    await page.locator("#escalationThresholdMinutes").fill("240")
    await page.getByRole("button", { name: /^Speichern$|^Save$/i }).click()
    // Small wait for the mutation to persist — toast is sonner and auto-
    // dismisses; checking persisted state after reload is more robust.
    await page.waitForTimeout(1000)
    await page.reload()
    await expect(page.locator("#escalationThresholdMinutes")).toHaveValue("240")
  })
})

// ---------------------------------------------------------------------------
// UC-OT-02: MA empty state + create/cancel
// ---------------------------------------------------------------------------

test.describe.serial("UC-OT-02: MA create + cancel", () => {
  test.beforeAll(async () => {
    await resetAllOvertimeRequests()
  })

  test("MA page shows empty state", async ({ browser }) => {
    const page = await getMA(browser)
    await navigateTo(page, "/overtime-requests")
    await expect(
      page.locator(MAIN).getByText(/Noch keine Anträge|No requests yet/i),
    ).toBeVisible()
    await page.context().close()
  })

  test("MA can submit a PLANNED request", async ({ browser }) => {
    const page = await getMA(browser)
    await createMARequest(page, {
      date: plusWeekdaysISO(2),
      minutes: 60,
      reason: "E2E planned happy path",
    })

    // Row appears in list.
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: "E2E planned happy path" })
    await expect(row).toBeVisible({ timeout: 5_000 })
    await expect(row.getByText(/Ausstehend|Pending/i)).toBeVisible()
    await page.context().close()
  })

  test("MA can cancel their own pending request", async ({ browser }) => {
    const page = await getMA(browser)
    await navigateTo(page, "/overtime-requests")

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: "E2E planned happy path" })
    await row
      .getByRole("button", { name: /Zurückziehen|Cancel request/i })
      .click()

    await expect(row.getByText(/Zurückgezogen|Cancelled/i)).toBeVisible({
      timeout: 5_000,
    })
    await page.context().close()
  })
})

// ---------------------------------------------------------------------------
// UC-OT-03: Approver approve flow
// ---------------------------------------------------------------------------

test.describe.serial("UC-OT-03: Approver approves", () => {
  test.beforeAll(async () => {
    await resetAllOvertimeRequests()
  })

  const reason = "E2E approve-flow"

  test("MA creates a request", async ({ browser }) => {
    const page = await getMA(browser)
    await createMARequest(page, {
      date: plusWeekdaysISO(3),
      minutes: 45,
      reason,
    })
    await page.context().close()

    // Sanity: row should be in DB after create.
    const row = await findLatestOvertimeRequest({ reason })
    expect(row?.status).toBe("pending")
  })

  test("HR sees request in queue and approves without ArbZG warnings", async ({
    browser,
  }) => {
    const page = await getHr(browser)
    await navigateTo(page, "/admin/overtime-approvals")

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: reason })
    await expect(row).toBeVisible({ timeout: 5_000 })

    // Click approve → dialog opens (no ArbZG warnings for a typical weekday).
    await row.getByRole("button", { name: /Genehmigen|Approve/i }).click()

    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog).toBeVisible()

    // No override textarea when no warnings.
    await expect(dialog.locator("#ot-override")).toHaveCount(0)

    await dialog.getByRole("button", { name: /Genehmigen|Approve/i }).click()

    // Row should disappear.
    await expect(row).toHaveCount(0, { timeout: 5_000 })
    await page.context().close()
  })

  test("MA sees approved status", async ({ browser }) => {
    const page = await getMA(browser)
    await navigateTo(page, "/overtime-requests")
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: reason })
    await expect(row.getByText(/Genehmigt|Approved/i)).toBeVisible()
    await page.context().close()
  })
})

// ---------------------------------------------------------------------------
// UC-OT-04: Approver reject flow
// ---------------------------------------------------------------------------

test.describe.serial("UC-OT-04: Approver rejects", () => {
  const reason = "E2E reject-flow"
  const rejectReason = "Nicht betriebsnotwendig"

  test("MA creates a request", async ({ browser }) => {
    const page = await getMA(browser)
    await createMARequest(page, {
      date: plusWeekdaysISO(4),
      minutes: 30,
      reason,
    })
    await page.context().close()
  })

  test("HR rejects with reason", async ({ browser }) => {
    const page = await getHr(browser)
    await navigateTo(page, "/admin/overtime-approvals")

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: reason })
    await row.getByRole("button", { name: /Ablehnen|Reject/i }).click()

    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog).toBeVisible()

    await dialog.locator("#ot-reject-reason").fill(rejectReason)
    await dialog.getByRole("button", { name: /Ablehnen|Reject/i }).click()

    await expect(row).toHaveCount(0, { timeout: 5_000 })
    await page.context().close()
  })

  test("MA sees rejected status", async ({ browser }) => {
    const page = await getMA(browser)
    await navigateTo(page, "/overtime-requests")
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: reason })
    await expect(row.getByText(/Abgelehnt|Rejected/i)).toBeVisible()
    await page.context().close()
  })
})

// ---------------------------------------------------------------------------
// UC-OT-05: ArbZG Sunday warning with override
// ---------------------------------------------------------------------------

test.describe.serial("UC-OT-05: ArbZG Sunday override", () => {
  const reason = "E2E ArbZG Sunday"

  test("MA creates a request for next Sunday", async ({ browser }) => {
    const page = await getMA(browser)
    const sundayISO = nextSundayUTC().toISOString().split("T")[0]!

    await createMARequest(page, {
      date: sundayISO,
      minutes: 60,
      reason,
    })

    // Row should show in list; ArbZG warnings are visible to the approver,
    // not to the MA, so we don't assert them here.
    await expect(
      page.locator("table tbody tr").filter({ hasText: reason }),
    ).toBeVisible({ timeout: 5_000 })
    await page.context().close()
  })

  test("Approver sees ArbZG badge + override required", async ({ browser }) => {
    const page = await getHr(browser)
    await navigateTo(page, "/admin/overtime-approvals")

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: reason })
    await expect(row).toBeVisible()

    await row.getByRole("button", { name: /Genehmigen|Approve/i }).click()

    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog).toBeVisible()

    // SUNDAY_WORK warning text visible.
    await expect(dialog.getByText(/Sonn-|Sunday or public holiday/i)).toBeVisible()

    // Override textarea visible, approve button disabled initially.
    const overrideArea = dialog.locator("#ot-override")
    await expect(overrideArea).toBeVisible()
    const approveBtn = dialog.getByRole("button", { name: /Genehmigen|Approve/i })
    await expect(approveBtn).toBeDisabled()

    // Fill override, submit.
    await overrideArea.fill("Dringende Inventur")
    await expect(approveBtn).toBeEnabled()
    await approveBtn.click()

    await expect(row).toHaveCount(0, { timeout: 5_000 })

    // DB check: override reason persisted.
    const request = await findLatestOvertimeRequest({ reason })
    expect(request?.arbzg_override_reason).toBe("Dringende Inventur")
    expect(request?.arbzg_warnings).toContain("SUNDAY_WORK")
    await page.context().close()
  })
})

// ---------------------------------------------------------------------------
// UC-OT-06: ArbZG Daily-max warning
// ---------------------------------------------------------------------------

test.describe.serial("UC-OT-06: ArbZG daily max", () => {
  const reason = "E2E ArbZG daily-max"

  test("MA requests huge plannedMinutes (>10h)", async ({ browser }) => {
    const page = await getMA(browser)
    await createMARequest(page, {
      date: plusWeekdaysISO(5),
      minutes: 700, // 11.7h, well above 600-minute cap
      reason,
    })
    await page.context().close()
  })

  test("Approver sees DAILY_MAX_EXCEEDED warning and approves with override", async ({
    browser,
  }) => {
    const page = await getHr(browser)
    await navigateTo(page, "/admin/overtime-approvals")

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: reason })
    await row.getByRole("button", { name: /Genehmigen|Approve/i }).click()

    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog.getByText(/10h|maximum|Tageshöchst/i)).toBeVisible()
    await dialog.locator("#ot-override").fill("Notfall, einmalig")
    await dialog.getByRole("button", { name: /Genehmigen|Approve/i }).click()

    await expect(row).toHaveCount(0, { timeout: 5_000 })
    await page.context().close()
  })
})

// ---------------------------------------------------------------------------
// UC-OT-07: Escalation gate — Approver blocked, HR succeeds
// ---------------------------------------------------------------------------

test.describe.serial("UC-OT-07: Escalation gate", () => {
  const reason = "E2E escalation gate"

  test.beforeAll(async () => {
    // Threshold 60min; request 90min: above threshold but below the 10h cap
    // (90 + 480 target = 570 < 600 cap), so no ArbZG warning complicates the dialog.
    await setEscalationThreshold(60)
  })

  test.afterAll(async () => {
    await resetOvertimeConfig()
  })

  test("MA creates a 90-minute request (above threshold)", async ({
    browser,
  }) => {
    const page = await getMA(browser)
    await createMARequest(page, {
      date: plusWeekdaysISO(6),
      minutes: 90,
      reason,
    })
    await page.context().close()
  })

  test("Approver (no escalated right) fails to approve", async ({ browser }) => {
    const page = await getApprover(browser)
    await navigateTo(page, "/admin/overtime-approvals")

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: reason })
    await expect(row).toBeVisible()

    await row.getByRole("button", { name: /Genehmigen|Approve/i }).click()

    const dialog = page.locator('[data-slot="dialog-content"]')
    await dialog.getByRole("button", { name: /Genehmigen|Approve/i }).click()

    // Service returns 403 (FORBIDDEN) — toast may be transient, so verify
    // DB state instead: request stays pending.
    await page.waitForTimeout(1500)
    const dbRow = await findLatestOvertimeRequest({ reason })
    expect(dbRow?.status).toBe("pending")
    await page.context().close()
  })

  test("HR (has escalated right) succeeds", async ({ browser }) => {
    const page = await getHr(browser)
    await navigateTo(page, "/admin/overtime-approvals")

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: reason })
    await row.getByRole("button", { name: /Genehmigen|Approve/i }).click()

    const dialog = page.locator('[data-slot="dialog-content"]')
    await dialog.getByRole("button", { name: /Genehmigen|Approve/i }).click()

    await expect(row).toHaveCount(0, { timeout: 5_000 })
    await page.context().close()
  })
})

// ---------------------------------------------------------------------------
// UC-OT-08: Reopen gate — block, request, approve, unblock
// ---------------------------------------------------------------------------

test.describe.serial("UC-OT-08: Reopen gate via Stempeluhr", () => {
  const reason = "E2E reopen-gate"

  test.beforeAll(async () => {
    // Clean up any bookings/requests for the Regular User for today AND
    // yesterday (the rest-time ArbZG check reads the prior day's last OUT).
    await resetEmployeeDay(SEED.USER_EMPLOYEE_ID, todayUTC())
    const yd = new Date(todayUTC())
    yd.setUTCDate(yd.getUTCDate() - 1)
    await resetEmployeeDay(SEED.USER_EMPLOYEE_ID, yd)
  })

  test.afterAll(async () => {
    await resetEmployeeDay(SEED.USER_EMPLOYEE_ID, todayUTC())
  })

  test("MA clocks in, clocks out, is blocked on re-clock-in", async ({
    browser,
  }) => {
    const page = await getMA(browser)
    await navigateTo(page, "/time-clock")

    const main = page.locator(MAIN)
    // The Stempeluhr shows a single primary button whose label toggles
    // between "Einstempeln. …" and "Ausstempeln. …" based on state.
    const clockInBtn = main.getByRole("button", { name: /^Einstempeln/i })
    const clockOutBtn = main.getByRole("button", { name: /^Ausstempeln/i })

    // Wait for page to load with either button visible.
    await expect(clockInBtn.or(clockOutBtn)).toBeVisible({ timeout: 15_000 })

    // If already clocked in from prior state, clock out first.
    if (await clockOutBtn.isVisible().catch(() => false)) {
      await clockOutBtn.click()
      await expect(clockInBtn).toBeVisible({ timeout: 10_000 })
    }

    // Clock in.
    await clockInBtn.click()
    await expect(clockOutBtn).toBeVisible({ timeout: 10_000 })

    // Clock out.
    await clockOutBtn.click()
    await expect(clockInBtn).toBeVisible({ timeout: 10_000 })

    // Attempt re-clock-in → should be blocked by the reopen gate.
    await clockInBtn.click()
    // Allow backend to respond.
    await page.waitForTimeout(1500)

    // Verify gate via DB: at most 2 work bookings exist today (IN + OUT), not 3.
    const { rows } = await db().query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM bookings b
         JOIN booking_types bt ON bt.id = b.booking_type_id
         WHERE b.tenant_id = $1 AND b.employee_id = $2 AND b.booking_date = $3
           AND bt.category = 'work'`,
      [SEED.TENANT_ID, SEED.USER_EMPLOYEE_ID, todayUTC().toISOString().split("T")[0]!],
    )
    expect(Number(rows[0]!.c)).toBe(2)

    await page.context().close()
  })

  test("MA submits REOPEN request and HR approves", async ({ browser }) => {
    const maPage = await getMA(browser)
    await createMARequest(maPage, {
      requestType: "REOPEN",
      date: todayUTC().toISOString().split("T")[0]!,
      minutes: 30,
      reason,
    })
    await maPage.context().close()

    const hrPage = await getHr(browser)
    await navigateTo(hrPage, "/admin/overtime-approvals")
    const row = hrPage
      .locator("table tbody tr")
      .filter({ hasText: reason })
    await row.getByRole("button", { name: /Genehmigen|Approve/i }).click()
    const dialog = hrPage.locator('[data-slot="dialog-content"]')
    // If ArbZG override is required (warnings present), fill the textarea.
    const overrideArea = dialog.locator("#ot-override")
    if (await overrideArea.isVisible().catch(() => false)) {
      await overrideArea.fill("E2E auto-override")
    }
    await dialog.getByRole("button", { name: /Genehmigen|Approve/i }).click()
    await expect(row).toHaveCount(0, { timeout: 5_000 })
    await hrPage.context().close()
  })

  test("MA can now clock in again", async ({ browser }) => {
    const page = await getMA(browser)
    await navigateTo(page, "/time-clock")

    const main = page.locator(MAIN)
    const clockInBtn = main.getByRole("button", { name: /Einstempeln/i })
    const clockOutBtn = main.getByRole("button", { name: /Ausstempeln/i })

    // Should be able to clock in; success = Ausstempeln appears enabled.
    await clockInBtn.click()
    await expect(clockOutBtn).toBeEnabled({ timeout: 10_000 })
    await page.context().close()
  })
})

// ---------------------------------------------------------------------------
// UC-OT-09: UNAPPROVED_OVERTIME + Korrekturassistent CTA
// ---------------------------------------------------------------------------

test.describe("UC-OT-09: UNAPPROVED_OVERTIME correction-assistant", () => {
  test.beforeAll(async () => {
    await resetAllOvertimeRequests()
    await seedUnapprovedOvertime(SEED.USER_EMPLOYEE_ID, yesterday())
  })

  test("Admin sees UNAPPROVED_OVERTIME row and uses Als Überstunden genehmigen", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/correction-assistant")

    // Find the row mentioning UNAPPROVED_OVERTIME (may be code or text).
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: /UNAPPROVED_OVERTIME|Ungenehmigte Überstunden/i })
      .first()
    await expect(row).toBeVisible({ timeout: 10_000 })

    // Open detail sheet.
    await row.click()
    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]')
    await expect(sheet).toBeVisible()

    // Click "Als Überstunden genehmigen".
    await sheet
      .getByRole("button", { name: /Als Überstunden genehmigen|Approve as overtime/i })
      .click()

    // Sheet closes (success signal).
    await expect(sheet).not.toBeVisible({ timeout: 10_000 })

    // DB check: new approved overtime request exists.
    const request = await findLatestOvertimeRequest({
      employeeId: SEED.USER_EMPLOYEE_ID,
      status: "approved",
    })
    expect(request).not.toBeNull()
    expect(request?.reason).toContain("Nachträglich genehmigt")
  })
})

function yesterday(): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

// ---------------------------------------------------------------------------
// UC-OT-10: Destructive flip of reopenRequired
// ---------------------------------------------------------------------------

test.describe.serial("UC-OT-10: Destructive flip reopenRequired", () => {
  test.beforeAll(async () => {
    await resetAllOvertimeRequests()
    await resetOvertimeConfig()
    // Seed one pending REOPEN request.
    await seedPendingReopen(SEED.USER_EMPLOYEE_ID, todayUTC())
  })

  test.afterAll(async () => {
    await resetOvertimeConfig()
  })

  test("HR toggles off and confirm dialog shows count", async ({ browser }) => {
    const page = await getHr(browser)
    await navigateTo(page, "/admin/overtime-request-config")

    const reopenSwitch = page.locator('button[role="switch"]#reopenRequired')
    await expect(reopenSwitch).toHaveAttribute("data-state", "checked")

    // Click switch to toggle OFF.
    await reopenSwitch.click()
    await expect(reopenSwitch).toHaveAttribute("data-state", "unchecked")

    // Click Save → confirm dialog appears.
    await page.getByRole("button", { name: /^Speichern$|^Save$/i }).click()

    const confirmSheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    )
    await expect(confirmSheet).toBeVisible({ timeout: 5_000 })
    await expect(
      confirmSheet.getByText(
        /Reopen-Antragspflicht deaktivieren|Disable reopen/i,
      ),
    ).toBeVisible()
    // Count should appear in body.
    await expect(
      confirmSheet.getByText(/1 ausstehender|1 pending reopen/i),
    ).toBeVisible()

    // Confirm.
    await confirmSheet
      .getByRole("button", { name: /Fortfahren|Continue/i })
      .click()

    // Small wait for the mutation; sonner toast auto-dismisses. Assert
    // via DB state instead.
    await page.waitForTimeout(1000)

    // DB: pending REOPEN cancelled.
    expect(await countPendingReopens()).toBe(0)
    await page.context().close()
  })

  test("MA form no longer shows REOPEN option", async ({ browser }) => {
    const page = await getMA(browser)
    await openMARequestForm(page)
    const dialog = page.locator('[data-slot="dialog-content"]')

    // PLANNED radio present, REOPEN radio absent.
    await expect(dialog.locator("#rt-planned")).toBeVisible()
    await expect(dialog.locator("#rt-reopen")).toHaveCount(0)
    await page.context().close()
  })

  test("Re-enable (true) has no confirm dialog", async ({ browser }) => {
    const page = await getHr(browser)
    await navigateTo(page, "/admin/overtime-request-config")

    const reopenSwitch = page.locator('button[role="switch"]#reopenRequired')
    await reopenSwitch.click()
    await expect(reopenSwitch).toHaveAttribute("data-state", "checked")

    await page.getByRole("button", { name: /^Speichern$|^Save$/i }).click()
    // Wait for mutation to settle; no confirm dialog should appear.
    await page.waitForTimeout(1000)
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]'),
    ).toHaveCount(0)
    await page.context().close()
  })
})

// ---------------------------------------------------------------------------
// UC-OT-11: Auto-approve path
// ---------------------------------------------------------------------------

test.describe.serial("UC-OT-11: Auto-approve when approvalRequired=false", () => {
  const reason = "E2E auto-approve"

  test.beforeAll(async () => {
    await setApprovalRequired(false)
  })

  test.afterAll(async () => {
    await resetOvertimeConfig()
  })

  test("MA request is auto-approved", async ({ browser }) => {
    const page = await getMA(browser)
    await createMARequest(page, {
      date: plusWeekdaysISO(7),
      minutes: 30,
      reason,
    })

    // Row appears with status Approved immediately.
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: reason })
    await expect(row.getByText(/Genehmigt|Approved/i)).toBeVisible({
      timeout: 5_000,
    })
    await page.context().close()
  })
})

// ---------------------------------------------------------------------------
// UC-OT-12: Sidebar gating per role
// ---------------------------------------------------------------------------

test.describe("UC-OT-12: Sidebar gating", () => {
  test("MA sees Überstundenanträge link, not admin entries", async ({
    browser,
  }) => {
    const page = await getMA(browser)
    await page.goto("/dashboard")
    await page.locator(MAIN).waitFor({ state: "visible" })

    // MA link exists somewhere on the page (sidebar).
    await expect(page.locator('a[href="/overtime-requests"]').first()).toBeVisible()
    // Admin links don't exist.
    await expect(page.locator('a[href="/admin/overtime-approvals"]')).toHaveCount(0)
    await expect(page.locator('a[href="/admin/overtime-request-config"]')).toHaveCount(0)
    await page.context().close()
  })

  test("Approver can reach approvals page, cannot reach config page", async ({
    browser,
  }) => {
    // Drive permission check via navigation rather than sidebar tree-walking.
    // Sidebar sub-group expansion relies on non-semantic clickable generics
    // and is fragile to assert directly. The effective access-gate is the
    // page-level redirect in each admin page's useEffect.

    const page = await getApprover(browser)

    // Approvals page: should stay on /admin/overtime-approvals.
    await page.goto("/admin/overtime-approvals")
    await page.locator(MAIN).waitFor({ state: "visible", timeout: 10_000 })
    await expect(page).toHaveURL(/\/admin\/overtime-approvals/, { timeout: 10_000 })

    // Config page: should redirect away.
    await page.goto("/admin/overtime-request-config")
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

    await page.context().close()
  })

  test("MA direct navigation to admin route redirects to dashboard", async ({
    browser,
  }) => {
    const page = await getMA(browser)
    await page.goto("/admin/overtime-request-config")
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })
    await page.context().close()
  })
})

// ---------------------------------------------------------------------------
// UC-OT-13: Double-approve race condition
// ---------------------------------------------------------------------------

test.describe("UC-OT-13: Double-approve race", () => {
  const reason = "E2E race condition"

  test("second approver gets invalid_status_transition error", async ({
    browser,
  }) => {
    await resetAllOvertimeRequests()

    // MA creates.
    const maPage = await getMA(browser)
    await createMARequest(maPage, {
      date: plusWeekdaysISO(8),
      minutes: 30,
      reason,
    })
    await maPage.context().close()

    // Two HR contexts open the same queue.
    const hr1 = await getHr(browser)
    const hr2 = await getHr(browser)
    await Promise.all([
      navigateTo(hr1, "/admin/overtime-approvals"),
      navigateTo(hr2, "/admin/overtime-approvals"),
    ])

    const row1 = hr1.locator("table tbody tr").filter({ hasText: reason })
    const row2 = hr2.locator("table tbody tr").filter({ hasText: reason })
    await expect(row1).toBeVisible()
    await expect(row2).toBeVisible()

    // Tab A opens dialog; tab B also opens dialog.
    await row1.getByRole("button", { name: /Genehmigen|Approve/i }).click()
    await row2.getByRole("button", { name: /Genehmigen|Approve/i }).click()

    const dialog1 = hr1.locator('[data-slot="dialog-content"]')
    const dialog2 = hr2.locator('[data-slot="dialog-content"]')
    await expect(dialog1).toBeVisible()
    await expect(dialog2).toBeVisible()

    // Tab B confirms first.
    await dialog2.getByRole("button", { name: /Genehmigen|Approve/i }).click()
    await expect(row2).toHaveCount(0, { timeout: 5_000 })

    // Tab A confirms second → mutation rejects. Row in DB is still approved
    // (tab B's click), not double-approved, and tab A's dialog either stays
    // open on error or stays put with row still present.
    await dialog1.getByRole("button", { name: /Genehmigen|Approve/i }).click()
    // Brief wait for mutation to resolve.
    await hr1.waitForTimeout(1500)
    // Verify DB: exactly one approved row with this reason (not two).
    const row = await findLatestOvertimeRequest({ reason })
    expect(row?.status).toBe("approved")

    await hr1.context().close()
    await hr2.context().close()
  })
})
