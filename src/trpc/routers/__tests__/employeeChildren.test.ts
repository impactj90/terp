/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeeChildrenRouter } from "../employeeChildren"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as employeeChildrenService from "@/lib/services/employee-children-service"

vi.mock("@/lib/services/employee-children-service", () => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  EmployeeNotFoundError: class EmployeeNotFoundError extends Error {
    constructor() {
      super("Employee not found")
      this.name = "EmployeeNotFoundError"
    }
  },
  ChildNotFoundError: class ChildNotFoundError extends Error {
    constructor() {
      super("Employee child not found")
      this.name = "ChildNotFoundError"
    }
  },
  ChildValidationError: class ChildValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "ChildValidationError"
    }
  },
}))
vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

// --- Constants ---

const PAYROLL_VIEW = permissionIdByKey("personnel.payroll_data.view")!
const PAYROLL_EDIT = permissionIdByKey("personnel.payroll_data.edit")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMP_ID = "a0000000-0000-4000-a000-000000000500"
const CHILD_ID = "a0000000-0000-4000-a000-000000000600"

const createCaller = createCallerFactory(employeeChildrenRouter)

// --- Helpers ---

function makeChild(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    firstName: string
    lastName: string
    birthDate: Date
    taxAllowanceShare: number | null
    livesInHousehold: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: CHILD_ID,
    tenantId: TENANT_ID,
    employeeId: EMP_ID,
    firstName: "Max",
    lastName: "Mustermann",
    birthDate: new Date("2020-05-15"),
    taxAllowanceShare: null,
    livesInHousehold: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(
  mockPrisma: Record<string, unknown>,
  permissions: string[] = [PAYROLL_VIEW, PAYROLL_EDIT]
) {
  return createMockContext({
    prisma: mockPrisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- employeeChildren.list tests ---

describe("employeeChildren.list", () => {
  it("returns children for employee", async () => {
    const children = [makeChild()]
    vi.mocked(employeeChildrenService.list).mockResolvedValue(children as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result![0]!.firstName).toBe("Max")
    expect(employeeChildrenService.list).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMP_ID
    )
  })

  it("permission denied without view permission", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, []))
    await expect(
      caller.list({ employeeId: EMP_ID })
    ).rejects.toThrow()
  })
})

// --- employeeChildren.create tests ---

describe("employeeChildren.create", () => {
  it("creates child successfully", async () => {
    const created = makeChild()
    vi.mocked(employeeChildrenService.create).mockResolvedValue(created as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMP_ID,
      firstName: "Max",
      lastName: "Mustermann",
      birthDate: new Date("2020-05-15"),
    })
    expect(result!.firstName).toBe("Max")
    expect(employeeChildrenService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        employeeId: EMP_ID,
        firstName: "Max",
        lastName: "Mustermann",
      }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("validates required fields (first name)", async () => {
    vi.mocked(employeeChildrenService.create).mockRejectedValue(
      new employeeChildrenService.ChildValidationError("First name is required")
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        firstName: " ",
        lastName: "Mustermann",
        birthDate: new Date("2020-05-15"),
      })
    ).rejects.toThrow("First name is required")
  })

  it("permission denied without edit permission", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, [PAYROLL_VIEW]))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        firstName: "Max",
        lastName: "Mustermann",
        birthDate: new Date("2020-05-15"),
      })
    ).rejects.toThrow()
  })
})

// --- employeeChildren.update tests ---

describe("employeeChildren.update", () => {
  it("updates child successfully", async () => {
    const updated = makeChild({ firstName: "Moritz" })
    vi.mocked(employeeChildrenService.update).mockResolvedValue(updated as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: CHILD_ID,
      firstName: "Moritz",
    })
    expect(result!.firstName).toBe("Moritz")
    expect(employeeChildrenService.update).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CHILD_ID,
      expect.objectContaining({ firstName: "Moritz" }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("throws NOT_FOUND for missing child", async () => {
    vi.mocked(employeeChildrenService.update).mockRejectedValue(
      new employeeChildrenService.ChildNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: CHILD_ID, firstName: "Moritz" })
    ).rejects.toThrow("Employee child not found")
  })
})

// --- employeeChildren.delete tests ---

describe("employeeChildren.delete", () => {
  it("deletes child successfully", async () => {
    vi.mocked(employeeChildrenService.remove).mockResolvedValue({ success: true })
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: CHILD_ID })
    expect(result!.success).toBe(true)
    expect(employeeChildrenService.remove).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CHILD_ID,
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("throws NOT_FOUND for missing child", async () => {
    vi.mocked(employeeChildrenService.remove).mockRejectedValue(
      new employeeChildrenService.ChildNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ id: CHILD_ID })
    ).rejects.toThrow("Employee child not found")
  })
})
