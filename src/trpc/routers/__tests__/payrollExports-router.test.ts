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
const EMPLOYEE_ID_2 = "a0000000-0000-4000-a000-000000005002"
const ACCOUNT_ID_1 = "a0000000-0000-4000-a000-000000006001"
const ACCOUNT_ID_2 = "a0000000-0000-4000-a000-000000006002"
const IFACE_ID = "a0000000-0000-4000-a000-000000007001"

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

function makeEmployee(id: string, personnelNumber: string, firstName: string, lastName: string) {
  return {
    id,
    personnelNumber,
    firstName,
    lastName,
    department: { code: "IT" },
    costCenter: { code: "CC001" },
  }
}

function makeMonthlyValue(employeeId: string, overrides: Record<string, unknown> = {}) {
  return {
    employeeId,
    totalTargetTime: 9600,   // 160h in minutes
    totalNetTime: 10200,     // 170h
    totalOvertime: 600,      // 10h
    vacationTaken: new Decimal("2.00"),
    sickDays: 1,
    otherAbsenceDays: 0,
    isClosed: true,
    ...overrides,
  }
}

/**
 * Creates a mock Prisma setup for generate tests with full data.
 * The final update call captures the fileContent so we can inspect it.
 */
function makeGeneratePrisma(opts: {
  employees?: ReturnType<typeof makeEmployee>[]
  monthlyValues?: ReturnType<typeof makeMonthlyValue>[]
  accounts?: { id: string; code: string; name: string; payrollCode: string | null }[]
  interfaceAccounts?: { accountId: string }[]
  dailyAccountAgg?: { employeeId: string; accountId: string; _sum: { valueMinutes: number | null } }[]
}) {
  const pendingExport = makePayrollExport({ status: "pending", fileContent: null })
  const generatingExport = makePayrollExport({ status: "generating", fileContent: null })

  let capturedFileContent: string | null = null
  const updateManyMock = vi.fn().mockImplementation((arg: { where: unknown; data: Record<string, unknown> }) => {
    // Capture fileContent from data if present
    if (arg.data?.fileContent) {
      capturedFileContent = arg.data.fileContent as string
    }
    return Promise.resolve({ count: 1 })
  })

  // findFirst returns the state after each updateMany call
  const findFirstMock = vi.fn().mockImplementation(() => {
    // After first updateMany (generating), return generating state
    if (updateManyMock.mock.calls.length === 1) {
      return Promise.resolve(generatingExport)
    }
    // After second+ updateMany (completed), return completed state
    return Promise.resolve(makePayrollExport({
      status: (updateManyMock.mock.calls[updateManyMock.mock.calls.length - 1]?.[0]?.data?.status as string) ?? "completed",
      fileContent: capturedFileContent,
    }))
  })

  return {
    prisma: {
      payrollExport: {
        create: vi.fn().mockResolvedValue(pendingExport),
        updateMany: updateManyMock,
        findFirst: findFirstMock,
      },
      employee: {
        findMany: vi.fn().mockResolvedValue(opts.employees ?? []),
      },
      monthlyValue: {
        findMany: vi.fn().mockResolvedValue(opts.monthlyValues ?? []),
      },
      account: {
        findMany: vi.fn().mockResolvedValue(opts.accounts ?? []),
      },
      exportInterfaceAccount: {
        findMany: vi.fn().mockResolvedValue(opts.interfaceAccounts ?? []),
      },
      dailyAccountValue: {
        groupBy: vi.fn().mockResolvedValue(opts.dailyAccountAgg ?? []),
      },
    },
    getCapturedFileContent: () => capturedFileContent,
    updateMock: updateManyMock,
  }
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

  it("creates record and generates standard CSV with employee data", async () => {
    const emp = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const mv = makeMonthlyValue(EMPLOYEE_ID)

    const { prisma, getCapturedFileContent } = makeGeneratePrisma({
      employees: [emp],
      monthlyValues: [mv],
    })

    const caller = createCaller(createViewContext(prisma))
    const result = await caller.generate({ year: 2025, month: 1 })

    expect(result.status).toBe("completed")
    expect(result).not.toHaveProperty("fileContent")

    // Verify CSV content
    const csv = getCapturedFileContent()!
    expect(csv).toBeTruthy()
    const lines = csv.trim().split("\n")
    expect(lines[0]).toContain("PersonnelNumber")
    expect(lines[0]).toContain("WorkedHours")
    expect(lines[1]).toContain("001")
    expect(lines[1]).toContain("John")
    expect(lines[1]).toContain("Doe")
    // 170h worked = 10200 / 60
    expect(lines[1]).toContain("170.00")
  })

  it("populates account values from daily aggregation", async () => {
    const emp = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const mv = makeMonthlyValue(EMPLOYEE_ID)

    const { prisma, getCapturedFileContent } = makeGeneratePrisma({
      employees: [emp],
      monthlyValues: [mv],
      accounts: [
        { id: ACCOUNT_ID_1, code: "OT_150", name: "Overtime 150%", payrollCode: "1500" },
        { id: ACCOUNT_ID_2, code: "OT_200", name: "Overtime 200%", payrollCode: "2500" },
      ],
      dailyAccountAgg: [
        { employeeId: EMPLOYEE_ID, accountId: ACCOUNT_ID_1, _sum: { valueMinutes: 300 } }, // 5h
        { employeeId: EMPLOYEE_ID, accountId: ACCOUNT_ID_2, _sum: { valueMinutes: 120 } }, // 2h
      ],
    })

    const caller = createCaller(createViewContext(prisma))
    const result = await caller.generate({
      year: 2025,
      month: 1,
      parameters: { includeAccounts: [ACCOUNT_ID_1, ACCOUNT_ID_2] },
    })

    expect(result.status).toBe("completed")

    const csv = getCapturedFileContent()!
    const lines = csv.trim().split("\n")
    // Header should have account columns
    expect(lines[0]).toContain("Account_OT_150")
    expect(lines[0]).toContain("Account_OT_200")
    // Data row should have the aggregated values (300min = 5h, 120min = 2h)
    expect(lines[1]).toContain("5.00")
    expect(lines[1]).toContain("2.00")
  })

  it("loads accounts from export interface when includeAccounts not specified", async () => {
    const emp = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const mv = makeMonthlyValue(EMPLOYEE_ID)

    const { prisma, getCapturedFileContent } = makeGeneratePrisma({
      employees: [emp],
      monthlyValues: [mv],
      interfaceAccounts: [{ accountId: ACCOUNT_ID_1 }],
      accounts: [
        { id: ACCOUNT_ID_1, code: "FLEX", name: "Flex Time", payrollCode: null },
      ],
      dailyAccountAgg: [
        { employeeId: EMPLOYEE_ID, accountId: ACCOUNT_ID_1, _sum: { valueMinutes: 180 } },
      ],
    })

    const caller = createCaller(createViewContext(prisma))
    await caller.generate({
      year: 2025,
      month: 1,
      exportInterfaceId: IFACE_ID,
    })

    const csv = getCapturedFileContent()!
    expect(csv).toContain("Account_FLEX")
    // 180 min = 3h
    expect(csv).toContain("3.00")

    // Verify interface accounts were queried
    expect(prisma.exportInterfaceAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { exportInterfaceId: IFACE_ID } })
    )
  })

  it("generates DATEV LODAS format with one row per wage type", async () => {
    const emp = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const mv = makeMonthlyValue(EMPLOYEE_ID)

    const { prisma, getCapturedFileContent } = makeGeneratePrisma({
      employees: [emp],
      monthlyValues: [mv],
      accounts: [
        { id: ACCOUNT_ID_1, code: "OT_150", name: "Overtime 150%", payrollCode: "1500" },
      ],
      dailyAccountAgg: [
        { employeeId: EMPLOYEE_ID, accountId: ACCOUNT_ID_1, _sum: { valueMinutes: 300 } },
      ],
    })

    const caller = createCaller(createViewContext(prisma))
    const result = await caller.generate({
      year: 2025,
      month: 1,
      exportType: "datev",
      parameters: { includeAccounts: [ACCOUNT_ID_1] },
    })

    expect(result.status).toBe("completed")

    const csv = getCapturedFileContent()!
    const lines = csv.trim().split("\n")

    // Header should be DATEV format
    expect(lines[0]).toBe("Personalnummer;Nachname;Vorname;Lohnart;Stunden;Tage;Betrag;Kostenstelle")

    // Should have base wage types (only those > 0) + account wage types
    const dataLines = lines.slice(1)
    expect(dataLines.length).toBeGreaterThan(0)

    // Find Sollstunden row (1000)
    const targetRow = dataLines.find((l) => l.includes(";1000;"))
    expect(targetRow).toBeTruthy()
    expect(targetRow).toContain("001") // personnel number
    expect(targetRow).toContain("Doe") // last name
    expect(targetRow).toContain("160.00") // target hours

    // Find Ist-Stunden row (1001)
    const workedRow = dataLines.find((l) => l.includes(";1001;"))
    expect(workedRow).toBeTruthy()
    expect(workedRow).toContain("170.00")

    // Find overtime base row (1002)
    const otRow = dataLines.find((l) => l.includes(";1002;"))
    expect(otRow).toBeTruthy()
    expect(otRow).toContain("10.00")

    // Find vacation row (2000)
    const vacRow = dataLines.find((l) => l.includes(";2000;"))
    expect(vacRow).toBeTruthy()
    expect(vacRow).toContain("2.00") // days

    // Find sick row (2001)
    const sickRow = dataLines.find((l) => l.includes(";2001;"))
    expect(sickRow).toBeTruthy()

    // otherAbsenceDays = 0, so no 2002 row
    const otherRow = dataLines.find((l) => l.includes(";2002;"))
    expect(otherRow).toBeUndefined()

    // Account-based wage type: payrollCode "1500" should be used
    const acctRow = dataLines.find((l) => l.includes(";1500;"))
    expect(acctRow).toBeTruthy()
    expect(acctRow).toContain("5.00") // 300min = 5h
  })

  it("DATEV uses account code as fallback when payrollCode is null", async () => {
    const emp = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const mv = makeMonthlyValue(EMPLOYEE_ID)

    const { prisma, getCapturedFileContent } = makeGeneratePrisma({
      employees: [emp],
      monthlyValues: [mv],
      accounts: [
        { id: ACCOUNT_ID_1, code: "FLEX", name: "Flex Time", payrollCode: null },
      ],
      dailyAccountAgg: [
        { employeeId: EMPLOYEE_ID, accountId: ACCOUNT_ID_1, _sum: { valueMinutes: 120 } },
      ],
    })

    const caller = createCaller(createViewContext(prisma))
    await caller.generate({
      year: 2025,
      month: 1,
      exportType: "datev",
      parameters: { includeAccounts: [ACCOUNT_ID_1] },
    })

    const csv = getCapturedFileContent()!
    // Should use "FLEX" (account code) as Lohnart since payrollCode is null
    const acctRow = csv.split("\n").find((l) => l.includes(";FLEX;"))
    expect(acctRow).toBeTruthy()
    expect(acctRow).toContain("2.00") // 120min = 2h
  })

  it("generates CSV for multiple employees with different account values", async () => {
    const emp1 = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const emp2 = makeEmployee(EMPLOYEE_ID_2, "002", "Jane", "Smith")
    const mv1 = makeMonthlyValue(EMPLOYEE_ID)
    const mv2 = makeMonthlyValue(EMPLOYEE_ID_2, {
      totalTargetTime: 8400,  // 140h
      totalNetTime: 8400,
      totalOvertime: 0,
      vacationTaken: new Decimal("0"),
      sickDays: 3,
    })

    const { prisma, getCapturedFileContent } = makeGeneratePrisma({
      employees: [emp1, emp2],
      monthlyValues: [mv1, mv2],
      accounts: [
        { id: ACCOUNT_ID_1, code: "ACC1", name: "Account 1", payrollCode: null },
      ],
      dailyAccountAgg: [
        { employeeId: EMPLOYEE_ID, accountId: ACCOUNT_ID_1, _sum: { valueMinutes: 60 } },
        // emp2 has no account values
      ],
    })

    const caller = createCaller(createViewContext(prisma))
    await caller.generate({
      year: 2025,
      month: 1,
      parameters: { includeAccounts: [ACCOUNT_ID_1] },
    })

    const csv = getCapturedFileContent()!
    const lines = csv.trim().split("\n")
    expect(lines).toHaveLength(3) // header + 2 employees

    // Employee 1: account value = 1h
    const emp1Line = lines.find((l) => l.startsWith("001;"))
    expect(emp1Line).toContain("1.00") // 60min = 1h for account

    // Employee 2: account value = 0h (no aggregation row)
    const emp2Line = lines.find((l) => l.startsWith("002;"))
    expect(emp2Line).toContain("Jane")
    // Last column should be 0.00 for the account
    expect(emp2Line!.endsWith("0.00")).toBe(true)
  })

  it("rejects when employees have unclosed monthly values", async () => {
    const emp = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const mv = makeMonthlyValue(EMPLOYEE_ID, { isClosed: false })

    const { prisma } = makeGeneratePrisma({
      employees: [emp],
      monthlyValues: [mv],
    })

    const caller = createCaller(createViewContext(prisma))
    await expect(
      caller.generate({ year: 2025, month: 1 })
    ).rejects.toThrow("Monthly values not closed for: 001 John Doe")
  })

  it("rejects when employees have no monthly values", async () => {
    const emp1 = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const emp2 = makeEmployee(EMPLOYEE_ID_2, "002", "Jane", "Smith")
    // Only emp1 has monthly values
    const mv1 = makeMonthlyValue(EMPLOYEE_ID)

    const { prisma } = makeGeneratePrisma({
      employees: [emp1, emp2],
      monthlyValues: [mv1],
    })

    const caller = createCaller(createViewContext(prisma))
    await expect(
      caller.generate({ year: 2025, month: 1 })
    ).rejects.toThrow("Monthly values not closed for: 002 Jane Smith")
  })
})

