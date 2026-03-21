import { describe, it, expect, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { createCallerFactory } from "@/trpc/init"
import { employeesRouter } from "../employees"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_CREATE = permissionIdByKey("employees.create")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!
const EMPLOYEES_DELETE = permissionIdByKey("employees.delete")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMP_ID = "a0000000-0000-4000-a000-000000000500"
const EMP_B_ID = "a0000000-0000-4000-a000-000000000501"
const DEPT_ID = "a0000000-0000-4000-a000-000000000200"
const LOC_ID = "a0000000-0000-4000-a000-000000000300"

const createCaller = createCallerFactory(employeesRouter)

// --- Helpers ---

function makeEmployee(
  overrides: Partial<{
    id: string
    tenantId: string
    personnelNumber: string
    pin: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    entryDate: Date
    exitDate: Date | null
    departmentId: string | null
    costCenterId: string | null
    employmentTypeId: string | null
    locationId: string | null
    tariffId: string | null
    weeklyHours: Prisma.Decimal
    vacationDaysPerYear: Prisma.Decimal
    isActive: boolean
    disabilityFlag: boolean
    exitReason: string | null
    notes: string | null
    addressStreet: string | null
    addressZip: string | null
    addressCity: string | null
    addressCountry: string | null
    birthDate: Date | null
    gender: string | null
    nationality: string | null
    religion: string | null
    maritalStatus: string | null
    birthPlace: string | null
    birthCountry: string | null
    roomNumber: string | null
    photoUrl: string | null
    employeeGroupId: string | null
    workflowGroupId: string | null
    activityGroupId: string | null
    defaultOrderId: string | null
    defaultActivityId: string | null
    partTimePercent: Prisma.Decimal | null
    dailyTargetHours: Prisma.Decimal | null
    weeklyTargetHours: Prisma.Decimal | null
    monthlyTargetHours: Prisma.Decimal | null
    annualTargetHours: Prisma.Decimal | null
    workDaysPerWeek: Prisma.Decimal | null
    calculationStartDate: Date | null
    deletedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: EMP_ID,
    tenantId: TENANT_ID,
    personnelNumber: "EMP001",
    pin: "1",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    entryDate: new Date("2025-01-01"),
    exitDate: null,
    departmentId: null,
    costCenterId: null,
    employmentTypeId: null,
    locationId: null,
    tariffId: null,
    weeklyHours: new Prisma.Decimal(40.0),
    vacationDaysPerYear: new Prisma.Decimal(30.0),
    isActive: true,
    disabilityFlag: false,
    exitReason: null,
    notes: null,
    addressStreet: null,
    addressZip: null,
    addressCity: null,
    addressCountry: null,
    birthDate: null,
    gender: null,
    nationality: null,
    religion: null,
    maritalStatus: null,
    birthPlace: null,
    birthCountry: null,
    roomNumber: null,
    photoUrl: null,
    employeeGroupId: null,
    workflowGroupId: null,
    activityGroupId: null,
    defaultOrderId: null,
    defaultActivityId: null,
    partTimePercent: null,
    dailyTargetHours: null,
    weeklyTargetHours: null,
    monthlyTargetHours: null,
    annualTargetHours: null,
    workDaysPerWeek: null,
    calculationStartDate: null,
    deletedAt: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [
    EMPLOYEES_VIEW,
    EMPLOYEES_CREATE,
    EMPLOYEES_EDIT,
    EMPLOYEES_DELETE,
  ]
) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- employees.list tests ---

describe("employees.list", () => {
  it("returns paginated employees", async () => {
    const emps = [
      makeEmployee({ id: EMP_ID }),
      makeEmployee({ id: EMP_B_ID, personnelNumber: "EMP002", firstName: "Jane" }),
    ]
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue(emps),
        count: vi.fn().mockResolvedValue(2),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.items[0]!.weeklyHours).toBe(40)
  })

  it("filters by isActive", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
    expect(findManyCall.where.isActive).toBe(true)
  })

  it("filters by departmentId", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ departmentId: DEPT_ID })
    const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
    expect(findManyCall.where.departmentId).toBe(DEPT_ID)
  })

  it("filters by locationId", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ locationId: LOC_ID })
    const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
    expect(findManyCall.where.locationId).toBe(LOC_ID)
  })

  it("searches by name", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ search: "John" })
    const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
    expect(findManyCall.where.OR).toBeDefined()
    expect(findManyCall.where.OR).toHaveLength(4)
  })

  it("excludes soft-deleted employees", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list()
    const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
    expect(findManyCall.where.deletedAt).toBeNull()
  })

  it("applies data scope (department)", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const ctx = createTestContext(mockPrisma)
    // Override user data scope
    if (ctx.user) {
      ctx.user.dataScopeType = "department"
      ctx.user.dataScopeDepartmentIds = [DEPT_ID]
    }
    const caller = createCaller(ctx)
    await caller.list()
    const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
    expect(findManyCall.where.departmentId).toEqual({ in: [DEPT_ID] })
  })

  it("applies data scope (employee)", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const ctx = createTestContext(mockPrisma)
    if (ctx.user) {
      ctx.user.dataScopeType = "employee"
      ctx.user.dataScopeEmployeeIds = [EMP_ID]
    }
    const caller = createCaller(ctx)
    await caller.list()
    const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
    expect(findManyCall.where.id).toEqual({ in: [EMP_ID] })
  })

  it("returns empty result", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })
})

