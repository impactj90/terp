import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { payrollExportsRouter } from "../payrollExports"
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
const EXPORT_ID = "a0000000-0000-4000-a000-000000004001"
const EXPORT_ID_2 = "a0000000-0000-4000-a000-000000004002"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000005001"

const PAYROLL_VIEW = permissionIdByKey("payroll.view")!
const PAYROLL_MANAGE = permissionIdByKey("payroll.manage")!

const createCaller = createCallerFactory(payrollExportsRouter)

// --- Helpers ---

function makePayrollExport(overrides: Record<string, unknown> = {}) {
  return {
    id: EXPORT_ID,
    tenantId: TENANT_ID,
    exportInterfaceId: null,
    year: 2025,
    month: 6,
    status: "completed",
    exportType: "standard",
    format: "csv",
    parameters: {},
    fileContent: "PersonnelNumber;FirstName;LastName\n001;John;Doe\n",
    fileSize: 50,
    rowCount: 1,
    employeeCount: 1,
    totalHours: new Decimal("160.00"),
    totalOvertime: new Decimal("10.00"),
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
    user: createUserWithPermissions([PAYROLL_VIEW, PAYROLL_MANAGE], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- payrollExports.list tests ---

describe("payrollExports.list", () => {
  it("returns paginated exports without fileContent", async () => {
    const exports = [
      makePayrollExport(),
      makePayrollExport({ id: EXPORT_ID_2, month: 5 }),
    ]
    const mockPrisma = {
      payrollExport: {
        findMany: vi.fn().mockResolvedValue(exports),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(2)
    expect(result.meta.hasMore).toBe(false)
    // Verify fileContent is stripped
    for (const item of result.data) {
      expect(item).not.toHaveProperty("fileContent")
    }
  })

  it("filters by year and month", async () => {
    const mockPrisma = {
      payrollExport: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.list({ year: 2025, month: 6 })

    expect(mockPrisma.payrollExport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          year: 2025,
          month: 6,
        }),
      })
    )
  })

  it("supports cursor pagination", async () => {
    // Return limit + 1 to indicate hasMore
    const exports = Array.from({ length: 21 }, (_, i) =>
      makePayrollExport({ id: `a0000000-0000-4000-a000-00000000${String(4000 + i).padStart(4, "0")}` })
    )
    const mockPrisma = {
      payrollExport: {
        findMany: vi.fn().mockResolvedValue(exports),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.list({ limit: 20 })

    expect(result.data).toHaveLength(20)
    expect(result.meta.hasMore).toBe(true)
    expect(result.meta.nextCursor).toBeDefined()
  })
})

// --- payrollExports.getById tests ---

describe("payrollExports.getById", () => {
  it("returns export without fileContent", async () => {
    const pe = makePayrollExport()
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.getById({ id: EXPORT_ID })

    expect(result.id).toBe(EXPORT_ID)
    expect(result).not.toHaveProperty("fileContent")
  })

  it("throws NOT_FOUND for missing export", async () => {
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await expect(
      caller.getById({ id: EXPORT_ID })
    ).rejects.toThrow("Payroll export not found")
  })
})

// --- payrollExports.generate tests ---

describe("payrollExports.generate", () => {
  it("rejects future month", async () => {
    const mockPrisma = {
      payrollExport: {
        create: vi.fn(),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))

    const futureYear = new Date().getFullYear() + 1
    await expect(
      caller.generate({ year: futureYear, month: 1 })
    ).rejects.toThrow("Cannot generate export for a future month")
  })

  it("creates record and generates CSV", async () => {
    const pendingExport = makePayrollExport({ status: "pending", fileContent: null })
    const generatingExport = makePayrollExport({ status: "generating", fileContent: null })
    const completedExport = makePayrollExport({ status: "completed" })

    const employee = {
      id: EMPLOYEE_ID,
      personnelNumber: "001",
      firstName: "John",
      lastName: "Doe",
      department: { code: "IT" },
      costCenter: { code: "CC001" },
    }

    const monthlyValue = {
      totalTargetTime: 9600,    // 160 hours in minutes
      totalNetTime: 10200,      // 170 hours
      totalOvertime: 600,       // 10 hours
      vacationTaken: new Decimal("2.00"),
      sickDays: 1,
      otherAbsenceDays: 0,
    }

    const mockPrisma = {
      payrollExport: {
        create: vi.fn().mockResolvedValue(pendingExport),
        update: vi.fn()
          .mockResolvedValueOnce(generatingExport)
          .mockResolvedValueOnce(completedExport),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([employee]),
      },
      monthlyValue: {
        findFirst: vi.fn().mockResolvedValue(monthlyValue),
      },
      account: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.generate({
      year: 2025,
      month: 1,
      format: "csv",
    })

    expect(result.status).toBe("completed")
    expect(result).not.toHaveProperty("fileContent")
    expect(mockPrisma.payrollExport.create).toHaveBeenCalled()
    expect(mockPrisma.employee.findMany).toHaveBeenCalled()
  })
})

// --- payrollExports.preview tests ---

describe("payrollExports.preview", () => {
  it("returns structured lines for completed export", async () => {
    const pe = makePayrollExport({ status: "completed" })
    const employee = {
      id: EMPLOYEE_ID,
      personnelNumber: "001",
      firstName: "John",
      lastName: "Doe",
      department: { code: "IT" },
      costCenter: { code: "CC001" },
    }
    const monthlyValue = {
      totalTargetTime: 9600,
      totalNetTime: 10200,
      totalOvertime: 600,
      vacationTaken: new Decimal("2.00"),
      sickDays: 1,
      otherAbsenceDays: 0,
    }

    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([employee]),
      },
      monthlyValue: {
        findMany: vi.fn().mockResolvedValue([{ ...monthlyValue, employeeId: EMPLOYEE_ID }]),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.preview({ id: EXPORT_ID })

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.personnelNumber).toBe("001")
    expect(result.summary.employeeCount).toBe(1)
    expect(result.summary.totalHours).toBeGreaterThan(0)
  })

  it("rejects preview for non-completed export", async () => {
    const pe = makePayrollExport({ status: "pending" })
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await expect(
      caller.preview({ id: EXPORT_ID })
    ).rejects.toThrow("Export is not ready")
  })
})

// --- payrollExports.download tests ---

describe("payrollExports.download", () => {
  it("returns base64-encoded content for completed export", async () => {
    const pe = makePayrollExport({
      status: "completed",
      fileContent: "PersonnelNumber;FirstName;LastName\n001;John;Doe\n",
    })
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.download({ id: EXPORT_ID })

    expect(result.content).toBeTruthy()
    expect(result.contentType).toBe("text/csv")
    expect(result.filename).toContain("payroll_export")
    expect(result.filename).toContain(".csv")

    // Verify base64 content decodes correctly
    const decoded = Buffer.from(result.content, "base64").toString()
    expect(decoded).toContain("PersonnelNumber")
  })

  it("rejects download for non-completed export", async () => {
    const pe = makePayrollExport({ status: "generating" })
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await expect(
      caller.download({ id: EXPORT_ID })
    ).rejects.toThrow("Export is not ready")
  })

  it("rejects download when fileContent is null", async () => {
    const pe = makePayrollExport({ status: "completed", fileContent: null })
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await expect(
      caller.download({ id: EXPORT_ID })
    ).rejects.toThrow("Export has no file content")
  })
})

// --- payrollExports.delete tests ---

describe("payrollExports.delete", () => {
  it("deletes existing export", async () => {
    const pe = makePayrollExport()
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
        delete: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.delete({ id: EXPORT_ID })

    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for missing export", async () => {
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await expect(
      caller.delete({ id: EXPORT_ID })
    ).rejects.toThrow("Payroll export not found")
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
