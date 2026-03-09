import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { reportsRouter } from "../reports"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { Decimal } from "@prisma/client/runtime/client"

// --- Constants ---

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const REPORT_ID = "a0000000-0000-4000-a000-000000006001"
const REPORT_ID_2 = "a0000000-0000-4000-a000-000000006002"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000005001"

const REPORTS_VIEW = permissionIdByKey("reports.view")!
const REPORTS_MANAGE = permissionIdByKey("reports.manage")!

const createCaller = createCallerFactory(reportsRouter)

// --- Helpers ---

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    tenantId: TENANT_ID,
    reportType: "monthly_overview",
    name: "Monthly overview - 2025-07-01",
    description: null,
    status: "completed",
    format: "csv",
    parameters: {},
    fileContent: Buffer.from("PersonnelNumber;FirstName;LastName\n001;John;Doe\n"),
    fileSize: 50,
    rowCount: 1,
    errorMessage: null,
    requestedAt: new Date("2025-07-01"),
    startedAt: new Date("2025-07-01"),
    completedAt: new Date("2025-07-01"),
    createdBy: USER_ID,
    createdAt: new Date("2025-07-01"),
    updatedAt: new Date("2025-07-01"),
    ...overrides,
  }
}

function createViewContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([REPORTS_VIEW, REPORTS_MANAGE], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- reports.list tests ---

describe("reports.list", () => {
  it("returns paginated reports without fileContent", async () => {
    const reports = [
      makeReport(),
      makeReport({ id: REPORT_ID_2, reportType: "overtime_report" }),
    ]
    const mockPrisma = {
      report: {
        findMany: vi.fn().mockResolvedValue(reports),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(2)
    expect(result.meta.hasMore).toBe(false)
    for (const item of result.data) {
      expect(item).not.toHaveProperty("fileContent")
    }
  })

  it("filters by reportType", async () => {
    const mockPrisma = {
      report: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.list({ reportType: "monthly_overview" })

    expect(mockPrisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          reportType: "monthly_overview",
        }),
      })
    )
  })

  it("filters by status", async () => {
    const mockPrisma = {
      report: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.list({ status: "completed" })

    expect(mockPrisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          status: "completed",
        }),
      })
    )
  })

  it("supports cursor pagination", async () => {
    const reports = Array.from({ length: 21 }, (_, i) =>
      makeReport({ id: `a0000000-0000-4000-a000-00000000${String(6000 + i).padStart(4, "0")}` })
    )
    const mockPrisma = {
      report: {
        findMany: vi.fn().mockResolvedValue(reports),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.list({ limit: 20 })

    expect(result.data).toHaveLength(20)
    expect(result.meta.hasMore).toBe(true)
    expect(result.meta.nextCursor).toBeDefined()
  })
})

// --- reports.getById tests ---

