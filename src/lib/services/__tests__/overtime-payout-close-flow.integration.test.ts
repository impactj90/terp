import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as monthlyValuesService from "../monthly-values-service"
import * as overtimePayoutService from "../overtime-payout-service"
import * as overtimePayoutRepo from "../overtime-payout-repository"
import * as payrollExportService from "../payroll-export-service"
import { generateExport } from "../export-engine-service"

const HAS_DB = Boolean(process.env.DATABASE_URL)

const YEAR = 2026
const MONTH = 3
const NEXT_MONTH = 4

const createdTenantIds = new Set<string>()

function makeAudit(userId: string) {
  return {
    userId,
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  }
}

async function cleanupTenant(tenantId: string) {
  await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.payrollExport.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.exportTemplateVersion.deleteMany({
    where: { template: { tenantId } },
  }).catch(() => {})
  await prisma.exportTemplateSnapshot.deleteMany({
    where: { tenantId },
  }).catch(() => {})
  await prisma.exportTemplateSchedule.deleteMany({
    where: { tenantId },
  }).catch(() => {})
  await prisma.exportTemplate.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.tenantPayrollWage.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.overtimePayout.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.employeeOvertimePayoutOverride.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.monthlyValue.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.employee.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.tariff.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.weekPlan.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.user.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {})
}

afterEach(async () => {
  for (const tenantId of createdTenantIds) {
    await cleanupTenant(tenantId)
  }
  createdTenantIds.clear()
})

async function createTenantBase(name: string) {
  const tenantId = randomUUID()
  const userId = randomUUID()
  createdTenantIds.add(tenantId)

  await prisma.tenant.create({
    data: {
      id: tenantId,
      name,
      slug: `otp-${tenantId.slice(0, 8)}`,
      isActive: true,
    },
  })

  await prisma.user.create({
    data: {
      id: userId,
      tenantId,
      email: `${tenantId}@integration.local`,
      displayName: `${name} Admin`,
      role: "admin",
    },
  })

  return { tenantId, userId }
}

async function createTariff(
  tenantId: string,
  code: string,
  overrides: Partial<{
    overtimePayoutEnabled: boolean
    overtimePayoutThresholdMinutes: number | null
    overtimePayoutMode: string | null
    overtimePayoutPercentage: number | null
    overtimePayoutFixedMinutes: number | null
    overtimePayoutApprovalRequired: boolean
  }> = {},
) {
  return prisma.tariff.create({
    data: {
      id: randomUUID(),
      tenantId,
      code,
      name: code,
      overtimePayoutEnabled: false,
      overtimePayoutThresholdMinutes: null,
      overtimePayoutMode: null,
      overtimePayoutPercentage: null,
      overtimePayoutFixedMinutes: null,
      overtimePayoutApprovalRequired: false,
      ...overrides,
    },
  })
}

async function createEmployee(
  tenantId: string,
  tariffId: string,
  personnelNumber: string,
) {
  return prisma.employee.create({
    data: {
      id: randomUUID(),
      tenantId,
      tariffId,
      personnelNumber,
      pin: personnelNumber,
      firstName: personnelNumber,
      lastName: "Tester",
      entryDate: new Date("2025-01-01"),
      isActive: true,
    },
  })
}

async function createMonthlyValue(
  tenantId: string,
  employeeId: string,
  year: number,
  month: number,
  flextimeEnd: number,
  overrides: Partial<{
    totalTargetTime: number
    totalNetTime: number
    totalOvertime: number
    flextimeStart: number
    flextimeChange: number
    flextimeCarryover: number
    isClosed: boolean
  }> = {},
) {
  return prisma.monthlyValue.create({
    data: {
      id: randomUUID(),
      tenantId,
      employeeId,
      year,
      month,
      totalTargetTime: 9600,
      totalNetTime: 9600,
      totalOvertime: flextimeEnd,
      totalUndertime: 0,
      totalBreakTime: 0,
      flextimeStart: 0,
      flextimeChange: flextimeEnd,
      flextimeEnd,
      flextimeCarryover: flextimeEnd,
      vacationTaken: 0,
      sickDays: 0,
      otherAbsenceDays: 0,
      workDays: 20,
      daysWithErrors: 0,
      isClosed: false,
      ...overrides,
    },
  })
}

