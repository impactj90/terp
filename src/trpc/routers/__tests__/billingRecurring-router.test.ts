import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingRecurringInvoicesRouter } from "../billing/recurringInvoices"
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

const REC_VIEW = permissionIdByKey("billing_recurring.view")!
const REC_MANAGE = permissionIdByKey("billing_recurring.manage")!
const REC_GENERATE = permissionIdByKey("billing_recurring.generate")!
const ALL_PERMS = [REC_VIEW, REC_MANAGE, REC_GENERATE]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const REC_ID = "d0000000-0000-4000-a000-000000000010"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const DOC_ID = "e0000000-0000-4000-a000-000000000010"

const createCaller = createCallerFactory(billingRecurringInvoicesRouter)

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

const mockTemplate = {
  id: REC_ID,
  tenantId: TENANT_ID,
  name: "Wartungsvertrag Monatlich",
  addressId: ADDRESS_ID,
  contactId: null,
  interval: "MONTHLY",
  startDate: new Date("2026-01-01"),
  endDate: null,
  nextDueDate: new Date("2026-03-01"),
  lastGeneratedAt: null,
  autoGenerate: false,
  isActive: true,
  deliveryType: null,
  deliveryTerms: null,
  paymentTermDays: 30,
  discountPercent: null,
  discountDays: null,
  notes: null,
  internalNotes: null,
  positionTemplate: [
    { type: "FREE", description: "Wartung", quantity: 1, unit: "Stk", unitPrice: 500, vatRate: 19 },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  address: { id: ADDRESS_ID, company: "Firma A", number: "K-1" },
  contact: null,
}

describe("billing.recurringInvoices.list", () => {
  it("returns paginated list", async () => {
    const prisma = {
      billingRecurringInvoice: {
        findMany: vi.fn().mockResolvedValue([mockTemplate]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it("requires billing_recurring.view permission", async () => {
    const caller = createCaller(createNoPermContext({}))
    await expect(caller.list({ page: 1, pageSize: 10 })).rejects.toThrow(
      "Insufficient permissions"
    )
  })

  it("requires billing module enabled", async () => {
    const ctx = createMockContext({
      prisma: {
        tenantModule: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null), // module not enabled
        },
      } as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: "test-token",
      user: createUserWithPermissions(ALL_PERMS, {
        id: USER_ID,
        userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
      }),
      session: createMockSession(),
      tenantId: TENANT_ID,
    })
    const caller = createCaller(ctx)
    await expect(caller.list({ page: 1, pageSize: 10 })).rejects.toThrow()
  })
})

describe("billing.recurringInvoices.create", () => {
  it("creates recurring template", async () => {
    const prisma = {
      billingRecurringInvoice: {
        create: vi.fn().mockResolvedValue(mockTemplate),
      },
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue({ id: ADDRESS_ID, tenantId: TENANT_ID }),
      },
      crmContact: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      name: "Wartungsvertrag",
      addressId: ADDRESS_ID,
      interval: "MONTHLY",
      startDate: new Date("2026-04-01"),
      positionTemplate: [
        { type: "FREE", description: "Wartung", quantity: 1, unitPrice: 500, vatRate: 19 },
      ],
    })
    expect(result).toBeDefined()
    expect(result!.name).toBe("Wartungsvertrag Monatlich")
  })

  it("requires billing_recurring.manage permission", async () => {
    const caller = createCaller(createTestContext({}, [REC_VIEW]))
    await expect(
      caller.create({
        name: "Test",
        addressId: ADDRESS_ID,
        interval: "MONTHLY",
        startDate: new Date("2026-04-01"),
        positionTemplate: [{ type: "FREE", description: "X", quantity: 1, unitPrice: 10 }],
      })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.recurringInvoices.generate", () => {
  it("generates invoice from template", async () => {
    const prisma = {
      billingRecurringInvoice: {
        findFirst: vi.fn().mockResolvedValue(mockTemplate),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      billingDocument: {
        create: vi.fn().mockResolvedValue({ id: DOC_ID }),
        findFirst: vi.fn().mockResolvedValue({ id: DOC_ID, number: "RE-1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      billingDocumentPosition: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
      },
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({ prefix: "RE-", nextValue: 2 }),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txPrisma = {
          ...prisma,
          tenantModule: MODULE_MOCK.tenantModule,
        }
        return fn(txPrisma)
      }),
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.generate({ id: REC_ID })
    expect(result).toBeDefined()
  })

  it("requires billing_recurring.generate permission", async () => {
    const caller = createCaller(createTestContext({}, [REC_VIEW, REC_MANAGE]))
    await expect(caller.generate({ id: REC_ID })).rejects.toThrow(
      "Insufficient permissions"
    )
  })
})

describe("billing.recurringInvoices.generateDue", () => {
  it("processes all due templates", async () => {
    const prisma = {
      billingRecurringInvoice: {
        findFirst: vi.fn().mockResolvedValue(mockTemplate),
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.generateDue()
    expect(result).toBeDefined()
    expect(result!.generated).toBe(0)
    expect(result!.failed).toBe(0)
  })
})

describe("billing.recurringInvoices.activate/deactivate", () => {
  it("activate toggles isActive", async () => {
    const prisma = {
      billingRecurringInvoice: {
        findFirst: vi.fn().mockResolvedValue({ ...mockTemplate, isActive: false }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.activate({ id: REC_ID })
    expect(result).toBeDefined()
  })

  it("deactivate toggles isActive", async () => {
    const prisma = {
      billingRecurringInvoice: {
        findFirst: vi.fn().mockResolvedValue(mockTemplate),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.deactivate({ id: REC_ID })
    expect(result).toBeDefined()
  })
})

describe("billing.recurringInvoices.preview", () => {
  it("returns preview with totals", async () => {
    const prisma = {
      billingRecurringInvoice: {
        findFirst: vi.fn().mockResolvedValue(mockTemplate),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.preview({ id: REC_ID })
    expect(result).toBeDefined()
    expect(result!.subtotalNet).toBe(500)
    expect(result!.totalVat).toBe(95)
    expect(result!.totalGross).toBe(595)
  })
})