// --- payrollExports.preview tests ---

describe("payrollExports.preview", () => {
  it("returns structured lines for completed export", async () => {
    const pe = makePayrollExport({ status: "completed" })
    const employee = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const mv = makeMonthlyValue(EMPLOYEE_ID)

    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([employee]),
      },
      monthlyValue: {
        findMany: vi.fn().mockResolvedValue([mv]),
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

  it("populates account values in preview lines", async () => {
    const pe = makePayrollExport({
      status: "completed",
      exportInterfaceId: IFACE_ID,
      parameters: { includeAccounts: [ACCOUNT_ID_1, ACCOUNT_ID_2] },
    })
    const employee = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const mv = makeMonthlyValue(EMPLOYEE_ID)

    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([employee]),
      },
      monthlyValue: {
        findMany: vi.fn().mockResolvedValue([mv]),
      },
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: ACCOUNT_ID_1, code: "OT_150", name: "Overtime 150%", payrollCode: "1500" },
          { id: ACCOUNT_ID_2, code: "OT_200", name: "Overtime 200%", payrollCode: null },
        ]),
      },
      dailyAccountValue: {
        groupBy: vi.fn().mockResolvedValue([
          { employeeId: EMPLOYEE_ID, accountId: ACCOUNT_ID_1, _sum: { valueMinutes: 300 } },
          { employeeId: EMPLOYEE_ID, accountId: ACCOUNT_ID_2, _sum: { valueMinutes: 120 } },
        ]),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.preview({ id: EXPORT_ID })

    expect(result.lines).toHaveLength(1)
    const line = result.lines[0]!
    // Account values keyed by code, converted from minutes to hours
    expect(line.accountValues["OT_150"]).toBeCloseTo(5, 1) // 300min / 60
    expect(line.accountValues["OT_200"]).toBeCloseTo(2, 1) // 120min / 60
  })

  it("loads accounts from export interface in preview", async () => {
    const pe = makePayrollExport({
      status: "completed",
      exportInterfaceId: IFACE_ID,
      parameters: {}, // no includeAccounts
    })
    const employee = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const mv = makeMonthlyValue(EMPLOYEE_ID)

    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([employee]),
      },
      monthlyValue: {
        findMany: vi.fn().mockResolvedValue([mv]),
      },
      exportInterfaceAccount: {
        findMany: vi.fn().mockResolvedValue([{ accountId: ACCOUNT_ID_1 }]),
      },
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: ACCOUNT_ID_1, code: "FLEX", name: "Flex", payrollCode: null },
        ]),
      },
      dailyAccountValue: {
        groupBy: vi.fn().mockResolvedValue([
          { employeeId: EMPLOYEE_ID, accountId: ACCOUNT_ID_1, _sum: { valueMinutes: 90 } },
        ]),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.preview({ id: EXPORT_ID })

    expect(result.lines[0]!.accountValues["FLEX"]).toBeCloseTo(1.5, 1) // 90/60
    expect(mockPrisma.exportInterfaceAccount.findMany).toHaveBeenCalled()
  })

  it("returns empty account values when no accounts configured", async () => {
    const pe = makePayrollExport({ status: "completed", parameters: {} })
    const employee = makeEmployee(EMPLOYEE_ID, "001", "John", "Doe")
    const mv = makeMonthlyValue(EMPLOYEE_ID)

    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([employee]),
      },
      monthlyValue: {
        findMany: vi.fn().mockResolvedValue([mv]),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.preview({ id: EXPORT_ID })

    expect(result.lines[0]!.accountValues).toEqual({})
  })
})