describe.skipIf(!HAS_DB).sequential(
  "overtime payout close-flow integration",
  () => {
    it("auto-approve close creates payout, reduces balance, and recalculates the next month", async () => {
      const { tenantId, userId } = await createTenantBase("OTP happy path")
      const tariff = await createTariff(tenantId, "OTP-AUTO", {
        overtimePayoutEnabled: true,
        overtimePayoutThresholdMinutes: 600,
        overtimePayoutMode: "ALL_ABOVE_THRESHOLD",
      })
      const employee = await createEmployee(tenantId, tariff.id, "OTP-HAPPY")
      await createMonthlyValue(tenantId, employee.id, YEAR, MONTH, 720)

      await monthlyValuesService.close(
        prisma,
        tenantId,
        { employeeId: employee.id, year: YEAR, month: MONTH },
        userId,
      )

      const payout = await overtimePayoutRepo.findByEmployeeMonth(
        prisma,
        tenantId,
        employee.id,
        YEAR,
        MONTH,
      )
      const currentMonth = await prisma.monthlyValue.findFirstOrThrow({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: MONTH },
      })
      const nextMonth = await prisma.monthlyValue.findFirst({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: NEXT_MONTH },
      })

      expect(payout?.status).toBe("approved")
      expect(payout?.payoutMinutes).toBe(120)
      expect(currentMonth.isClosed).toBe(true)
      expect(currentMonth.flextimeEnd).toBe(600)
      expect(currentMonth.flextimeCarryover).toBe(600)
      expect(nextMonth?.flextimeStart).toBe(600)
      expect(nextMonth?.flextimeEnd).toBe(600)
    })

    it("approval flow keeps the balance until approve and then recalculates carryover", async () => {
      const { tenantId, userId } = await createTenantBase("OTP approval")
      const tariff = await createTariff(tenantId, "OTP-PENDING", {
        overtimePayoutEnabled: true,
        overtimePayoutThresholdMinutes: 600,
        overtimePayoutMode: "ALL_ABOVE_THRESHOLD",
        overtimePayoutApprovalRequired: true,
      })
      const employee = await createEmployee(tenantId, tariff.id, "OTP-APPROVE")
      await createMonthlyValue(tenantId, employee.id, YEAR, MONTH, 720)

      await monthlyValuesService.close(
        prisma,
        tenantId,
        { employeeId: employee.id, year: YEAR, month: MONTH },
        userId,
      )

      const pendingPayout = await overtimePayoutRepo.findByEmployeeMonth(
        prisma,
        tenantId,
        employee.id,
        YEAR,
        MONTH,
      )
      const beforeApprove = await prisma.monthlyValue.findFirstOrThrow({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: MONTH },
      })
      expect(pendingPayout?.status).toBe("pending")
      expect(beforeApprove.flextimeEnd).toBe(720)

      await overtimePayoutService.approve(
        prisma,
        tenantId,
        pendingPayout!.id,
        userId,
      )

      const approvedPayout = await overtimePayoutRepo.findByEmployeeMonth(
        prisma,
        tenantId,
        employee.id,
        YEAR,
        MONTH,
      )
      const currentMonth = await prisma.monthlyValue.findFirstOrThrow({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: MONTH },
      })
      const nextMonth = await prisma.monthlyValue.findFirst({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: NEXT_MONTH },
      })

      expect(approvedPayout?.status).toBe("approved")
      expect(currentMonth.flextimeEnd).toBe(600)
      expect(nextMonth?.flextimeStart).toBe(600)
    })

    it("reject keeps the balance and leaves later months unchanged", async () => {
      const { tenantId, userId } = await createTenantBase("OTP reject")
      const tariff = await createTariff(tenantId, "OTP-REJECT", {
        overtimePayoutEnabled: true,
        overtimePayoutThresholdMinutes: 600,
        overtimePayoutMode: "ALL_ABOVE_THRESHOLD",
        overtimePayoutApprovalRequired: true,
      })
      const employee = await createEmployee(tenantId, tariff.id, "OTP-REJECT")
      await createMonthlyValue(tenantId, employee.id, YEAR, MONTH, 720)
      await createMonthlyValue(tenantId, employee.id, YEAR, NEXT_MONTH, 720, {
        flextimeStart: 720,
        flextimeChange: 0,
        flextimeCarryover: 720,
      })

      await monthlyValuesService.close(
        prisma,
        tenantId,
        { employeeId: employee.id, year: YEAR, month: MONTH },
        userId,
      )

      const pendingPayout = await overtimePayoutRepo.findByEmployeeMonth(
        prisma,
        tenantId,
        employee.id,
        YEAR,
        MONTH,
      )
      await overtimePayoutService.reject(
        prisma,
        tenantId,
        pendingPayout!.id,
        userId,
        "Testable rejection reason",
      )

      const rejectedPayout = await overtimePayoutRepo.findByEmployeeMonth(
        prisma,
        tenantId,
        employee.id,
        YEAR,
        MONTH,
      )
      const currentMonth = await prisma.monthlyValue.findFirstOrThrow({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: MONTH },
      })
      const nextMonth = await prisma.monthlyValue.findFirstOrThrow({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: NEXT_MONTH },
      })

      expect(rejectedPayout?.status).toBe("rejected")
      expect(rejectedPayout?.rejectedReason).toBe("Testable rejection reason")
      expect(currentMonth.flextimeEnd).toBe(720)
      expect(nextMonth.flextimeStart).toBe(720)
      expect(nextMonth.flextimeEnd).toBe(720)
    })

    it("closeBatch handles three employees with different tariff rules", async () => {
      const { tenantId, userId } = await createTenantBase("OTP batch")
      const allAbove = await createTariff(tenantId, "OTP-BATCH-A", {
        overtimePayoutEnabled: true,
        overtimePayoutThresholdMinutes: 600,
        overtimePayoutMode: "ALL_ABOVE_THRESHOLD",
      })
      const percentage = await createTariff(tenantId, "OTP-BATCH-B", {
        overtimePayoutEnabled: true,
        overtimePayoutThresholdMinutes: 300,
        overtimePayoutMode: "PERCENTAGE",
        overtimePayoutPercentage: 50,
      })
      const disabled = await createTariff(tenantId, "OTP-BATCH-C")

      const empA = await createEmployee(tenantId, allAbove.id, "OTP-BATCH-A")
      const empB = await createEmployee(tenantId, percentage.id, "OTP-BATCH-B")
      const empC = await createEmployee(tenantId, disabled.id, "OTP-BATCH-C")

      await createMonthlyValue(tenantId, empA.id, YEAR, MONTH, 720)
      await createMonthlyValue(tenantId, empB.id, YEAR, MONTH, 900)
      await createMonthlyValue(tenantId, empC.id, YEAR, MONTH, 480)

      const result = await monthlyValuesService.closeBatch(
        prisma,
        tenantId,
        {
          year: YEAR,
          month: MONTH,
          employeeIds: [empA.id, empB.id, empC.id],
          recalculate: false,
        },
        userId,
      )

      const payoutA = await overtimePayoutRepo.findByEmployeeMonth(prisma, tenantId, empA.id, YEAR, MONTH)
      const payoutB = await overtimePayoutRepo.findByEmployeeMonth(prisma, tenantId, empB.id, YEAR, MONTH)
      const payoutC = await overtimePayoutRepo.findByEmployeeMonth(prisma, tenantId, empC.id, YEAR, MONTH)
      const mvA = await prisma.monthlyValue.findFirstOrThrow({ where: { tenantId, employeeId: empA.id, year: YEAR, month: MONTH } })
      const mvB = await prisma.monthlyValue.findFirstOrThrow({ where: { tenantId, employeeId: empB.id, year: YEAR, month: MONTH } })
      const mvC = await prisma.monthlyValue.findFirstOrThrow({ where: { tenantId, employeeId: empC.id, year: YEAR, month: MONTH } })

      expect(result.closedCount).toBe(3)
      expect(result.errors).toHaveLength(0)
      expect(payoutA?.payoutMinutes).toBe(120)
      expect(payoutB?.payoutMinutes).toBe(300)
      expect(payoutC).toBeNull()
      expect(mvA.flextimeEnd).toBe(600)
      expect(mvB.flextimeEnd).toBe(600)
      expect(mvC.flextimeEnd).toBe(480)
    })

    it("employee override disables payout creation even when the tariff is enabled", async () => {
      const { tenantId, userId } = await createTenantBase("OTP override")
      const tariff = await createTariff(tenantId, "OTP-OVERRIDE", {
        overtimePayoutEnabled: true,
        overtimePayoutThresholdMinutes: 600,
        overtimePayoutMode: "ALL_ABOVE_THRESHOLD",
      })
      const employee = await createEmployee(tenantId, tariff.id, "OTP-OVERRIDE")
      await prisma.employeeOvertimePayoutOverride.create({
        data: {
          id: randomUUID(),
          tenantId,
          employeeId: employee.id,
          overtimePayoutEnabled: false,
          overtimePayoutMode: null,
        },
      })
      await createMonthlyValue(tenantId, employee.id, YEAR, MONTH, 720)

      await monthlyValuesService.close(
        prisma,
        tenantId,
        { employeeId: employee.id, year: YEAR, month: MONTH },
        userId,
      )

      const payout = await overtimePayoutRepo.findByEmployeeMonth(
        prisma,
        tenantId,
        employee.id,
        YEAR,
        MONTH,
      )
      const currentMonth = await prisma.monthlyValue.findFirstOrThrow({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: MONTH },
      })

      expect(payout).toBeNull()
      expect(currentMonth.flextimeEnd).toBe(720)
    })

    it("approved payouts appear in both legacy DATEV export and template-engine export", async () => {
      const { tenantId, userId } = await createTenantBase("OTP export approved")
      const tariff = await createTariff(tenantId, "OTP-EXPORT-APPROVED")
      const employee = await createEmployee(tenantId, tariff.id, "OTP-EXPORT-A")

      await prisma.tenantPayrollWage.createMany({
        data: [
          {
            id: randomUUID(),
            tenantId,
            code: "1002",
            name: "Mehrarbeit/Überstunden",
            terpSource: "overtimeHours",
            category: "time",
            sortOrder: 10,
          },
          {
            id: randomUUID(),
            tenantId,
            code: "1010",
            name: "Überstunden-Auszahlung",
            terpSource: "overtimePayoutHours",
            category: "time",
            sortOrder: 20,
          },
        ],
      })

      await createMonthlyValue(tenantId, employee.id, YEAR, MONTH, 600, {
        totalOvertime: 720,
        isClosed: true,
      })
      await prisma.overtimePayout.create({
        data: {
          id: randomUUID(),
          tenantId,
          employeeId: employee.id,
          year: YEAR,
          month: MONTH,
          payoutMinutes: 120,
          status: "approved",
          sourceFlextimeEnd: 720,
          tariffRuleSnapshot: { enabled: true, mode: "ALL_ABOVE_THRESHOLD" },
          approvedBy: userId,
          approvedAt: new Date(),
        },
      })

      const legacyExport = await payrollExportService.generate(
        prisma,
        tenantId,
        {
          year: YEAR,
          month: MONTH,
          format: "csv",
          exportType: "datev",
          parameters: { employeeIds: [employee.id] },
        },
        makeAudit(userId),
      )
      const legacyDownload = await payrollExportService.download(
        prisma,
        tenantId,
        legacyExport.id,
      )
      const legacyContent = Buffer.from(legacyDownload.content, "base64").toString("utf8")

      const template = await prisma.exportTemplate.create({
        data: {
          id: randomUUID(),
          tenantId,
          name: "OTP Template Export",
          targetSystem: "datev_lodas",
          outputFilename: "otp_export.txt",
          encoding: "utf-8",
          lineEnding: "lf",
          templateBody: `
{%- for employee in employees -%}
{%- for wage in payrollWages -%}
{%- assign val = wage.terpSource | terp_value: employee -%}
{%- if wage.code == "1002" or wage.code == "1010" -%}
{%- if val > 0 -%}
{{ employee.personnelNumber }};{{ wage.code }};{{ val | datev_decimal: 2 }}
{%- endif -%}
{%- endif -%}
{%- endfor -%}
{%- endfor -%}
          `.trim(),
          createdBy: userId,
        },
      })

      const templateExport = await generateExport(
        prisma,
        tenantId,
        {
          templateId: template.id,
          year: YEAR,
          month: MONTH,
          employeeIds: [employee.id],
        },
        makeAudit(userId),
      )
      const templateContent = templateExport.file.toString("utf8")

      expect(legacyContent).toContain(";1002;12.00;")
      expect(legacyContent).toContain(";1010;2.00;")
      expect(templateContent).toContain("OTP-EXPORT-A;1002;12,00")
      expect(templateContent).toContain("OTP-EXPORT-A;1010;2,00")
    })

    it("pending payouts are excluded from DATEV exports", async () => {
      const { tenantId, userId } = await createTenantBase("OTP export pending")
      const tariff = await createTariff(tenantId, "OTP-EXPORT-PENDING")
      const employee = await createEmployee(tenantId, tariff.id, "OTP-EXPORT-P")

      await createMonthlyValue(tenantId, employee.id, YEAR, MONTH, 720, {
        totalOvertime: 720,
        isClosed: true,
      })
      await prisma.overtimePayout.create({
        data: {
          id: randomUUID(),
          tenantId,
          employeeId: employee.id,
          year: YEAR,
          month: MONTH,
          payoutMinutes: 120,
          status: "pending",
          sourceFlextimeEnd: 720,
          tariffRuleSnapshot: { enabled: true, mode: "ALL_ABOVE_THRESHOLD" },
        },
      })

      const legacyExport = await payrollExportService.generate(
        prisma,
        tenantId,
        {
          year: YEAR,
          month: MONTH,
          format: "csv",
          exportType: "datev",
          parameters: { employeeIds: [employee.id] },
        },
        makeAudit(userId),
      )
      const legacyDownload = await payrollExportService.download(
        prisma,
        tenantId,
        legacyExport.id,
      )
      const legacyContent = Buffer.from(legacyDownload.content, "base64").toString("utf8")

      expect(legacyContent).toContain(";1002;12.00;")
      expect(legacyContent).not.toContain(";1010;")
    })

    it("isolates payout creation by tenant", async () => {
      const tenantA = await createTenantBase("OTP tenant A")
      const tenantB = await createTenantBase("OTP tenant B")

      const tariffA = await createTariff(tenantA.tenantId, "OTP-A", {
        overtimePayoutEnabled: true,
        overtimePayoutThresholdMinutes: 600,
        overtimePayoutMode: "ALL_ABOVE_THRESHOLD",
      })
      const tariffB = await createTariff(tenantB.tenantId, "OTP-B")

      const employeeA = await createEmployee(tenantA.tenantId, tariffA.id, "OTP-A")
      const employeeB = await createEmployee(tenantB.tenantId, tariffB.id, "OTP-B")

      await createMonthlyValue(tenantA.tenantId, employeeA.id, YEAR, MONTH, 720)
      await createMonthlyValue(tenantB.tenantId, employeeB.id, YEAR, MONTH, 720)

      await monthlyValuesService.close(
        prisma,
        tenantA.tenantId,
        { employeeId: employeeA.id, year: YEAR, month: MONTH },
        tenantA.userId,
      )
      await monthlyValuesService.close(
        prisma,
        tenantB.tenantId,
        { employeeId: employeeB.id, year: YEAR, month: MONTH },
        tenantB.userId,
      )

      const payoutA = await overtimePayoutRepo.findByEmployeeMonth(
        prisma,
        tenantA.tenantId,
        employeeA.id,
        YEAR,
        MONTH,
      )
      const payoutB = await overtimePayoutRepo.findByEmployeeMonth(
        prisma,
        tenantB.tenantId,
        employeeB.id,
        YEAR,
        MONTH,
      )

      expect(payoutA?.status).toBe("approved")
      expect(payoutB).toBeNull()
    })

    it("reopen removes payouts, restores the source balance, and recalculates open carryover months", async () => {
      const { tenantId, userId } = await createTenantBase("OTP reopen")
      const tariff = await createTariff(tenantId, "OTP-REOPEN", {
        overtimePayoutEnabled: true,
        overtimePayoutThresholdMinutes: 600,
        overtimePayoutMode: "ALL_ABOVE_THRESHOLD",
      })
      const employee = await createEmployee(tenantId, tariff.id, "OTP-REOPEN")
      await createMonthlyValue(tenantId, employee.id, YEAR, MONTH, 720)

      await monthlyValuesService.close(
        prisma,
        tenantId,
        { employeeId: employee.id, year: YEAR, month: MONTH },
        userId,
      )

      const nextMonthAfterClose = await prisma.monthlyValue.findFirst({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: NEXT_MONTH },
      })
      expect(nextMonthAfterClose?.flextimeStart).toBe(600)

      await monthlyValuesService.reopen(
        prisma,
        tenantId,
        { employeeId: employee.id, year: YEAR, month: MONTH },
        userId,
      )

      const payout = await overtimePayoutRepo.findByEmployeeMonth(
        prisma,
        tenantId,
        employee.id,
        YEAR,
        MONTH,
      )
      const reopenedMonth = await prisma.monthlyValue.findFirstOrThrow({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: MONTH },
      })
      const nextMonth = await prisma.monthlyValue.findFirst({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: NEXT_MONTH },
      })

      expect(payout).toBeNull()
      expect(reopenedMonth.isClosed).toBe(false)
      expect(reopenedMonth.flextimeEnd).toBe(720)
      expect(reopenedMonth.flextimeCarryover).toBe(720)
      expect(nextMonth?.flextimeStart).toBe(720)
      expect(nextMonth?.flextimeEnd).toBe(720)
    })

    it("closeBatch reports payout errors without rolling back the close", async () => {
      const { tenantId, userId } = await createTenantBase("OTP payout error")
      const tariff = await createTariff(tenantId, "OTP-ERROR", {
        overtimePayoutEnabled: true,
        overtimePayoutThresholdMinutes: 600,
        overtimePayoutMode: "ALL_ABOVE_THRESHOLD",
      })
      const employee = await createEmployee(tenantId, tariff.id, "OTP-ERROR")
      await createMonthlyValue(tenantId, employee.id, YEAR, MONTH, 720)
      await prisma.overtimePayout.create({
        data: {
          id: randomUUID(),
          tenantId,
          employeeId: employee.id,
          year: YEAR,
          month: MONTH,
          payoutMinutes: 60,
          status: "pending",
          sourceFlextimeEnd: 720,
          tariffRuleSnapshot: { enabled: true, mode: "ALL_ABOVE_THRESHOLD" },
        },
      })

      const result = await monthlyValuesService.closeBatch(
        prisma,
        tenantId,
        {
          year: YEAR,
          month: MONTH,
          employeeIds: [employee.id],
          recalculate: false,
        },
        userId,
      )
      const monthRecord = await prisma.monthlyValue.findFirstOrThrow({
        where: { tenantId, employeeId: employee.id, year: YEAR, month: MONTH },
      })

      expect(result.closedCount).toBe(1)
      expect(result.errorCount).toBe(1)
      expect(result.errors[0]?.employeeId).toBe(employee.id)
      expect(monthRecord.isClosed).toBe(true)
    })
  },
)
