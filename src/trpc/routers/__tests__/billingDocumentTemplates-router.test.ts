import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingDocumentTemplatesRouter } from "../billing/documentTemplates"
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
const BILLING_EDIT = permissionIdByKey("billing_documents.edit")!
const ALL_PERMS = [BILLING_VIEW, BILLING_EDIT]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const TEMPLATE_ID = "f0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(billingDocumentTemplatesRouter)

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

const mockTemplate = {
  id: TEMPLATE_ID,
  tenantId: TENANT_ID,
  name: "Standard Angebot",
  documentType: "OFFER",
  headerText: "<p>Sehr geehrte Damen und Herren,</p>",
  footerText: "<p>Mit freundlichen Grüßen</p>",
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
}

describe("billing.documentTemplates.list", () => {
  it("returns all templates for tenant", async () => {
    const prisma = {
      billingDocumentTemplate: {
        findMany: vi.fn().mockResolvedValue([mockTemplate]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list()
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe("Standard Angebot")
  })

  it("requires billing_documents.view permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, []))
    await expect(caller.list()).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.documentTemplates.getById", () => {
  it("returns template by id", async () => {
    const prisma = {
      billingDocumentTemplate: {
        findFirst: vi.fn().mockResolvedValue(mockTemplate),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getById({ id: TEMPLATE_ID })
    expect(result.id).toBe(TEMPLATE_ID)
  })

  it("throws NOT_FOUND for missing template", async () => {
    const prisma = {
      billingDocumentTemplate: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await expect(caller.getById({ id: TEMPLATE_ID })).rejects.toThrow()
  })
})

describe("billing.documentTemplates.listByType", () => {
  it("returns templates for specific type and generic", async () => {
    const genericTemplate = { ...mockTemplate, id: "t2", documentType: null }
    const prisma = {
      billingDocumentTemplate: {
        findMany: vi.fn().mockResolvedValue([mockTemplate, genericTemplate]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.listByType({ documentType: "OFFER" })
    expect(result).toHaveLength(2)
  })
})

describe("billing.documentTemplates.getDefault", () => {
  it("returns default template for type", async () => {
    const defaultTemplate = { ...mockTemplate, isDefault: true }
    const prisma = {
      billingDocumentTemplate: {
        findFirst: vi.fn().mockResolvedValue(defaultTemplate),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getDefault({ documentType: "OFFER" })
    expect(result?.isDefault).toBe(true)
  })

  it("returns null when no default exists", async () => {
    const prisma = {
      billingDocumentTemplate: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getDefault({ documentType: "OFFER" })
    expect(result).toBeNull()
  })
})

describe("billing.documentTemplates.create", () => {
  it("creates a new template", async () => {
    const prisma = {
      billingDocumentTemplate: {
        create: vi.fn().mockResolvedValue(mockTemplate),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      name: "Standard Angebot",
      documentType: "OFFER",
      headerText: "<p>Sehr geehrte Damen und Herren,</p>",
      footerText: "<p>Mit freundlichen Grüßen</p>",
    })
    expect(result.name).toBe("Standard Angebot")
  })

  it("requires billing_documents.edit permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, [BILLING_VIEW]))
    await expect(
      caller.create({ name: "Test" })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.documentTemplates.update", () => {
  it("updates an existing template", async () => {
    const updatedTemplate = { ...mockTemplate, name: "Updated Name" }
    const prisma = {
      billingDocumentTemplate: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(mockTemplate)
          .mockResolvedValueOnce(updatedTemplate),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.update({ id: TEMPLATE_ID, name: "Updated Name" })
    expect(result?.name).toBe("Updated Name")
  })
})

describe("billing.documentTemplates.delete", () => {
  it("deletes a template", async () => {
    const prisma = {
      billingDocumentTemplate: {
        findFirst: vi.fn().mockResolvedValue(mockTemplate),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.delete({ id: TEMPLATE_ID })
    expect(result).toEqual({ success: true })
  })
})

describe("billing.documentTemplates.setDefault", () => {
  it("sets a template as default", async () => {
    const defaultTemplate = { ...mockTemplate, isDefault: true }
    const prisma = {
      billingDocumentTemplate: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(mockTemplate)
          .mockResolvedValueOnce(defaultTemplate),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.setDefault({ id: TEMPLATE_ID })
    expect(result?.isDefault).toBe(true)
  })

  it("rejects generic templates (no document type)", async () => {
    const genericTemplate = { ...mockTemplate, documentType: null }
    const prisma = {
      billingDocumentTemplate: {
        findFirst: vi.fn().mockResolvedValue(genericTemplate),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await expect(
      caller.setDefault({ id: TEMPLATE_ID })
    ).rejects.toThrow()
  })
})