// --- employees.getById tests ---

describe("employees.getById", () => {
  it("returns employee with relations", async () => {
    const emp = {
      ...makeEmployee(),
      department: { id: DEPT_ID, name: "Engineering", code: "ENG" },
      costCenter: null,
      employmentType: null,
      location: null,
      contacts: [],
      cards: [],
    }
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(emp),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: EMP_ID })
    expect(result.id).toBe(EMP_ID)
    expect(result.department?.name).toBe("Engineering")
    expect(result.contacts).toEqual([])
    expect(result.cards).toEqual([])
  })

  it("throws NOT_FOUND for missing employee", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: EMP_ID })).rejects.toThrow(
      "Employee not found"
    )
  })

  it("checks data scope (department) - rejects", async () => {
    const emp = {
      ...makeEmployee({ departmentId: "other-dept-id" }),
      department: null,
      costCenter: null,
      employmentType: null,
      location: null,
      contacts: [],
      cards: [],
    }
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(emp),
      },
    }
    const ctx = createTestContext(mockPrisma)
    if (ctx.user) {
      ctx.user.dataScopeType = "department"
      ctx.user.dataScopeDepartmentIds = [DEPT_ID]
    }
    const caller = createCaller(ctx)
    await expect(caller.getById({ id: EMP_ID })).rejects.toThrow(
      "Employee not within data scope"
    )
  })
})

// --- employees.create tests ---

