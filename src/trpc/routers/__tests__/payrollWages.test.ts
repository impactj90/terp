import { describe, it, expect, vi, beforeEach } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { payrollWagesRouter } from "../payrollWages"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as service from "@/lib/services/payroll-wage-service"

vi.mock("@/lib/services/payroll-wage-service", () => ({
  listDefaults: vi.fn(),
  listForTenant: vi.fn(),
  initializeForTenant: vi.fn(),
  update: vi.fn(),
  reset: vi.fn(),
  PayrollWageNotFoundError: class extends Error {
    constructor() {
      super("Payroll wage not found")
      this.name = "PayrollWageNotFoundError"
    }
  },
  PayrollWageValidationError: class extends Error {
    constructor(m: string) {
      super(m)
      this.name = "PayrollWageValidationError"
    }
  },
}))

vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
}))

const VIEW = permissionIdByKey("personnel.payroll_data.view")!
const EDIT = permissionIdByKey("personnel.payroll_data.edit")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const WAGE_ID = "a0000000-0000-4000-a000-000000000700"

const createCaller = createCallerFactory(payrollWagesRouter)

function makeWage(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: WAGE_ID,
    tenantId: TENANT_ID,
    code: "1000",
    name: "Sollstunden",
    terpSource: "targetHours",
    category: "time",
    description: null,
    sortOrder: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

function ctx(perms: string[] = [VIEW, EDIT]) {
  return createMockContext({
    prisma: {} as never,
    authToken: "test-token",
    user: createUserWithPermissions(perms, {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("payrollWages.list", () => {
  it("returns tenant wages", async () => {
    vi.mocked(service.listForTenant).mockResolvedValue([makeWage() as never])
    const caller = createCaller(ctx())
    const result = await caller.list()
    expect(result).toHaveLength(1)
  })

  it("denies without view permission", async () => {
    const caller = createCaller(ctx([]))
    await expect(caller.list()).rejects.toThrow()
  })
})

describe("payrollWages.listDefaults", () => {
  it("returns global defaults", async () => {
    vi.mocked(service.listDefaults).mockResolvedValue([
      {
        id: "x",
        code: "1000",
        name: "Sollstunden",
        terpSource: "targetHours",
        category: "time",
        description: null,
        sortOrder: 10,
        createdAt: new Date(),
      } as never,
    ])
    const caller = createCaller(ctx())
    const result = await caller.listDefaults()
    expect(result).toHaveLength(1)
  })
})

describe("payrollWages.initialize", () => {
  it("seeds the catalog for a tenant", async () => {
    vi.mocked(service.initializeForTenant).mockResolvedValue({ inserted: 20 })
    const caller = createCaller(ctx())
    const result = await caller.initialize()
    expect(result!.inserted).toBe(20)
    expect(service.initializeForTenant).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ userId: expect.any(String) }),
    )
  })

  it("denies without edit permission", async () => {
    const caller = createCaller(ctx([VIEW]))
    await expect(caller.initialize()).rejects.toThrow()
  })
})

describe("payrollWages.update", () => {
  it("updates a wage", async () => {
    vi.mocked(service.update).mockResolvedValue(
      makeWage({ name: "Renamed" }) as never,
    )
    const caller = createCaller(ctx())
    const result = await caller.update({ id: WAGE_ID, name: "Renamed" })
    expect(result!.name).toBe("Renamed")
  })

  it("returns NOT_FOUND for missing wage", async () => {
    vi.mocked(service.update).mockRejectedValue(
      new service.PayrollWageNotFoundError(),
    )
    const caller = createCaller(ctx())
    await expect(
      caller.update({ id: WAGE_ID, name: "x" }),
    ).rejects.toThrow("Payroll wage not found")
  })

  it("returns BAD_REQUEST for invalid code", async () => {
    vi.mocked(service.update).mockRejectedValue(
      new service.PayrollWageValidationError("Code must be alphanumeric"),
    )
    const caller = createCaller(ctx())
    await expect(
      caller.update({ id: WAGE_ID, code: "??" }),
    ).rejects.toThrow("Code must be alphanumeric")
  })
})

describe("payrollWages.reset", () => {
  it("resets the catalog", async () => {
    vi.mocked(service.reset).mockResolvedValue({
      deleted: 20,
      inserted: 20,
    })
    const caller = createCaller(ctx())
    const result = await caller.reset()
    expect(result!.deleted).toBe(20)
    expect(result!.inserted).toBe(20)
  })

  it("denies without edit permission", async () => {
    const caller = createCaller(ctx([VIEW]))
    await expect(caller.reset()).rejects.toThrow()
  })
})
