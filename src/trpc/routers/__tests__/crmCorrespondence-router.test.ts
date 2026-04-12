import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmCorrespondenceRouter } from "../crm/correspondence"
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

// --- Constants ---
const CORR_VIEW = permissionIdByKey("crm_correspondence.view")!
const CORR_CREATE = permissionIdByKey("crm_correspondence.create")!
const CORR_EDIT = permissionIdByKey("crm_correspondence.edit")!
const CORR_DELETE = permissionIdByKey("crm_correspondence.delete")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CONTACT_ID = "c0000000-0000-4000-a000-000000000001"
const CORR_ID = "e0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(crmCorrespondenceRouter)

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
  permissions: string[] = [CORR_VIEW, CORR_CREATE, CORR_EDIT, CORR_DELETE]
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

const mockCorrespondence = {
  id: CORR_ID,
  tenantId: TENANT_ID,
  addressId: ADDRESS_ID,
  direction: "INCOMING",
  type: "phone",
  date: new Date("2026-03-16"),
  contactId: CONTACT_ID,
  inquiryId: null,
  fromUser: null,
  toUser: null,
  subject: "Test call",
  content: "Discussed delivery schedule",
  attachments: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  contact: {
    id: CONTACT_ID,
    firstName: "Max",
    lastName: "Mustermann",
  },
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

// --- crm.correspondence.list tests ---

describe("crm.correspondence.list", () => {
  it("returns paginated list", async () => {
    const prisma = {
      crmCorrespondence: {
        findMany: vi.fn().mockResolvedValue([mockCorrespondence]),
        count: vi.fn().mockResolvedValue(1),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.items[0]!.subject).toBe("Test call")
  })

  it("requires crm_correspondence.view permission", async () => {
    const prisma = {
      crmCorrespondence: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }

    const caller = createCaller(createNoPermContext(prisma))

    await expect(
      caller.list({ page: 1, pageSize: 10 })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("filters by direction", async () => {
    const prisma = {
      crmCorrespondence: {
        findMany: vi.fn().mockResolvedValue([mockCorrespondence]),
        count: vi.fn().mockResolvedValue(1),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await caller.list({ page: 1, pageSize: 10, direction: "INCOMING" })

    expect(prisma.crmCorrespondence.findMany).toHaveBeenCalled()
    const callArgs = prisma.crmCorrespondence.findMany.mock.calls[0]![0]
    expect(callArgs.where.direction).toBe("INCOMING")
  })

  it("filters by type", async () => {
    const prisma = {
      crmCorrespondence: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await caller.list({ page: 1, pageSize: 10, type: "email" })

    const callArgs = prisma.crmCorrespondence.findMany.mock.calls[0]![0]
    expect(callArgs.where.type).toBe("email")
  })

  it("searches by subject substring (case-insensitive)", async () => {
    const prisma = {
      crmCorrespondence: {
        findMany: vi.fn().mockResolvedValue([mockCorrespondence]),
        count: vi.fn().mockResolvedValue(1),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await caller.list({ page: 1, pageSize: 10, search: "Test" })

    const callArgs = prisma.crmCorrespondence.findMany.mock.calls[0]![0]
    expect(callArgs.where.OR).toBeDefined()
    expect(callArgs.where.OR).toEqual([
      { subject: { contains: "Test", mode: "insensitive" } },
      { content: { contains: "Test", mode: "insensitive" } },
    ])
  })

  it("filters by date range", async () => {
    const prisma = {
      crmCorrespondence: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }

    const dateFrom = new Date("2026-03-01")
    const dateTo = new Date("2026-03-31")

    const caller = createCaller(createTestContext(prisma))
    await caller.list({ page: 1, pageSize: 10, dateFrom, dateTo })

    const callArgs = prisma.crmCorrespondence.findMany.mock.calls[0]![0]
    expect(callArgs.where.date).toEqual({
      gte: dateFrom,
      lte: dateTo,
    })
  })
})

// --- crm.correspondence.getById tests ---

describe("crm.correspondence.getById", () => {
  it("returns single entry with contact details", async () => {
    const prisma = {
      crmCorrespondence: {
        findFirst: vi.fn().mockResolvedValue(mockCorrespondence),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getById({ id: CORR_ID })

    expect(result.subject).toBe("Test call")
    expect(result.contact?.firstName).toBe("Max")
  })

  it("throws NOT_FOUND for missing entry", async () => {
    const prisma = {
      crmCorrespondence: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }

    const caller = createCaller(createTestContext(prisma))

    await expect(
      caller.getById({ id: CORR_ID })
    ).rejects.toThrow("CRM correspondence not found")
  })
})

// --- crm.correspondence.create tests ---

describe("crm.correspondence.create", () => {
  it("creates entry with all fields", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(mockAddress),
      },
      crmContact: {
        findFirst: vi.fn().mockResolvedValue(mockContact),
      },
      crmCorrespondence: {
        create: vi.fn().mockResolvedValue(mockCorrespondence),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      addressId: ADDRESS_ID,
      direction: "INCOMING",
      type: "phone",
      date: new Date("2026-03-16"),
      contactId: CONTACT_ID,
      subject: "Test call",
      content: "Discussed delivery schedule",
    })

    expect(result.id).toBe(CORR_ID)
    expect(prisma.crmCorrespondence.create).toHaveBeenCalled()
  })

  it("requires crm_correspondence.create permission", async () => {
    const prisma = {
      crmAddress: {},
      crmCorrespondence: {},
    }

    const caller = createCaller(createTestContext(prisma, [CORR_VIEW]))

    await expect(
      caller.create({
        addressId: ADDRESS_ID,
        direction: "INCOMING",
        type: "phone",
        date: new Date(),
        subject: "Test",
      })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("validates addressId belongs to tenant", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      crmCorrespondence: {},
    }

    const caller = createCaller(createTestContext(prisma))

    await expect(
      caller.create({
        addressId: ADDRESS_ID,
        direction: "INCOMING",
        type: "phone",
        date: new Date(),
        subject: "Test",
      })
    ).rejects.toThrow("Address not found in this tenant")
  })
})

// --- crm.correspondence.update tests ---

describe("crm.correspondence.update", () => {
  it("updates existing entry", async () => {
    const updated = { ...mockCorrespondence, subject: "Updated" }
    const prisma = {
      crmCorrespondence: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockCorrespondence)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.update({ id: CORR_ID, subject: "Updated" })

    expect(result!.subject).toBe("Updated")
  })

  it("requires crm_correspondence.edit permission", async () => {
    const prisma = { crmCorrespondence: {} }
    const caller = createCaller(createTestContext(prisma, [CORR_VIEW]))

    await expect(
      caller.update({ id: CORR_ID, subject: "Updated" })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.correspondence.delete tests ---

describe("crm.correspondence.delete", () => {
  it("deletes entry and returns success", async () => {
    const prisma = {
      crmCorrespondence: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.delete({ id: CORR_ID })

    expect(result.success).toBe(true)
  })

  it("requires crm_correspondence.delete permission", async () => {
    const prisma = { crmCorrespondence: {} }
    const caller = createCaller(createTestContext(prisma, [CORR_VIEW]))

    await expect(
      caller.delete({ id: CORR_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})