describe("employees.create", () => {
  it("creates employee with all fields", async () => {
    const created = makeEmployee()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ max_pin: "1" }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      personnelNumber: "EMP001",
      firstName: "John",
      lastName: "Doe",
      entryDate: new Date("2025-01-01"),
    })
    expect(result.personnelNumber).toBe("EMP001")
    expect(result.weeklyHours).toBe(40)
  })

  it("auto-assigns PIN when not provided", async () => {
    const created = makeEmployee({ pin: "42" })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ max_pin: "42" }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      personnelNumber: "EMP001",
      firstName: "John",
      lastName: "Doe",
      entryDate: new Date("2025-01-01"),
    })
    const createCall = mockPrisma.employee.create.mock.calls[0]![0]
    expect(createCall.data.pin).toBe("42")
    expect(mockPrisma.$queryRaw).toHaveBeenCalled()
  })

  it("trims whitespace from fields", async () => {
    const created = makeEmployee()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ max_pin: "1" }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      personnelNumber: "  EMP001  ",
      firstName: "  John  ",
      lastName: "  Doe  ",
      entryDate: new Date("2025-01-01"),
    })
    const createCall = mockPrisma.employee.create.mock.calls[0]![0]
    expect(createCall.data.personnelNumber).toBe("EMP001")
    expect(createCall.data.firstName).toBe("John")
    expect(createCall.data.lastName).toBe("Doe")
  })

  it("rejects duplicate personnelNumber", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "5.0.0", meta: { target: ["personnel_number"] } }
    )
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(p2002),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ max_pin: "1" }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        personnelNumber: "EMP001",
        firstName: "John",
        lastName: "Doe",
        entryDate: new Date("2025-01-01"),
      })
    ).rejects.toThrow("Personnel number already exists")
  })

  it("rejects duplicate PIN", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "5.0.0", meta: { target: ["pin"] } }
    )
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(p2002),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ max_pin: "1" }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        personnelNumber: "EMP002",
        pin: "1",
        firstName: "Jane",
        lastName: "Doe",
        entryDate: new Date("2025-01-01"),
      })
    ).rejects.toThrow("PIN already exists")
  })

  it("validates entry date not too far in future", async () => {
    const futureDate = new Date()
    futureDate.setMonth(futureDate.getMonth() + 7)
    const mockPrisma = {
      employee: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ max_pin: "1" }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        personnelNumber: "EMP001",
        firstName: "John",
        lastName: "Doe",
        entryDate: futureDate,
      })
    ).rejects.toThrow("Entry date cannot be more than 6 months in the future")
  })

  it("validates exitDate >= entryDate", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ max_pin: "1" }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        personnelNumber: "EMP001",
        firstName: "John",
        lastName: "Doe",
        entryDate: new Date("2025-06-01"),
        exitDate: new Date("2025-01-01"),
      })
    ).rejects.toThrow("Exit date cannot be before entry date")
  })

  it("creates employee with locationId", async () => {
    const created = makeEmployee({ locationId: LOC_ID })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ max_pin: "1" }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      personnelNumber: "EMP001",
      firstName: "John",
      lastName: "Doe",
      entryDate: new Date("2025-01-01"),
      locationId: LOC_ID,
    })
    expect(result.locationId).toBe(LOC_ID)
    const createCall = mockPrisma.employee.create.mock.calls[0]![0]
    expect(createCall.data.locationId).toBe(LOC_ID)
  })

  it("creates employee without locationId (nullable)", async () => {
    const created = makeEmployee()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ max_pin: "1" }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      personnelNumber: "EMP001",
      firstName: "John",
      lastName: "Doe",
      entryDate: new Date("2025-01-01"),
    })
    expect(result.locationId).toBeNull()
    const createCall = mockPrisma.employee.create.mock.calls[0]![0]
    expect(createCall.data.locationId).toBeNull()
  })

  it("converts Decimal fields", async () => {
    const created = makeEmployee({
      weeklyHours: new Prisma.Decimal(35),
      vacationDaysPerYear: new Prisma.Decimal(25),
    })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ max_pin: "1" }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      personnelNumber: "EMP001",
      firstName: "John",
      lastName: "Doe",
      entryDate: new Date("2025-01-01"),
      weeklyHours: 35,
      vacationDaysPerYear: 25,
    })
    expect(result.weeklyHours).toBe(35)
    expect(result.vacationDaysPerYear).toBe(25)
  })
})

// --- employees.update tests ---

describe("employees.update", () => {
  it("performs partial update", async () => {
    const existing = makeEmployee()
    const updated = makeEmployee({ firstName: "Jane" })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: EMP_ID, firstName: "Jane" })
    expect(result.firstName).toBe("Jane")
  })

  it("updates locationId", async () => {
    const existing = makeEmployee()
    const updated = makeEmployee({ locationId: LOC_ID })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: EMP_ID, locationId: LOC_ID })
    expect(result.locationId).toBe(LOC_ID)
    const updateCall = mockPrisma.employee.updateMany.mock.calls[0]![0]
    expect(updateCall.data.locationId).toBe(LOC_ID)
  })

  it("clears locationId with clear flag", async () => {
    const existing = makeEmployee({ locationId: LOC_ID })
    const updated = makeEmployee({ locationId: null })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({ id: EMP_ID, clearLocationId: true })
    const updateCall = mockPrisma.employee.updateMany.mock.calls[0]![0]
    expect(updateCall.data.locationId).toBeNull()
  })

  it("clears nullable FK with clear flag", async () => {
    const existing = makeEmployee({ departmentId: DEPT_ID })
    const updated = makeEmployee({ departmentId: null })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({ id: EMP_ID, clearDepartmentId: true })
    const updateCall = mockPrisma.employee.updateMany.mock.calls[0]![0]
    expect(updateCall.data.departmentId).toBeNull()
  })

  it("rejects duplicate personnelNumber on change", async () => {
    const existing = makeEmployee({ personnelNumber: "OLD" })
    const conflict = makeEmployee({
      id: EMP_B_ID,
      personnelNumber: "NEW",
    })
    const mockPrisma = {
      employee: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflict),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: EMP_ID, personnelNumber: "NEW" })
    ).rejects.toThrow("Personnel number already exists")
  })

  it("checks data scope on update", async () => {
    const existing = makeEmployee({ departmentId: "other-dept-id" })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const ctx = createTestContext(mockPrisma)
    if (ctx.user) {
      ctx.user.dataScopeType = "department"
      ctx.user.dataScopeDepartmentIds = [DEPT_ID]
    }
    const caller = createCaller(ctx)
    await expect(
      caller.update({ id: EMP_ID, firstName: "Jane" })
    ).rejects.toThrow("Employee not within data scope")
  })

  it("validates dates on update", async () => {
    const existing = makeEmployee({ entryDate: new Date("2025-06-01") })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: EMP_ID, exitDate: new Date("2025-01-01") })
    ).rejects.toThrow("Exit date cannot be before entry date")
  })

  it("throws NOT_FOUND for missing employee", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: EMP_ID, firstName: "Jane" })
    ).rejects.toThrow("Employee not found")
  })
})

