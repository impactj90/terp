/**
 * Phase 6: Verwaltung & Genehmigungen (Admin View)
 *
 * Tests UC-039 through UC-045 against the real database.
 * Requires local Supabase running with seed data.
 *
 * Seed data used:
 *   - Employees: Admin (..0011), User (..0012), Maria (..0013), Thomas (..0014), Anna (..0015)
 *   - Absence days: pending sick (User ..15004), pending vacation (Maria ..15005/15006, Thomas ..15008)
 *   - Daily values: January 2026 with errors (Admin ..3013, User ..4007)
 *   - Monthly values: January 2026 open for all employees
 *
 * @see docs/use-cases/06-verwaltung.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

// --- Seed Constants ---
const EMPLOYEE_ADMIN = "00000000-0000-0000-0000-000000000011"
const EMPLOYEE_USER = "00000000-0000-0000-0000-000000000012"
const EMPLOYEE_MARIA = "00000000-0000-0000-0000-000000000013"
const EMPLOYEE_THOMAS = "00000000-0000-0000-0000-000000000014"
const EMPLOYEE_ANNA = "00000000-0000-0000-0000-000000000015"

// Seed absence IDs
const ABSENCE_USER_PENDING_SICK = "00000000-0000-0000-0000-000000015004"
const ABSENCE_MARIA_PENDING_VAC_1 = "00000000-0000-0000-0000-000000015005"
const ABSENCE_MARIA_PENDING_VAC_2 = "00000000-0000-0000-0000-000000015006"
const ABSENCE_THOMAS_PENDING_VAC = "00000000-0000-0000-0000-000000015008"

// Seed daily value IDs with errors
const DV_ADMIN_MISSING_BREAK = "00000000-0000-0000-0000-000000003013" // has_error=true, MISSING_BREAK
const DV_USER_MISSING_CLOCK_OUT = "00000000-0000-0000-0000-000000004007" // has_error=true, MISSING_CLOCK_OUT

// Seed monthly value IDs (January 2026, open)
const MV_ADMIN_JAN = "00000000-0000-0000-0000-000000005001"
const MV_USER_JAN = "00000000-0000-0000-0000-000000005003"
const MV_MARIA_JAN = "00000000-0000-0000-0000-000000005005"
const MV_THOMAS_JAN = "00000000-0000-0000-0000-000000005007"
const MV_ANNA_JAN = "00000000-0000-0000-0000-000000005009"

describe("Phase 6: Verwaltung & Genehmigungen", () => {
  let caller: Caller

  // Track created record IDs for cleanup
  const created = {
    absenceIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    caller = await createAdminCaller()

    // Ensure pending absences are in the expected state for approval tests.
    // Reset any previously-approved/rejected absences back to pending.
    await prisma.absenceDay
      .updateMany({
        where: {
          id: {
            in: [
              ABSENCE_USER_PENDING_SICK,
              ABSENCE_MARIA_PENDING_VAC_1,
              ABSENCE_MARIA_PENDING_VAC_2,
              ABSENCE_THOMAS_PENDING_VAC,
            ],
          },
        },
        data: {
          status: "pending",
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
        },
      })
      .catch(() => {})

    // Ensure monthly values for Jan 2026 are open
    await prisma.monthlyValue
      .updateMany({
        where: {
          id: {
            in: [
              MV_ADMIN_JAN,
              MV_USER_JAN,
              MV_MARIA_JAN,
              MV_THOMAS_JAN,
              MV_ANNA_JAN,
            ],
          },
        },
        data: {
          isClosed: false,
          closedAt: null,
          closedBy: null,
          reopenedAt: null,
          reopenedBy: null,
        },
      })
      .catch(() => {})

    // Clean up any leftover E2E test absences
    await prisma.absenceDay
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          notes: { startsWith: "E2E" },
        },
      })
      .catch(() => {})
  })

  afterAll(async () => {
    // Clean up test-created absences
    if (created.absenceIds.length > 0) {
      await prisma.absenceDay
        .deleteMany({ where: { id: { in: created.absenceIds } } })
        .catch(() => {})
    }

    // Reset pending absences back to original state
    await prisma.absenceDay
      .updateMany({
        where: {
          id: {
            in: [
              ABSENCE_USER_PENDING_SICK,
              ABSENCE_MARIA_PENDING_VAC_1,
              ABSENCE_MARIA_PENDING_VAC_2,
              ABSENCE_THOMAS_PENDING_VAC,
            ],
          },
        },
        data: {
          status: "pending",
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
        },
      })
      .catch(() => {})

    // Reopen monthly values
    await prisma.monthlyValue
      .updateMany({
        where: {
          id: {
            in: [
              MV_ADMIN_JAN,
              MV_USER_JAN,
              MV_MARIA_JAN,
              MV_THOMAS_JAN,
              MV_ANNA_JAN,
            ],
          },
        },
        data: {
          isClosed: false,
          closedAt: null,
          closedBy: null,
          reopenedAt: null,
          reopenedBy: null,
        },
      })
      .catch(() => {})
  })

  // =========================================================
  // UC-039: Abwesenheitsantrag genehmigen/ablehnen
  // =========================================================
  describe("UC-039: Abwesenheitsantrag genehmigen/ablehnen", () => {
    it("should list pending absences", async () => {
      const result = await caller.absences.list({
        status: "pending",
      })

      expect(result.items).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(1)

      // At least one of our seed pending absences should be there
      const pendingIds = result.items.map((a: any) => a.id)
      // Maria's pending vacation should be visible
      expect(
        pendingIds.includes(ABSENCE_MARIA_PENDING_VAC_1) ||
          pendingIds.includes(ABSENCE_THOMAS_PENDING_VAC)
      ).toBe(true)
    })

    it("should approve a pending absence", async () => {
      const result = await caller.absences.approve({
        id: ABSENCE_MARIA_PENDING_VAC_1,
      })

      expect(result.status).toBe("approved")
      expect(result.approvedBy).toBe(SEED.ADMIN_USER_ID)
      expect(result.approvedAt).toBeDefined()
      expect(result.id).toBe(ABSENCE_MARIA_PENDING_VAC_1)
    })

    it("should not approve an already-approved absence", async () => {
      await expect(
        caller.absences.approve({ id: ABSENCE_MARIA_PENDING_VAC_1 })
      ).rejects.toThrow()
    })

    it("should reject a pending absence with reason", async () => {
      const result = await caller.absences.reject({
        id: ABSENCE_THOMAS_PENDING_VAC,
        reason: "E2E Test: staffing conflict",
      })

      expect(result.status).toBe("rejected")
      expect(result.rejectionReason).toBe("E2E Test: staffing conflict")
      expect(result.id).toBe(ABSENCE_THOMAS_PENDING_VAC)
    })

    it("should not reject an already-rejected absence", async () => {
      await expect(
        caller.absences.reject({
          id: ABSENCE_THOMAS_PENDING_VAC,
          reason: "duplicate",
        })
      ).rejects.toThrow()
    })

    it("approved absence should be visible for the employee", async () => {
      const absences = await caller.absences.forEmployee({
        employeeId: EMPLOYEE_MARIA,
        status: "approved",
      })

      const found = absences.find(
        (a: any) => a.id === ABSENCE_MARIA_PENDING_VAC_1
      )
      expect(found).toBeDefined()
      expect(found!.status).toBe("approved")
    })

    it("should cancel an approved absence", async () => {
      // First approve the second Maria absence
      await caller.absences.approve({
        id: ABSENCE_MARIA_PENDING_VAC_2,
      })

      // Then cancel it
      const result = await caller.absences.cancel({
        id: ABSENCE_MARIA_PENDING_VAC_2,
      })

      expect(result.status).toBe("cancelled")
      expect(result.id).toBe(ABSENCE_MARIA_PENDING_VAC_2)
    })

    it("rejected absence should show rejection reason", async () => {
      const absences = await caller.absences.forEmployee({
        employeeId: EMPLOYEE_THOMAS,
      })

      const rejected = absences.find(
        (a: any) => a.id === ABSENCE_THOMAS_PENDING_VAC
      )
      expect(rejected).toBeDefined()
      expect(rejected!.status).toBe("rejected")
      expect(rejected!.rejectionReason).toBe("E2E Test: staffing conflict")
    })
  })

  // =========================================================
  // UC-040: Tageswerte in Evaluations-Ansicht pruefen
  // =========================================================
  describe("UC-040: Tageswerte in Evaluations-Ansicht pruefen", () => {
    it("should list daily values for admin evaluations view", async () => {
      const result = await caller.evaluations.dailyValues({
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
      })

      expect(result.items).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThan(0)

      // Check that items have the expected shape
      const first = result.items[0]!
      expect(first.id).toBeDefined()
      expect(first.employeeId).toBeDefined()
      expect(first.targetMinutes).toBeTypeOf("number")
      expect(first.grossMinutes).toBeTypeOf("number")
      expect(first.netMinutes).toBeTypeOf("number")
      expect(first.overtimeMinutes).toBeTypeOf("number")
    })

    it("should filter daily values by employee", async () => {
      const result = await caller.evaluations.dailyValues({
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
        employeeId: EMPLOYEE_ADMIN,
      })

      expect(result.items.length).toBeGreaterThan(0)
      // All items should be for the admin employee
      result.items.forEach((item: any) => {
        expect(item.employeeId).toBe(EMPLOYEE_ADMIN)
      })
    })

    it("should filter daily values by hasErrors", async () => {
      const result = await caller.evaluations.dailyValues({
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
        hasErrors: true,
      })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      result.items.forEach((item: any) => {
        expect(item.hasErrors).toBe(true)
      })
    })

    it("should return daily values for a specific employee month via dailyValues.list", async () => {
      const values = await caller.dailyValues.list({
        employeeId: EMPLOYEE_ADMIN,
        year: 2026,
        month: 1,
      })

      expect(values).toBeInstanceOf(Array)
      expect(values.length).toBeGreaterThanOrEqual(10) // Admin has 16 working days

      // Check shape
      const first = values[0]!
      expect(first.grossTime).toBeTypeOf("number")
      expect(first.netTime).toBeTypeOf("number")
      expect(first.targetTime).toBeTypeOf("number")
      expect(first.overtime).toBeTypeOf("number")
      expect(first.breakTime).toBeTypeOf("number")
    })

    it("should include error codes on error days", async () => {
      const values = await caller.dailyValues.list({
        employeeId: EMPLOYEE_ADMIN,
        year: 2026,
        month: 1,
      })

      const errorDay = values.find((v: any) => v.hasError === true)
      expect(errorDay).toBeDefined()
      expect(errorDay!.errorCodes).toBeInstanceOf(Array)
      expect(errorDay!.errorCodes.length).toBeGreaterThan(0)
    })

    it("should provide listAll with pagination", async () => {
      const result = await caller.dailyValues.listAll({
        pageSize: 5,
        page: 1,
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
      })

      expect(result.items).toBeInstanceOf(Array)
      expect(result.items.length).toBeLessThanOrEqual(5)
      expect(result.total).toBeGreaterThan(5) // We have ~48+ daily values
    })
  })

  // =========================================================
  // UC-041: Korrektur-Assistent nutzen
  // =========================================================
  describe("UC-041: Korrektur-Assistent nutzen", () => {
    it("should list correction messages with auto-seeding", async () => {
      const result = await caller.correctionAssistant.listMessages()

      expect(result.data).toBeInstanceOf(Array)
      expect(result.data.length).toBeGreaterThan(0)

      // Verify shape
      const first = result.data[0]!
      expect(first.code).toBeDefined()
      expect(first.defaultText).toBeDefined()
      expect(first.effectiveText).toBeDefined()
      expect(first.severity).toBeDefined()
    })

    it("should filter correction messages by severity", async () => {
      const errors = await caller.correctionAssistant.listMessages({
        severity: "error",
      })
      const hints = await caller.correctionAssistant.listMessages({
        severity: "hint",
      })

      expect(errors.data.length).toBeGreaterThan(0)
      expect(hints.data.length).toBeGreaterThan(0)

      errors.data.forEach((m: any) => expect(m.severity).toBe("error"))
      hints.data.forEach((m: any) => expect(m.severity).toBe("hint"))
    })

    it("should update a correction message with custom text", async () => {
      const messages = await caller.correctionAssistant.listMessages({
        severity: "error",
      })
      const msgId = messages.data[0]!.id

      const updated = await caller.correctionAssistant.updateMessage({
        id: msgId,
        customText: "E2E Custom correction text",
      })

      expect(updated.customText).toBe("E2E Custom correction text")
      expect(updated.effectiveText).toBe("E2E Custom correction text")

      // Reset custom text
      await caller.correctionAssistant.updateMessage({
        id: msgId,
        customText: null,
      })
    })

    it("should list correction assistant items (daily values with errors)", async () => {
      const result = await caller.correctionAssistant.listItems({
        from: "2026-01-01",
        to: "2026-01-31",
      })

      expect(result.data).toBeInstanceOf(Array)
      expect(result.meta).toBeDefined()
      expect(result.meta.total).toBeGreaterThanOrEqual(1)

      // Admin has MISSING_BREAK, User has MISSING_CLOCK_OUT
      const item = result.data[0]!
      expect(item.dailyValueId).toBeDefined()
      expect(item.employeeId).toBeDefined()
      expect(item.employeeName).toBeDefined()
      expect(item.valueDate).toBeDefined()
      expect(item.errors).toBeInstanceOf(Array)
      expect(item.errors.length).toBeGreaterThan(0)
      expect(item.errors[0]!.code).toBeDefined()
      expect(item.errors[0]!.errorType).toBeDefined()
    })

    it("should filter correction items by employee", async () => {
      const result = await caller.correctionAssistant.listItems({
        from: "2026-01-01",
        to: "2026-01-31",
        employeeId: EMPLOYEE_USER,
      })

      expect(result.data.length).toBeGreaterThanOrEqual(1)
      result.data.forEach((item: any) => {
        expect(item.employeeId).toBe(EMPLOYEE_USER)
      })
    })
  })

  // =========================================================
  // UC-042: Tageswerte neu berechnen
  // =========================================================
  describe("UC-042: Tageswerte neu berechnen", () => {
    it("should recalculate daily values for a date range and employee", async () => {
      const result = await caller.dailyValues.recalculate({
        from: "2026-01-02",
        to: "2026-01-02",
        employeeId: EMPLOYEE_ADMIN,
      })

      expect(result.message).toBeDefined()
      expect(result.affectedDays).toBeTypeOf("number")
    })

    it("should recalculate daily values for a broader range", async () => {
      const result = await caller.dailyValues.recalculate({
        from: "2026-01-01",
        to: "2026-01-31",
        employeeId: EMPLOYEE_ADMIN,
      })

      expect(result.affectedDays).toBeGreaterThan(0)
    })

    it("should update calculatedAt after recalculation", async () => {
      const beforeCalc = await caller.dailyValues.getById({
        id: DV_ADMIN_MISSING_BREAK,
      })
      const beforeTime = beforeCalc.calculatedAt

      await caller.dailyValues.recalculate({
        from: "2026-01-21",
        to: "2026-01-21",
        employeeId: EMPLOYEE_ADMIN,
      })

      const afterCalc = await caller.dailyValues.getById({
        id: DV_ADMIN_MISSING_BREAK,
      })

      // calculatedAt should have been updated (or set if previously null)
      if (beforeTime !== null) {
        expect(new Date(afterCalc.calculatedAt!).getTime()).toBeGreaterThanOrEqual(
          new Date(beforeTime).getTime()
        )
      } else {
        expect(afterCalc.calculatedAt).not.toBeNull()
      }
    })
  })

  // =========================================================
  // UC-043: Monatswerte pruefen und Monat abschliessen
  // =========================================================
  describe("UC-043: Monatswerte pruefen und Monat abschliessen", () => {
    it("should list monthly values for January 2026", async () => {
      const result = await caller.monthlyValues.list({
        year: 2026,
        month: 1,
      })

      expect(result.items).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(3) // At least Admin, User, Maria
    })

    it("should retrieve a single monthly value showing summaries", async () => {
      const mv = await caller.monthlyValues.getById({ id: MV_ADMIN_JAN })

      expect(mv.employeeId).toBe(EMPLOYEE_ADMIN)
      expect(mv.year).toBe(2026)
      expect(mv.month).toBe(1)
      expect(mv.totalGrossTime).toBeTypeOf("number")
      expect(mv.totalNetTime).toBeTypeOf("number")
      expect(mv.totalTargetTime).toBeTypeOf("number")
      expect(mv.totalOvertime).toBeTypeOf("number")
      expect(mv.totalBreakTime).toBeTypeOf("number")
      expect(mv.flextimeStart).toBeTypeOf("number")
      expect(mv.flextimeChange).toBeTypeOf("number")
      expect(mv.flextimeEnd).toBeTypeOf("number")
      expect(mv.status).toBe("calculated") // not closed
    })

    it("should get monthly summary for employee via forEmployee", async () => {
      const summary = await caller.monthlyValues.forEmployee({
        employeeId: EMPLOYEE_ADMIN,
        year: 2026,
        month: 1,
      })

      expect(summary.employeeId).toBe(EMPLOYEE_ADMIN)
      expect(summary.year).toBe(2026)
      expect(summary.month).toBe(1)
      expect(summary.isClosed).toBe(false)
      expect(summary.totalGrossTime).toBeTypeOf("number")
      expect(summary.workDays).toBeGreaterThan(0)
    })

    it("should close a month", async () => {
      const result = await caller.monthlyValues.close({ id: MV_ADMIN_JAN })

      expect(result.status).toBe("closed")
      expect(result.closedAt).toBeDefined()
      expect(result.closedBy).toBe(SEED.ADMIN_USER_ID)

      state.closedMvId = MV_ADMIN_JAN
    })

    it("should not close an already-closed month", async () => {
      await expect(
        caller.monthlyValues.close({ id: MV_ADMIN_JAN })
      ).rejects.toThrow()
    })

    it("should close by employeeId + year + month", async () => {
      const result = await caller.monthlyValues.close({
        employeeId: EMPLOYEE_USER,
        year: 2026,
        month: 1,
      })

      expect(result.status).toBe("closed")
      expect(result.closedBy).toBe(SEED.ADMIN_USER_ID)
    })

    it("should filter monthly values by status", async () => {
      const closedResult = await caller.monthlyValues.list({
        year: 2026,
        month: 1,
        status: "closed",
      })

      expect(closedResult.items.length).toBeGreaterThanOrEqual(2)
      closedResult.items.forEach((item: any) => {
        expect(item.status).toBe("closed")
      })
    })
  })

  // =========================================================
  // UC-044: Monat wiedereroffnen
  // =========================================================
  describe("UC-044: Monat wiedereroffnen", () => {
    it("should reopen a closed month by ID", async () => {
      const result = await caller.monthlyValues.reopen({ id: MV_ADMIN_JAN })

      expect(result.status).toBe("calculated")
      expect(result.reopenedAt).toBeDefined()
      expect(result.reopenedBy).toBe(SEED.ADMIN_USER_ID)
    })

    it("should not reopen a month that is not closed", async () => {
      await expect(
        caller.monthlyValues.reopen({ id: MV_ADMIN_JAN })
      ).rejects.toThrow()
    })

    it("should reopen by employeeId + year + month", async () => {
      // MV_USER_JAN was closed in UC-043
      const result = await caller.monthlyValues.reopen({
        employeeId: EMPLOYEE_USER,
        year: 2026,
        month: 1,
      })

      expect(result.status).toBe("calculated")
      expect(result.reopenedBy).toBe(SEED.ADMIN_USER_ID)
    })

    it("reopened month should show open status in list", async () => {
      const result = await caller.monthlyValues.list({
        year: 2026,
        month: 1,
        employeeId: EMPLOYEE_ADMIN,
      })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      const adminMv = result.items.find(
        (item: any) => item.employeeId === EMPLOYEE_ADMIN
      )
      expect(adminMv).toBeDefined()
      expect(adminMv!.status).not.toBe("closed")
    })
  })

  // =========================================================
  // UC-045: Monatswerte Batch-Abschluss
  // =========================================================
  describe("UC-045: Monatswerte Batch-Abschluss", () => {
    it("should batch-close monthly values for multiple employees", async () => {
      const result = await caller.monthlyValues.closeBatch({
        year: 2026,
        month: 1,
        employeeIds: [EMPLOYEE_MARIA, EMPLOYEE_THOMAS, EMPLOYEE_ANNA],
        recalculate: false,
      })

      expect(result.closedCount).toBeGreaterThanOrEqual(3)
      expect(result.errorCount).toBeTypeOf("number")
      expect(result.skippedCount).toBeTypeOf("number")
    })

    it("should skip already-closed months in batch", async () => {
      const result = await caller.monthlyValues.closeBatch({
        year: 2026,
        month: 1,
        employeeIds: [EMPLOYEE_MARIA, EMPLOYEE_THOMAS, EMPLOYEE_ANNA],
        recalculate: false,
      })

      // All should be skipped since they were closed above
      expect(result.skippedCount).toBeGreaterThanOrEqual(3)
      expect(result.closedCount).toBe(0)
    })

    it("should batch-close all employees for a month", async () => {
      // Reopen the ones we closed for a clean slate
      await prisma.monthlyValue.updateMany({
        where: {
          id: { in: [MV_MARIA_JAN, MV_THOMAS_JAN, MV_ANNA_JAN] },
        },
        data: {
          isClosed: false,
          closedAt: null,
          closedBy: null,
        },
      })

      const result = await caller.monthlyValues.closeBatch({
        year: 2026,
        month: 1,
        recalculate: false,
      })

      // All 5 employees should be closed (or some already closed)
      expect(result.closedCount + result.skippedCount).toBeGreaterThanOrEqual(5)
    })

    it("should recalculate monthly values", async () => {
      // Reopen a month first
      await prisma.monthlyValue.updateMany({
        where: {
          id: { in: [MV_ADMIN_JAN] },
        },
        data: {
          isClosed: false,
          closedAt: null,
          closedBy: null,
        },
      })

      const result = await caller.monthlyValues.recalculate({
        year: 2026,
        month: 1,
        employeeId: EMPLOYEE_ADMIN,
      })

      expect(result.message).toBeDefined()
      expect(result.affectedEmployees).toBeGreaterThanOrEqual(1)
    })

    it("should get year overview showing all months", async () => {
      const summaries = await caller.monthlyValues.yearOverview({
        employeeId: EMPLOYEE_ADMIN,
        year: 2025,
      })

      expect(summaries).toBeInstanceOf(Array)
      expect(summaries.length).toBe(12) // All 12 months of 2025

      // All 2025 months should be closed
      summaries.forEach((s: any) => {
        expect(s.isClosed).toBe(true)
      })
    })
  })
})