describe("reports.getById", () => {
  it("returns report without fileContent", async () => {
    const report = makeReport()
    const mockPrisma = {
      report: {
        findFirst: vi.fn().mockResolvedValue(report),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.getById({ id: REPORT_ID })

    expect(result.id).toBe(REPORT_ID)
    expect(result).not.toHaveProperty("fileContent")
  })

  it("throws NOT_FOUND for missing report", async () => {
    const mockPrisma = {
      report: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await expect(
      caller.getById({ id: REPORT_ID })
    ).rejects.toThrow("Report not found")
  })
})

// --- reports.generate tests ---

describe("reports.generate", () => {
  it("requires date range for monthly_overview", async () => {
    const mockPrisma = {
      report: {
        create: vi.fn(),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await expect(
      caller.generate({
        reportType: "monthly_overview",
        format: "csv",
      })
    ).rejects.toThrow("from_date and to_date are required")
  })

  it("generates CSV report for monthly_overview", async () => {
    const pendingReport = makeReport({ status: "pending", fileContent: null })
    const generatingReport = makeReport({ status: "generating", fileContent: null })
    const completedReport = makeReport({ status: "completed" })

    const employee = {
      id: EMPLOYEE_ID,
      personnelNumber: "001",
      firstName: "John",
      lastName: "Doe",
      departmentId: null,
      costCenterId: null,
      isActive: true,
      department: { code: "IT", name: "IT Department" },
      costCenter: { code: "CC001" },
    }

    const monthlyValue = {
      totalTargetTime: 9600,
      totalNetTime: 10200,
      totalOvertime: 600,
      flextimeEnd: 600,
      vacationTaken: new Decimal("2.00"),
      sickDays: 1,
      otherAbsenceDays: 0,
      isClosed: true,
    }

    const mockPrisma = {
      report: {
        create: vi.fn().mockResolvedValue(pendingReport),
        update: vi.fn()
          .mockResolvedValueOnce(generatingReport)
          .mockResolvedValueOnce(completedReport),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([employee]),
      },
      monthlyValue: {
        findFirst: vi.fn().mockResolvedValue(monthlyValue),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.generate({
      reportType: "monthly_overview",
      format: "csv",
      parameters: {
        fromDate: "2025-01-01",
        toDate: "2025-01-31",
      },
    })

    expect(result.status).toBe("completed")
    expect(result).not.toHaveProperty("fileContent")
    expect(mockPrisma.report.create).toHaveBeenCalled()
  })

  it("generates JSON report for vacation_report", async () => {
    const pendingReport = makeReport({ status: "pending", fileContent: null, reportType: "vacation_report" })
    const generatingReport = makeReport({ status: "generating", fileContent: null, reportType: "vacation_report" })
    const completedReport = makeReport({ status: "completed", reportType: "vacation_report" })

    const employee = {
      id: EMPLOYEE_ID,
      personnelNumber: "001",
      firstName: "John",
      lastName: "Doe",
      departmentId: null,
      costCenterId: null,
      isActive: true,
      department: null,
      costCenter: null,
    }

    const vacationBalance = {
      entitlement: new Decimal("30.00"),
      carryover: new Decimal("5.00"),
      adjustments: new Decimal("0.00"),
      taken: new Decimal("10.00"),
    }

    const mockPrisma = {
      report: {
        create: vi.fn().mockResolvedValue(pendingReport),
        update: vi.fn()
          .mockResolvedValueOnce(generatingReport)
          .mockResolvedValueOnce(completedReport),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([employee]),
      },
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(vacationBalance),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.generate({
      reportType: "vacation_report",
      format: "json",
    })

    expect(result.status).toBe("completed")
  })

  it("allows custom report without date range", async () => {
    const pendingReport = makeReport({ status: "pending", fileContent: null, reportType: "custom" })
    const generatingReport = makeReport({ status: "generating", fileContent: null, reportType: "custom" })
    const completedReport = makeReport({ status: "completed", reportType: "custom" })

    const mockPrisma = {
      report: {
        create: vi.fn().mockResolvedValue(pendingReport),
        update: vi.fn()
          .mockResolvedValueOnce(generatingReport)
          .mockResolvedValueOnce(completedReport),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.generate({
      reportType: "custom",
      format: "csv",
    })

    expect(result.status).toBe("completed")
  })
})

// --- reports.download tests ---

describe("reports.download", () => {
  it("returns base64-encoded content for completed report", async () => {
    const report = makeReport({
      status: "completed",
      format: "csv",
      fileContent: Buffer.from("PersonnelNumber;FirstName\n001;John\n"),
    })
    const mockPrisma = {
      report: {
        findFirst: vi.fn().mockResolvedValue(report),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.download({ id: REPORT_ID })

    expect(result.content).toBeTruthy()
    expect(result.contentType).toBe("text/csv")
    expect(result.filename).toContain("report_")
    expect(result.filename).toContain(".csv")
  })

  it("returns correct content type for JSON format", async () => {
    const report = makeReport({
      status: "completed",
      format: "json",
      fileContent: Buffer.from('[{"name":"test"}]'),
    })
    const mockPrisma = {
      report: {
        findFirst: vi.fn().mockResolvedValue(report),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.download({ id: REPORT_ID })

    expect(result.contentType).toBe("application/json")
    expect(result.filename).toContain(".json")
  })

  it("rejects download for non-completed report", async () => {
    const report = makeReport({ status: "generating" })
    const mockPrisma = {
      report: {
        findFirst: vi.fn().mockResolvedValue(report),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await expect(
      caller.download({ id: REPORT_ID })
    ).rejects.toThrow("Report is not ready")
  })

  it("rejects download when fileContent is null", async () => {
    const report = makeReport({ status: "completed", fileContent: null })
    const mockPrisma = {
      report: {
        findFirst: vi.fn().mockResolvedValue(report),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await expect(
      caller.download({ id: REPORT_ID })
    ).rejects.toThrow("Report has no file content")
  })
})

// --- reports.delete tests ---

describe("reports.delete", () => {
  it("deletes existing report", async () => {
    const report = makeReport()
    const mockPrisma = {
      report: {
        findFirst: vi.fn().mockResolvedValue(report),
        delete: vi.fn().mockResolvedValue(report),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.delete({ id: REPORT_ID })

    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for missing report", async () => {
    const mockPrisma = {
      report: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await expect(
      caller.delete({ id: REPORT_ID })
    ).rejects.toThrow("Report not found")
  })
})

// --- Authentication test ---

describe("authentication", () => {
  it("throws UNAUTHORIZED for unauthenticated request", async () => {
    const mockPrisma = {}
    const ctx = createMockContext({
      prisma: mockPrisma as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: null,
      user: null,
      session: null,
      tenantId: TENANT_ID,
    })
    const caller = createCaller(ctx)
    await expect(caller.list()).rejects.toThrow("Authentication required")
  })
})