// --- payrollExports.download tests ---

describe("payrollExports.download", () => {
  const STANDARD_CSV = [
    "PersonnelNumber;FirstName;LastName;DepartmentCode;CostCenterCode;TargetHours;WorkedHours;OvertimeHours;VacationDays;SickDays;OtherAbsenceDays",
    "001;John;Doe;IT;CC001;160.00;170.00;10.00;2.00;1.00;0.00",
  ].join("\n") + "\n"

  it("returns base64-encoded CSV content for csv format", async () => {
    const pe = makePayrollExport({
      status: "completed",
      format: "csv",
      fileContent: STANDARD_CSV,
    })
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.download({ id: EXPORT_ID })

    expect(result.contentType).toBe("text/csv")
    expect(result.filename).toContain(".csv")

    const decoded = Buffer.from(result.content, "base64").toString()
    expect(decoded).toBe(STANDARD_CSV)
  })

  it("converts CSV to JSON on download", async () => {
    const pe = makePayrollExport({
      status: "completed",
      format: "json",
      fileContent: STANDARD_CSV,
    })
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.download({ id: EXPORT_ID })

    expect(result.contentType).toBe("application/json")
    expect(result.filename).toContain(".json")

    const decoded = Buffer.from(result.content, "base64").toString()
    const parsed = JSON.parse(decoded)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].PersonnelNumber).toBe("001")
    expect(parsed[0].FirstName).toBe("John")
    expect(parsed[0].LastName).toBe("Doe")
    expect(parsed[0].WorkedHours).toBe("170.00")
    expect(parsed[0].TargetHours).toBe("160.00")
  })

  it("converts CSV to XML on download", async () => {
    const pe = makePayrollExport({
      status: "completed",
      format: "xml",
      fileContent: STANDARD_CSV,
    })
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.download({ id: EXPORT_ID })

    expect(result.contentType).toBe("application/xml")
    expect(result.filename).toContain(".xml")

    const decoded = Buffer.from(result.content, "base64").toString()
    expect(decoded).toContain('<?xml version="1.0"')
    expect(decoded).toContain("<PayrollExport>")
    expect(decoded).toContain("<Row>")
    expect(decoded).toContain("<PersonnelNumber>001</PersonnelNumber>")
    expect(decoded).toContain("<FirstName>John</FirstName>")
    expect(decoded).toContain("<WorkedHours>170.00</WorkedHours>")
    expect(decoded).toContain("</PayrollExport>")
  })

  it("converts CSV to XLSX on download", async () => {
    const pe = makePayrollExport({
      status: "completed",
      format: "xlsx",
      fileContent: STANDARD_CSV,
    })
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.download({ id: EXPORT_ID })

    expect(result.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    expect(result.filename).toContain(".xlsx")

    // XLSX is binary — verify it's valid by decoding and checking for XLSX magic bytes (PK zip)
    const buffer = Buffer.from(result.content, "base64")
    expect(buffer.length).toBeGreaterThan(0)
    // XLSX files are ZIP archives — first two bytes are "PK" (0x50, 0x4B)
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)

    // Parse back with ExcelJS to verify structure
    const ExcelJS = await import("exceljs")
    const workbook = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any)
    const sheet = workbook.worksheets[0]!
    expect(sheet.rowCount).toBe(2) // header + 1 data row

    // Check header
    const headerRow = sheet.getRow(1)
    expect(headerRow.getCell(1).value).toBe("PersonnelNumber")
    expect(headerRow.getCell(7).value).toBe("WorkedHours")

    // Check data — numeric cells should be parsed as numbers
    const dataRow = sheet.getRow(2)
    expect(dataRow.getCell(1).value).toBe(1) // "001" is parsed as number
    expect(dataRow.getCell(7).value).toBe(170) // parsed as number
  })

  it("handles DATEV format CSV in JSON conversion", async () => {
    const datevCsv = [
      "Personalnummer;Nachname;Vorname;Lohnart;Stunden;Tage;Betrag;Kostenstelle",
      "001;Doe;John;1000;160.00;0.00;;CC001",
      "001;Doe;John;1001;170.00;0.00;;CC001",
    ].join("\n") + "\n"

    const pe = makePayrollExport({
      status: "completed",
      format: "json",
      exportType: "datev",
      fileContent: datevCsv,
    })
    const mockPrisma = {
      payrollExport: {
        findFirst: vi.fn().mockResolvedValue(pe),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.download({ id: EXPORT_ID })

    const decoded = Buffer.from(result.content, "base64").toString()
    const parsed = JSON.parse(decoded)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].Personalnummer).toBe("001")
    expect(parsed[0].Lohnart).toBe("1000")
    expect(parsed[1].Lohnart).toBe("1001")
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
