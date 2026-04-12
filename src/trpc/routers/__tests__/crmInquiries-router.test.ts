import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmInquiriesRouter } from "../crm/inquiries"
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
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

// Mock order-service to avoid its internal complexity
vi.mock("@/lib/services/order-service", () => ({
  create: vi.fn().mockImplementation(async (_p: unknown, _t: unknown, input: { code: string; name: string }) => ({
    id: "d0000000-0000-4000-a000-000000000001",
    code: input.code,
    name: input.name,
  })),
  update: vi.fn().mockResolvedValue({}),
}))

// --- Constants ---
const INQ_VIEW = permissionIdByKey("crm_inquiries.view")!
const INQ_CREATE = permissionIdByKey("crm_inquiries.create")!
const INQ_EDIT = permissionIdByKey("crm_inquiries.edit")!
const INQ_DELETE = permissionIdByKey("crm_inquiries.delete")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CONTACT_ID = "c0000000-0000-4000-a000-000000000001"
const INQUIRY_ID = "c5000000-0000-4000-a000-000000000099"
const ORDER_ID = "d0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(crmInquiriesRouter)

// --- Helpers ---

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [INQ_VIEW, INQ_CREATE, INQ_EDIT, INQ_DELETE]
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
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

const mockContact = {
  id: CONTACT_ID,
  tenantId: TENANT_ID,
  addressId: ADDRESS_ID,
  firstName: "Max",
  lastName: "Mustermann",
}

const mockInquiry = {
  id: INQUIRY_ID,
  tenantId: TENANT_ID,
  number: "V-1",
  title: "Test Inquiry",
  addressId: ADDRESS_ID,
  contactId: CONTACT_ID,
  status: "OPEN",
  effort: "medium",
  creditRating: null,
  notes: null,
  orderId: null,
  closedAt: null,
  closedById: null,
  closingReason: null,
  closingRemarks: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  address: mockAddress,
  contact: mockContact,
  order: null,
  correspondences: [],
}

// --- crm.inquiries.list tests ---

