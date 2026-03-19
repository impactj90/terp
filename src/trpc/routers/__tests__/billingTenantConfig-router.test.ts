import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingTenantConfigRouter } from "../billing/tenantConfig"
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
const CONFIG_ID = "c0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(billingTenantConfigRouter)

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

const mockConfig = {
  id: CONFIG_ID,
  tenantId: TENANT_ID,
  companyName: "Pro-Di GmbH",
  companyAddress: "Musterstraße 1\n12345 Musterstadt",
  logoUrl: null,
  bankName: "Sparkasse Musterstadt",
  iban: "DE89370400440532013000",
  bic: "COBADEFFXXX",
  taxId: "DE123456789",
  commercialRegister: "HRB 12345",
  managingDirector: "Max Mustermann",
  footerHtml: null,
  phone: "+49 123 456789",
  email: "info@pro-di.de",
  website: "https://pro-di.de",
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("billing.tenantConfig.get", () => {
  it("returns config for tenant", async () => {
    const prisma = {
      billingTenantConfig: {
        findUnique: vi.fn().mockResolvedValue(mockConfig),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.get()
    expect(result?.companyName).toBe("Pro-Di GmbH")
  })

  it("returns null when no config exists", async () => {
    const prisma = {
      billingTenantConfig: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.get()
    expect(result).toBeNull()
  })

  it("requires billing_documents.view permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, []))
    await expect(caller.get()).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.tenantConfig.upsert", () => {
  it("creates config when none exists", async () => {
    const prisma = {
      billingTenantConfig: {
        upsert: vi.fn().mockResolvedValue(mockConfig),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.upsert({
      companyName: "Pro-Di GmbH",
      iban: "DE89370400440532013000",
    })
    expect(result.companyName).toBe("Pro-Di GmbH")
  })

  it("updates existing config", async () => {
    const updatedConfig = { ...mockConfig, companyName: "Pro-Di GmbH & Co. KG" }
    const prisma = {
      billingTenantConfig: {
        upsert: vi.fn().mockResolvedValue(updatedConfig),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.upsert({
      companyName: "Pro-Di GmbH & Co. KG",
    })
    expect(result.companyName).toBe("Pro-Di GmbH & Co. KG")
  })

  it("requires billing_documents.edit permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, [BILLING_VIEW]))
    await expect(
      caller.upsert({ companyName: "Test" })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("accepts all config fields", async () => {
    const prisma = {
      billingTenantConfig: {
        upsert: vi.fn().mockResolvedValue(mockConfig),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await caller.upsert({
      companyName: "Pro-Di GmbH",
      companyAddress: "Musterstraße 1\n12345 Musterstadt",
      bankName: "Sparkasse",
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
      taxId: "DE123456789",
      commercialRegister: "HRB 12345",
      managingDirector: "Max Mustermann",
      footerHtml: "<p>Footer</p>",
      phone: "+49 123 456789",
      email: "info@test.de",
      website: "https://test.de",
    })
    expect(prisma.billingTenantConfig.upsert).toHaveBeenCalled()
  })
})
