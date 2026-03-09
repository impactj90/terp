import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeeCappingExceptionsRouter } from "../routers/employeeCappingExceptions"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EXCEPTION_ID = "a0000000-0000-4000-a000-000000000c00"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000000c01"
const RULE_ID = "a0000000-0000-4000-a000-000000000c02"

const createCaller = createCallerFactory(employeeCappingExceptionsRouter)

// --- Helpers ---

function makeException(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    cappingRuleId: string
    exemptionType: string
    retainDays: number | null
    year: number | null
    notes: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: EXCEPTION_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    cappingRuleId: RULE_ID,
    exemptionType: "full",
    retainDays: null,
    year: 2025,
    notes: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([VACATION_CONFIG_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- employeeCappingExceptions.list tests ---

describe("employeeCappingExceptions.list", () => {
  it("returns all exceptions for tenant", async () => {
    const items = [makeException()]
    const mockPrisma = {
      employeeCappingException: {
        findMany: vi.fn().mockResolvedValue(items),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(1)
    expect(mockPrisma.employeeCappingException.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { createdAt: "desc" },
    })
  })

  it("filters by employeeId", async () => {
    const mockPrisma = {
      employeeCappingException: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ employeeId: EMPLOYEE_ID })
    expect(mockPrisma.employeeCappingException.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, employeeId: EMPLOYEE_ID },
      orderBy: { createdAt: "desc" },
    })
  })

  it("filters by year (includes null-year entries)", async () => {
    const mockPrisma = {
      employeeCappingException: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ year: 2025 })
    expect(mockPrisma.employeeCappingException.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        OR: [{ year: 2025 }, { year: null }],
      },
      orderBy: { createdAt: "desc" },
    })
  })
})

// --- employeeCappingExceptions.getById tests ---

describe("employeeCappingExceptions.getById", () => {
  it("returns exception by id", async () => {
    const item = makeException()
    const mockPrisma = {
      employeeCappingException: {
        findFirst: vi.fn().mockResolvedValue(item),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: EXCEPTION_ID })
    expect(result.id).toBe(EXCEPTION_ID)
    expect(result.exemptionType).toBe("full")
  })

  it("throws NOT_FOUND for non-existent exception", async () => {
    const mockPrisma = {
      employeeCappingException: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: EXCEPTION_ID })).rejects.toThrow(
      "Employee capping exception not found"
    )
  })
})

// --- employeeCappingExceptions.create tests ---

describe("employeeCappingExceptions.create", () => {
  it("creates full exemption", async () => {
    const created = makeException()
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue({ id: RULE_ID, tenantId: TENANT_ID }),
      },
      employeeCappingException: {
        findFirst: vi.fn().mockResolvedValue(null), // uniqueness
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMPLOYEE_ID,
      cappingRuleId: RULE_ID,
      exemptionType: "full",
      year: 2025,
    })
    expect(result.exemptionType).toBe("full")
    expect(result.employeeId).toBe(EMPLOYEE_ID)
  })

  it("creates partial exemption with retainDays", async () => {
    const created = makeException({ exemptionType: "partial", retainDays: 15 })
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue({ id: RULE_ID, tenantId: TENANT_ID }),
      },
      employeeCappingException: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMPLOYEE_ID,
      cappingRuleId: RULE_ID,
      exemptionType: "partial",
      retainDays: 15,
      year: 2025,
    })
    expect(result.exemptionType).toBe("partial")
    expect(result.retainDays).toBe(15)
  })

  it("throws BAD_REQUEST for partial without retainDays", async () => {
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue({ id: RULE_ID, tenantId: TENANT_ID }),
      },
      employeeCappingException: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        cappingRuleId: RULE_ID,
        exemptionType: "partial",
        year: 2025,
      })
    ).rejects.toThrow("Retain days is required for partial exemption type")
  })

  it("throws BAD_REQUEST for invalid capping rule", async () => {
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      employeeCappingException: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        cappingRuleId: RULE_ID,
        exemptionType: "full",
        year: 2025,
      })
    ).rejects.toThrow("Capping rule not found")
  })

  it("throws CONFLICT for duplicate employee+rule+year", async () => {
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue({ id: RULE_ID, tenantId: TENANT_ID }),
      },
      employeeCappingException: {
        findFirst: vi.fn().mockResolvedValue(makeException()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        cappingRuleId: RULE_ID,
        exemptionType: "full",
        year: 2025,
      })
    ).rejects.toThrow(
      "An exception for this employee, rule, and year already exists"
    )
  })
})

// --- employeeCappingExceptions.update tests ---

describe("employeeCappingExceptions.update", () => {
  it("updates exemptionType to partial with retainDays", async () => {
    const existing = makeException()
    const updated = makeException({ exemptionType: "partial", retainDays: 10 })
    const mockPrisma = {
      employeeCappingException: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: EXCEPTION_ID,
      exemptionType: "partial",
      retainDays: 10,
    })
    expect(result.exemptionType).toBe("partial")
    expect(result.retainDays).toBe(10)
  })

  it("throws NOT_FOUND for non-existent exception", async () => {
    const mockPrisma = {
      employeeCappingException: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: EXCEPTION_ID, isActive: false })
    ).rejects.toThrow("Employee capping exception not found")
  })

  it("throws BAD_REQUEST when changing to partial without retainDays", async () => {
    const existing = makeException({ exemptionType: "full", retainDays: null })
    const mockPrisma = {
      employeeCappingException: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: EXCEPTION_ID, exemptionType: "partial" })
    ).rejects.toThrow("Retain days is required for partial exemption type")
  })
})

// --- employeeCappingExceptions.delete tests ---

describe("employeeCappingExceptions.delete", () => {
  it("deletes exception successfully", async () => {
    const existing = makeException()
    const mockPrisma = {
      employeeCappingException: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: EXCEPTION_ID })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for non-existent exception", async () => {
    const mockPrisma = {
      employeeCappingException: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: EXCEPTION_ID })).rejects.toThrow(
      "Employee capping exception not found"
    )
  })
})
