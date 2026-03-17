import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingServiceCasesRouter } from "../billing/serviceCases"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "mock", module: "billing" }),
    },
  },
}))

const SC_VIEW = permissionIdByKey("billing_service_cases.view")!
const SC_CREATE = permissionIdByKey("billing_service_cases.create")!
const SC_EDIT = permissionIdByKey("billing_service_cases.edit")!
const SC_DELETE = permissionIdByKey("billing_service_cases.delete")!
const ALL_PERMS = [SC_VIEW, SC_CREATE, SC_EDIT, SC_DELETE]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CASE_ID = "d0000000-0000-4000-a000-000000000010"
const INVOICE_ID = "d0000000-0000-4000-a000-000000000020"

const createCaller = createCallerFactory(billingServiceCasesRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi
      .fn()
      .mockResolvedValue({ id: "mock", module: "billing" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = ALL_PERMS
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createTestContext(prisma, [])
}

const mockAddress = {
  id: ADDRESS_ID,
  tenantId: TENANT_ID,
  company: "Test GmbH",
}

const mockServiceCase = {
  id: CASE_ID,
  tenantId: TENANT_ID,
  number: "KD-1",
  title: "Heizungsreparatur",
  addressId: ADDRESS_ID,
  status: "OPEN",
  reportedAt: new Date(),
  customerNotifiedCost: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  address: mockAddress,
  contact: null,
  inquiry: null,
  assignedTo: null,
  order: null,
  invoiceDocument: null,
}

const mockClosedCase = {
  ...mockServiceCase,
  status: "CLOSED",
  closingReason: "Done",
  closedAt: new Date(),
  closedById: USER_ID,
}

describe("billing.serviceCases.list", () => {
  it("returns paginated list", async () => {
    const prisma = {
      billingServiceCase: {
        findMany: vi.fn().mockResolvedValue([mockServiceCase]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it("requires billing_service_cases.view permission", async () => {
    const prisma = {
      billingServiceCase: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createNoPermContext(prisma))
    await expect(
      caller.list({ page: 1, pageSize: 10 })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("filters by status", async () => {
    const prisma = {
      billingServiceCase: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await caller.list({ status: "OPEN", page: 1, pageSize: 10 })
    expect(prisma.billingServiceCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "OPEN" }),
      })
    )
  })
})

describe("billing.serviceCases.getById", () => {
  it("returns service case with relations", async () => {
    const prisma = {
      billingServiceCase: {
        findFirst: vi.fn().mockResolvedValue(mockServiceCase),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getById({ id: CASE_ID })
    expect(result.id).toBe(CASE_ID)
  })

  it("throws NOT_FOUND for missing case", async () => {
    const prisma = {
      billingServiceCase: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await expect(caller.getById({ id: CASE_ID })).rejects.toThrow()
  })
})

describe("billing.serviceCases.create", () => {
  it("creates with auto-generated number", async () => {
    const prisma = {
      crmAddress: { findFirst: vi.fn().mockResolvedValue(mockAddress) },
      billingServiceCase: {
        create: vi.fn().mockResolvedValue(mockServiceCase),
      },
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({ prefix: "KD-", nextValue: 2 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      title: "Heizungsreparatur",
      addressId: ADDRESS_ID,
    })
    expect(result.number).toBe("KD-1")
  })

  it("requires billing_service_cases.create permission", async () => {
    const prisma = {
      crmAddress: { findFirst: vi.fn().mockResolvedValue(mockAddress) },
    }
    const caller = createCaller(createTestContext(prisma, [SC_VIEW]))
    await expect(
      caller.create({ title: "Test", addressId: ADDRESS_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.serviceCases.close", () => {
  it("sets status and closing reason", async () => {
    const prisma = {
      billingServiceCase: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(mockServiceCase)
          .mockResolvedValueOnce(mockClosedCase),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.close({
      id: CASE_ID,
      closingReason: "Done",
    })
    expect(result?.status).toBe("CLOSED")
  })

  it("requires billing_service_cases.edit permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, [SC_VIEW]))
    await expect(
      caller.close({ id: CASE_ID, closingReason: "Done" })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.serviceCases.createInvoice", () => {
  it("creates linked invoice document", async () => {
    const prisma = {
      billingServiceCase: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(mockClosedCase)
          .mockResolvedValueOnce({ ...mockClosedCase, status: "INVOICED", invoiceDocumentId: INVOICE_ID }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      crmAddress: { findFirst: vi.fn().mockResolvedValue(mockAddress) },
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({ prefix: "RE-", nextValue: 2 }),
      },
      billingDocument: {
        create: vi.fn().mockResolvedValue({
          id: INVOICE_ID,
          type: "INVOICE",
          number: "RE-1",
          status: "DRAFT",
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: INVOICE_ID,
          tenantId: TENANT_ID,
          status: "DRAFT",
          positions: [],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      billingDocumentPosition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.createInvoice({
      id: CASE_ID,
      positions: [{ description: "Arbeitszeit", quantity: 2, unitPrice: 85, vatRate: 19 }],
    })
    expect(result?.status).toBe("INVOICED")
  })

  it("requires billing_service_cases.edit permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, [SC_VIEW]))
    await expect(
      caller.createInvoice({
        id: CASE_ID,
        positions: [{ description: "Test" }],
      })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.serviceCases.delete", () => {
  it("deletes OPEN service case", async () => {
    const prisma = {
      billingServiceCase: {
        findFirst: vi.fn().mockResolvedValue(mockServiceCase),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.delete({ id: CASE_ID })
    expect(result).toEqual({ success: true })
  })

  it("requires billing_service_cases.delete permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, [SC_VIEW]))
    await expect(
      caller.delete({ id: CASE_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})