// --- employees.delete tests ---

describe("employees.delete", () => {
  it("deactivates employee (sets isActive=false, exitDate)", async () => {
    const existing = makeEmployee()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ ...existing, isActive: false }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: EMP_ID })
    expect(result.success).toBe(true)
    const updateCall = mockPrisma.employee.updateMany.mock.calls[0]![0]
    expect(updateCall.data.isActive).toBe(false)
    expect(updateCall.data.exitDate).toBeDefined()
  })

  it("preserves existing exitDate on deactivation", async () => {
    const existingDate = new Date("2025-06-01")
    const existing = makeEmployee({ exitDate: existingDate })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ ...existing, isActive: false }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.delete({ id: EMP_ID })
    const updateCall = mockPrisma.employee.updateMany.mock.calls[0]![0]
    expect(updateCall.data.exitDate).toEqual(existingDate)
  })

  it("throws NOT_FOUND for missing employee", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: EMP_ID })).rejects.toThrow(
      "Employee not found"
    )
  })

  it("checks data scope on delete", async () => {
    const existing = makeEmployee({ departmentId: "other-dept-id" })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const ctx = createTestContext(mockPrisma)
    if (ctx.user) {
      ctx.user.dataScopeType = "department"
      ctx.user.dataScopeDepartmentIds = [DEPT_ID]
    }
    const caller = createCaller(ctx)
    await expect(caller.delete({ id: EMP_ID })).rejects.toThrow(
      "Employee not within data scope"
    )
  })
})

// --- employees.search tests ---

describe("employees.search", () => {
  it("returns matching employees", async () => {
    const emps = [
      {
        id: EMP_ID,
        personnelNumber: "EMP001",
        firstName: "John",
        lastName: "Doe",
      },
    ]
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue(emps),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.search({ query: "John" })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.firstName).toBe("John")
  })

  it("limits to 20 results", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.search({ query: "test" })
    const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
    expect(findManyCall.take).toBe(20)
  })
})

// --- employees.bulkAssignTariff tests ---

describe("employees.bulkAssignTariff", () => {
  const TARIFF_ID = "a0000000-0000-4000-a000-000000000900"

  it("updates multiple employees", async () => {
    const emp1 = makeEmployee({ id: EMP_ID })
    const emp2 = makeEmployee({ id: EMP_B_ID })
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([emp1, emp2]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.bulkAssignTariff({
      employeeIds: [EMP_ID, EMP_B_ID],
      tariffId: TARIFF_ID,
    })
    expect(result.updated).toBe(2)
    expect(result.skipped).toBe(0)
  })

  it("skips scope-restricted employees", async () => {
    const emp1 = makeEmployee({ id: EMP_ID, departmentId: DEPT_ID })
    const emp2 = makeEmployee({
      id: EMP_B_ID,
      departmentId: "other-dept-id",
    })
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([emp1, emp2]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const ctx = createTestContext(mockPrisma)
    if (ctx.user) {
      ctx.user.dataScopeType = "department"
      ctx.user.dataScopeDepartmentIds = [DEPT_ID]
    }
    const caller = createCaller(ctx)
    const result = await caller.bulkAssignTariff({
      employeeIds: [EMP_ID, EMP_B_ID],
      tariffId: TARIFF_ID,
    })
    expect(result.updated).toBe(1)
    expect(result.skipped).toBe(1)
  })

  it("skips employees not found", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.bulkAssignTariff({
      employeeIds: [EMP_ID],
      tariffId: TARIFF_ID,
    })
    expect(result.updated).toBe(0)
    expect(result.skipped).toBe(1)
  })
})
