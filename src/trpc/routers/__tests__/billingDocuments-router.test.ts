import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingDocumentsRouter } from "../billing/documents"
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

const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
const BILLING_CREATE = permissionIdByKey("billing_documents.create")!
const BILLING_EDIT = permissionIdByKey("billing_documents.edit")!
const BILLING_DELETE = permissionIdByKey("billing_documents.delete")!
const BILLING_FINALIZE = permissionIdByKey("billing_documents.finalize")!
const ALL_PERMS = [BILLING_VIEW, BILLING_CREATE, BILLING_EDIT, BILLING_DELETE, BILLING_FINALIZE]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const DOC_ID = "d0000000-0000-4000-a000-000000000001"
const POS_ID = "e0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(billingDocumentsRouter)

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
  paymentTermDays: 30,
  discountPercent: 2.0,
  discountDays: 10,
}

const mockDocument = {
  id: DOC_ID,
  tenantId: TENANT_ID,
  number: "A-1",
  type: "OFFER",
  status: "DRAFT",
  addressId: ADDRESS_ID,
  subtotalNet: 0,
  totalVat: 0,
  totalGross: 0,
  documentDate: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  positions: [],
  address: mockAddress,
  contact: null,
  deliveryAddress: null,
  invoiceAddress: null,
  inquiry: null,
  order: null,
  parentDocument: null,
  childDocuments: [],
}

const mockPosition = {
  id: POS_ID,
  documentId: DOC_ID,
  sortOrder: 1,
  type: "FREE",
  description: "Test",
  quantity: 10,
  unitPrice: 5,
  flatCosts: null,
  totalPrice: 50,
  vatRate: 19,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("billing.documents.list", () => {
  it("returns paginated list", async () => {
    const prisma = {
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([mockDocument]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it("requires billing_documents.view permission", async () => {
    const prisma = {
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createNoPermContext(prisma))
    await expect(
      caller.list({ page: 1, pageSize: 10 })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("filters by type", async () => {
    const prisma = {
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await caller.list({ type: "OFFER", page: 1, pageSize: 10 })
    expect(prisma.billingDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "OFFER" }),
      })
    )
  })
})

describe("billing.documents.getById", () => {
  it("returns document with positions", async () => {
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockDocument),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getById({ id: DOC_ID })
    expect(result.id).toBe(DOC_ID)
  })

  it("throws NOT_FOUND for missing document", async () => {
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await expect(caller.getById({ id: DOC_ID })).rejects.toThrow()
  })
})

describe("billing.documents.create", () => {
  it("creates DRAFT document with auto number", async () => {
    const prisma = {
      crmAddress: { findFirst: vi.fn().mockResolvedValue(mockAddress) },
      billingDocument: {
        create: vi.fn().mockResolvedValue(mockDocument),
      },
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({ prefix: "A-", nextValue: 2 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      type: "OFFER",
      addressId: ADDRESS_ID,
    })
    expect(result.number).toBe("A-1")
  })

  it("requires billing_documents.create permission", async () => {
    const prisma = {
      crmAddress: { findFirst: vi.fn().mockResolvedValue(mockAddress) },
    }
    const caller = createCaller(
      createTestContext(prisma, [BILLING_VIEW])
    )
    await expect(
      caller.create({ type: "OFFER", addressId: ADDRESS_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.documents.update", () => {
  it("updates draft document", async () => {
    const prisma = {
      billingDocument: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(mockDocument)
          .mockResolvedValueOnce({ ...mockDocument, notes: "Updated" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.update({ id: DOC_ID, notes: "Updated" })
    expect(result?.notes).toBe("Updated")
  })

  it("requires billing_documents.edit permission", async () => {
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockDocument),
      },
    }
    const caller = createCaller(
      createTestContext(prisma, [BILLING_VIEW])
    )
    await expect(
      caller.update({ id: DOC_ID, notes: "test" })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.documents.delete", () => {
  it("deletes draft document", async () => {
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockDocument),
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.delete({ id: DOC_ID })
    expect(result).toEqual({ success: true })
  })

  it("requires billing_documents.delete permission", async () => {
    const prisma = {}
    const caller = createCaller(
      createTestContext(prisma, [BILLING_VIEW])
    )
    await expect(
      caller.delete({ id: DOC_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.documents.finalize", () => {
  it("sets status to PRINTED", async () => {
    const docWithPositions = { ...mockDocument, positions: [mockPosition] }
    const prisma = {
      billingDocument: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(docWithPositions)
          .mockResolvedValueOnce({ ...docWithPositions, status: "PRINTED" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.finalize({ id: DOC_ID })
    expect(result?.status).toBe("PRINTED")
  })

  it("requires billing_documents.finalize permission", async () => {
    const prisma = {}
    const caller = createCaller(
      createTestContext(prisma, [BILLING_VIEW])
    )
    await expect(
      caller.finalize({ id: DOC_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.documents.forward", () => {
  it("creates child document with correct type", async () => {
    const printedOffer = {
      ...mockDocument,
      status: "PRINTED",
      positions: [mockPosition],
    }
    const prisma = {
      billingDocument: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(printedOffer)
          .mockResolvedValueOnce({ ...printedOffer, status: "FORWARDED" })
          .mockResolvedValueOnce({
            ...mockDocument,
            type: "ORDER_CONFIRMATION",
            parentDocumentId: DOC_ID,
          }),
        create: vi.fn().mockResolvedValue({
          ...mockDocument,
          id: "new-doc-id",
          type: "ORDER_CONFIRMATION",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      billingDocumentPosition: {
        findMany: vi.fn().mockResolvedValue([mockPosition]),
        create: vi.fn().mockResolvedValue({}),
      },
      numberSequence: {
        upsert: vi
          .fn()
          .mockResolvedValue({ prefix: "AB-", nextValue: 2 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.forward({
      id: DOC_ID,
      targetType: "ORDER_CONFIRMATION",
    })
    expect(result?.type).toBe("ORDER_CONFIRMATION")
  })

  it("rejects invalid type transition", async () => {
    const printedInvoice = {
      ...mockDocument,
      type: "INVOICE",
      status: "PRINTED",
      positions: [mockPosition],
    }
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(printedInvoice),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await expect(
      caller.forward({ id: DOC_ID, targetType: "ORDER_CONFIRMATION" })
    ).rejects.toThrow()
  })
})

describe("billing.documents.positions.add", () => {
  it("adds position and recalculates totals", async () => {
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockDocument),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      billingDocumentPosition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(mockPosition),
        findMany: vi.fn().mockResolvedValue([mockPosition]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.positions.add({
      documentId: DOC_ID,
      type: "FREE",
      description: "Test",
      quantity: 10,
      unitPrice: 5,
      vatRate: 19,
    })
    expect(result.id).toBe(POS_ID)
  })

  it("requires billing_documents.edit permission", async () => {
    const prisma = {}
    const caller = createCaller(
      createTestContext(prisma, [BILLING_VIEW])
    )
    await expect(
      caller.positions.add({
        documentId: DOC_ID,
        type: "FREE",
      })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.documents.positions.reorder", () => {
  it("updates sort order", async () => {
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockDocument),
      },
      billingDocumentPosition: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await caller.positions.reorder({
      documentId: DOC_ID,
      positionIds: [POS_ID, "e0000000-0000-4000-a000-000000000002"],
    })
    expect(prisma.billingDocumentPosition.updateMany).toHaveBeenCalled()
  })
})
