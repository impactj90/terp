import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingDocumentsRouter } from "../billing/documents"
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

// Mock the e-invoice service
vi.mock("@/lib/services/billing-document-einvoice-service", () => ({
  getSignedXmlDownloadUrl: vi.fn(),
}))

import * as eInvoiceService from "@/lib/services/billing-document-einvoice-service"

const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
const BILLING_EDIT = permissionIdByKey("billing_documents.edit")!
const ALL_PERMS = [BILLING_VIEW, BILLING_EDIT]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const DOC_ID = "d0000000-0000-4000-a000-000000000001"
const CONFIG_ID = "c0000000-0000-4000-a000-000000000001"

const createDocCaller = createCallerFactory(billingDocumentsRouter)
const createConfigCaller = createCallerFactory(billingTenantConfigRouter)

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

// --- downloadXml tests ---

describe("billing.documents.downloadXml", () => {
  it("requires billing_documents.view permission", async () => {
    const prisma = {}
    const caller = createDocCaller(createTestContext(prisma, []))
    await expect(
      caller.downloadXml({ id: DOC_ID })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("returns signed URL for finalized INVOICE with XML", async () => {
    const mockResult = {
      signedUrl: "https://storage.example.com/signed-url",
      filename: "RE-2026-001.xml",
    }
    ;(eInvoiceService.getSignedXmlDownloadUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

    const prisma = {}
    const caller = createDocCaller(createTestContext(prisma))
    const result = await caller.downloadXml({ id: DOC_ID })
    expect(result).toEqual(mockResult)
    expect(eInvoiceService.getSignedXmlDownloadUrl).toHaveBeenCalled()
  })

  it("returns null for document without XML", async () => {
    ;(eInvoiceService.getSignedXmlDownloadUrl as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const prisma = {}
    const caller = createDocCaller(createTestContext(prisma))
    const result = await caller.downloadXml({ id: DOC_ID })
    expect(result).toBeNull()
  })
})

// --- tenantConfig E-Invoice fields tests ---

describe("billing.tenantConfig.upsert — E-Invoice fields", () => {
  const mockConfig = {
    id: CONFIG_ID,
    tenantId: TENANT_ID,
    companyName: "Pro-Di GmbH",
    companyAddress: null,
    logoUrl: null,
    bankName: null,
    iban: null,
    bic: null,
    taxId: "DE123456789",
    commercialRegister: null,
    managingDirector: null,
    footerHtml: null,
    phone: null,
    email: null,
    website: null,
    taxNumber: "123/456/78901",
    leitwegId: "991-12345-67",
    eInvoiceEnabled: true,
    companyStreet: "Musterstraße 1",
    companyZip: "12345",
    companyCity: "Musterstadt",
    companyCountry: "DE",
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it("saves taxNumber", async () => {
    const prisma = {
      billingTenantConfig: {
        upsert: vi.fn().mockResolvedValue(mockConfig),
      },
    }
    const caller = createConfigCaller(createTestContext(prisma))
    const result = await caller.upsert({ taxNumber: "123/456/78901" })
    expect(result.taxNumber).toBe("123/456/78901")
    expect(prisma.billingTenantConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ taxNumber: "123/456/78901" }),
      })
    )
  })

  it("saves leitwegId", async () => {
    const prisma = {
      billingTenantConfig: {
        upsert: vi.fn().mockResolvedValue(mockConfig),
      },
    }
    const caller = createConfigCaller(createTestContext(prisma))
    const result = await caller.upsert({ leitwegId: "991-12345-67" })
    expect(result.leitwegId).toBe("991-12345-67")
  })

  it("saves eInvoiceEnabled", async () => {
    const prisma = {
      billingTenantConfig: {
        upsert: vi.fn().mockResolvedValue(mockConfig),
      },
    }
    const caller = createConfigCaller(createTestContext(prisma))
    const result = await caller.upsert({ eInvoiceEnabled: true })
    expect(result.eInvoiceEnabled).toBe(true)
  })

  it("saves companyStreet, companyZip, companyCity, companyCountry", async () => {
    const prisma = {
      billingTenantConfig: {
        upsert: vi.fn().mockResolvedValue(mockConfig),
      },
    }
    const caller = createConfigCaller(createTestContext(prisma))
    const result = await caller.upsert({
      companyStreet: "Musterstraße 1",
      companyZip: "12345",
      companyCity: "Musterstadt",
      companyCountry: "DE",
    })
    expect(result.companyStreet).toBe("Musterstraße 1")
    expect(result.companyZip).toBe("12345")
    expect(result.companyCity).toBe("Musterstadt")
    expect(result.companyCountry).toBe("DE")
  })
})