describe("crm.inquiries.list", () => {
  it("returns paginated list", async () => {
    const prisma = {
      crmInquiry: {
        findMany: vi.fn().mockResolvedValue([mockInquiry]),
        count: vi.fn().mockResolvedValue(1),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.items[0]!.title).toBe("Test Inquiry")
  })

  it("requires crm_inquiries.view permission", async () => {
    const prisma = {
      crmInquiry: {
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
      crmInquiry: {
        findMany: vi.fn().mockResolvedValue([mockInquiry]),
        count: vi.fn().mockResolvedValue(1),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await caller.list({ page: 1, pageSize: 10, status: "OPEN" })

    expect(prisma.crmInquiry.findMany).toHaveBeenCalled()
    const callArgs = prisma.crmInquiry.findMany.mock.calls[0]![0]
    expect(callArgs.where.status).toBe("OPEN")
  })

  it("filters by addressId", async () => {
    const prisma = {
      crmInquiry: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await caller.list({ page: 1, pageSize: 10, addressId: ADDRESS_ID })

    const callArgs = prisma.crmInquiry.findMany.mock.calls[0]![0]
    expect(callArgs.where.addressId).toBe(ADDRESS_ID)
  })

  it("searches by title substring", async () => {
    const prisma = {
      crmInquiry: {
        findMany: vi.fn().mockResolvedValue([mockInquiry]),
        count: vi.fn().mockResolvedValue(1),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await caller.list({ page: 1, pageSize: 10, search: "Test" })

    const callArgs = prisma.crmInquiry.findMany.mock.calls[0]![0]
    expect(callArgs.where.OR).toBeDefined()
    expect(callArgs.where.OR).toEqual([
      { title: { contains: "Test", mode: "insensitive" } },
      { number: { contains: "Test", mode: "insensitive" } },
    ])
  })
})

// --- crm.inquiries.getById tests ---

describe("crm.inquiries.getById", () => {
  it("returns single inquiry with relations", async () => {
    const prisma = {
      crmInquiry: {
        findFirst: vi.fn().mockResolvedValue(mockInquiry),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getById({ id: INQUIRY_ID })

    expect(result.title).toBe("Test Inquiry")
    expect(result.address?.company).toBe("Test GmbH")
  })

  it("throws NOT_FOUND for missing inquiry", async () => {
    const prisma = {
      crmInquiry: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }

    const caller = createCaller(createTestContext(prisma))

    await expect(
      caller.getById({ id: INQUIRY_ID })
    ).rejects.toThrow("CRM inquiry not found")
  })
})

// --- crm.inquiries.create tests ---

describe("crm.inquiries.create", () => {
  it("creates inquiry with auto-generated number", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(mockAddress),
      },
      crmContact: {
        findFirst: vi.fn().mockResolvedValue(mockContact),
      },
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({ prefix: "V-", nextValue: 2 }),
      },
      crmInquiry: {
        create: vi.fn().mockResolvedValue(mockInquiry),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      title: "Test Inquiry",
      addressId: ADDRESS_ID,
      contactId: CONTACT_ID,
    })

    expect(result.id).toBe(INQUIRY_ID)
    expect(prisma.crmInquiry.create).toHaveBeenCalled()
  })

  it("requires crm_inquiries.create permission", async () => {
    const prisma = {
      crmAddress: {},
      crmInquiry: {},
    }

    const caller = createCaller(createTestContext(prisma, [INQ_VIEW]))

    await expect(
      caller.create({
        title: "Test",
        addressId: ADDRESS_ID,
      })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("validates addressId belongs to tenant", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      crmInquiry: {},
    }

    const caller = createCaller(createTestContext(prisma))

    await expect(
      caller.create({
        title: "Test",
        addressId: ADDRESS_ID,
      })
    ).rejects.toThrow("Address not found in this tenant")
  })
})

// --- crm.inquiries.update tests ---

describe("crm.inquiries.update", () => {
  it("updates existing inquiry", async () => {
    const updated = { ...mockInquiry, title: "Updated", status: "IN_PROGRESS" }
    const prisma = {
      crmInquiry: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockInquiry)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.update({ id: INQUIRY_ID, title: "Updated" })

    expect(result!.title).toBe("Updated")
  })

  it("requires crm_inquiries.edit permission", async () => {
    const prisma = { crmInquiry: {} }
    const caller = createCaller(createTestContext(prisma, [INQ_VIEW]))

    await expect(
      caller.update({ id: INQUIRY_ID, title: "Updated" })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("rejects when closed", async () => {
    const closedInquiry = { ...mockInquiry, status: "CLOSED" }
    const prisma = {
      crmInquiry: {
        findFirst: vi.fn().mockResolvedValue(closedInquiry),
      },
    }

    const caller = createCaller(createTestContext(prisma))

    await expect(
      caller.update({ id: INQUIRY_ID, title: "Updated" })
    ).rejects.toThrow("Cannot update a closed inquiry")
  })
})

// --- crm.inquiries.close tests ---

describe("crm.inquiries.close", () => {
  it("sets closedAt and status", async () => {
    const closedResult = { ...mockInquiry, status: "CLOSED" }
    const prisma = {
      crmInquiry: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...mockInquiry, status: "IN_PROGRESS" })
          .mockResolvedValueOnce(closedResult),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.close({
      id: INQUIRY_ID,
      closingReason: "Auftrag erteilt",
    })

    expect(result!.status).toBe("CLOSED")
  })

  it("rejects double-close", async () => {
    const closedInquiry = { ...mockInquiry, status: "CLOSED" }
    const prisma = {
      crmInquiry: {
        findFirst: vi.fn().mockResolvedValue(closedInquiry),
      },
    }

    const caller = createCaller(createTestContext(prisma))

    await expect(
      caller.close({ id: INQUIRY_ID })
    ).rejects.toThrow("Inquiry is already closed")
  })
})

// --- crm.inquiries.cancel tests ---

describe("crm.inquiries.cancel", () => {
  it("sets status to CANCELLED", async () => {
    const cancelledResult = { ...mockInquiry, status: "CANCELLED" }
    const prisma = {
      crmInquiry: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockInquiry)
          .mockResolvedValueOnce(cancelledResult),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.cancel({ id: INQUIRY_ID })

    expect(result!.status).toBe("CANCELLED")
  })
})

// --- crm.inquiries.reopen tests ---

describe("crm.inquiries.reopen", () => {
  it("reopens closed inquiry", async () => {
    const reopenedResult = { ...mockInquiry, status: "IN_PROGRESS" }
    const prisma = {
      crmInquiry: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...mockInquiry, status: "CLOSED" })
          .mockResolvedValueOnce(reopenedResult),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.reopen({ id: INQUIRY_ID })

    expect(result!.status).toBe("IN_PROGRESS")
  })
})

// --- crm.inquiries.createOrder tests ---

describe("crm.inquiries.createOrder", () => {
  it("creates linked Terp order", async () => {
    const resultInquiry = { ...mockInquiry, orderId: ORDER_ID, status: "IN_PROGRESS" }
    const prisma = {
      crmInquiry: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockInquiry)
          .mockResolvedValueOnce(resultInquiry),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.createOrder({ id: INQUIRY_ID })

    expect(result!.orderId).toBe(ORDER_ID)
  })

  it("requires crm_inquiries.edit permission", async () => {
    const prisma = { crmInquiry: {} }
    const caller = createCaller(createTestContext(prisma, [INQ_VIEW]))

    await expect(
      caller.createOrder({ id: INQUIRY_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.inquiries.linkOrder tests ---

describe("crm.inquiries.linkOrder", () => {
  it("links existing order", async () => {
    const linkedInquiry = { ...mockInquiry, orderId: ORDER_ID }
    const prisma = {
      crmInquiry: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockInquiry)
          .mockResolvedValueOnce(linkedInquiry),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        findFirst: vi.fn().mockResolvedValue({ id: ORDER_ID, tenantId: TENANT_ID }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.linkOrder({ id: INQUIRY_ID, orderId: ORDER_ID })

    expect(result!.orderId).toBe(ORDER_ID)
  })
})

// --- crm.inquiries.delete tests ---

describe("crm.inquiries.delete", () => {
  it("deletes inquiry and returns success", async () => {
    const prisma = {
      crmCorrespondence: {
        count: vi.fn().mockResolvedValue(0),
      },
      crmInquiry: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.delete({ id: INQUIRY_ID })

    expect(result.success).toBe(true)
  })

  it("requires crm_inquiries.delete permission", async () => {
    const prisma = { crmInquiry: {}, crmCorrespondence: {} }
    const caller = createCaller(createTestContext(prisma, [INQ_VIEW]))

    await expect(
      caller.delete({ id: INQUIRY_ID })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("rejects when linked records exist", async () => {
    const prisma = {
      crmCorrespondence: {
        count: vi.fn().mockResolvedValue(3),
      },
      crmInquiry: {},
    }

    const caller = createCaller(createTestContext(prisma))

    await expect(
      caller.delete({ id: INQUIRY_ID })
    ).rejects.toThrow("Cannot delete inquiry with linked correspondence entries")
  })
})
