/**
 * Tests for the platform demoTenantManagement router.
 *
 * Router-level tests: mock the service + subscription bridge at the module
 * boundary and focus on orchestration — audit write, error code mapping,
 * convert-flow re-insert + subscription loop.
 *
 * Happy-path DB assertions live in
 * `src/lib/services/__tests__/demo-tenant-service.integration.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/services/demo-tenant-service", () => ({
  DemoTenantValidationError: class extends Error {
    constructor(message: string) {
      super(message)
      this.name = "DemoTenantValidationError"
    }
  },
  DemoTenantNotFoundError: class extends Error {
    constructor(message = "Demo tenant not found") {
      super(message)
      this.name = "DemoTenantNotFoundError"
    }
  },
  DemoTenantForbiddenError: class extends Error {
    constructor(message: string) {
      super(message)
      this.name = "DemoTenantForbiddenError"
    }
  },
  createDemo: vi.fn(),
  listDemos: vi.fn(),
  extendDemo: vi.fn(),
  convertDemo: vi.fn(),
  expireDemoNow: vi.fn(),
  deleteDemo: vi.fn(),
}))

vi.mock("@/lib/platform/subscription-service", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    createSubscription: vi.fn(),
    findOrCreateOperatorCrmAddress: vi.fn(),
    isOperatorTenant: vi.fn().mockReturnValue(false),
    isSubscriptionBillingEnabled: vi.fn().mockReturnValue(true),
  }
})

import { createCallerFactory } from "../../init"
import { platformDemoTenantManagementRouter } from "../demoTenantManagement"
import { createMockPlatformContext } from "../../__tests__/helpers"
import * as demoService from "@/lib/services/demo-tenant-service"
import * as subscriptionService from "@/lib/platform/subscription-service"

const createCaller = createCallerFactory(platformDemoTenantManagementRouter)

const OPERATOR_ID = "00000000-0000-4000-a000-000000000001"
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(subscriptionService.isOperatorTenant).mockReturnValue(false)
  vi.mocked(subscriptionService.isSubscriptionBillingEnabled).mockReturnValue(
    true,
  )
})

describe("demoTenantManagement.create", () => {
  it("calls service with platformUser.id and writes a platform audit row", async () => {
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    vi.mocked(demoService.createDemo).mockResolvedValue({
      tenantId: TENANT_ID,
      adminUserId: "a0000000-0000-4000-a000-0000000000bb",
      inviteLink: null,
      welcomeEmailSent: true,
      demoExpiresAt: expiresAt,
      demoTemplate: "industriedienstleister_150",
    })
    const platformAuditCreate = vi.fn().mockResolvedValue(null)
    const ctx = createMockPlatformContext({
      prisma: {
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    const result = await caller.create({
      tenantName: "Acme Demo",
      tenantSlug: "acme-demo",
      addressStreet: "Street 1",
      addressZip: "12345",
      addressCity: "Berlin",
      addressCountry: "DE",
      adminEmail: "admin@acme.test",
      adminDisplayName: "Admin User",
    })

    expect(demoService.createDemo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantSlug: "acme-demo",
        adminEmail: "admin@acme.test",
      }),
      OPERATOR_ID,
      expect.objectContaining({
        ipAddress: "10.0.0.1",
        userAgent: "vitest",
      }),
    )
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "demo.created",
          platformUserId: OPERATOR_ID,
          targetTenantId: TENANT_ID,
        }),
      }),
    )
    expect(result.tenantId).toBe(TENANT_ID)
  })

  it("maps DemoTenantValidationError → BAD_REQUEST", async () => {
    vi.mocked(demoService.createDemo).mockRejectedValue(
      new demoService.DemoTenantValidationError("bad duration"),
    )
    const ctx = createMockPlatformContext()
    const caller = createCaller(ctx)

    await expect(
      caller.create({
        tenantName: "Acme",
        tenantSlug: "acme-bad",
        addressStreet: "Street 1",
        addressZip: "12345",
        addressCity: "Berlin",
        addressCountry: "DE",
        adminEmail: "admin@acme.test",
        adminDisplayName: "Admin",
        demoDurationDays: 999,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})

describe("demoTenantManagement.list", () => {
  it("returns the service listDemos result", async () => {
    vi.mocked(demoService.listDemos).mockResolvedValue([
      {
        id: TENANT_ID,
        name: "Acme Demo",
        slug: "acme-demo",
        isActive: true,
        isDemo: true,
        demoExpiresAt: new Date(),
        demoTemplate: "industriedienstleister_150",
        demoNotes: null,
        createdAt: new Date(),
        daysRemaining: 14,
        status: "active",
        creator: {
          source: "platform",
          id: OPERATOR_ID,
          displayName: "Tolga",
          email: "tolga@terp.de",
        },
      },
    ])
    const ctx = createMockPlatformContext()
    const caller = createCaller(ctx)
    const rows = await caller.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.creator.source).toBe("platform")
  })
})

describe("demoTenantManagement.extend", () => {
  it("writes audit with wasReactivated=true on expired demo", async () => {
    const platformAuditCreate = vi.fn().mockResolvedValue(null)
    const ctx = createMockPlatformContext({
      prisma: {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            demoExpiresAt: new Date("2026-04-01"),
            isActive: false,
            name: "Acme Demo",
          }),
        },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    vi.mocked(demoService.extendDemo).mockResolvedValue({
      id: TENANT_ID,
      name: "Acme Demo",
      demoExpiresAt: new Date("2026-04-15"),
      isActive: true,
    } as unknown as Awaited<ReturnType<typeof demoService.extendDemo>>)

    const caller = createCaller(ctx)
    await caller.extend({ tenantId: TENANT_ID, additionalDays: 14 })

    const auditCall = platformAuditCreate.mock.calls[0]![0] as {
      data: { metadata: Record<string, unknown> }
    }
    expect(auditCall.data.metadata.wasReactivated).toBe(true)
  })
})

describe("demoTenantManagement.convert", () => {
  it("re-inserts modules after discardData=true and creates subscriptions", async () => {
    vi.mocked(demoService.convertDemo).mockResolvedValue({
      snapshottedModules: ["core", "crm", "billing", "warehouse"],
      originalTemplate: "industriedienstleister_150",
      tenantName: "Acme Demo",
    })
    vi.mocked(subscriptionService.createSubscription).mockResolvedValue({
      subscriptionId: "sub-id",
      operatorCrmAddressId: "addr-id",
      billingRecurringInvoiceId: "ri-id",
      joinedExistingRecurring: false,
    })

    const tenantModuleUpsert = vi.fn().mockResolvedValue({})
    const platformSubscriptionFindFirst = vi.fn().mockResolvedValue(null)
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenantModule: { upsert: tenantModuleUpsert },
        platformSubscription: { findFirst: platformSubscriptionFindFirst },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.convert({
      tenantId: TENANT_ID,
      discardData: true,
      billingCycle: "MONTHLY",
    })

    // 4 upserts (one per module)
    expect(tenantModuleUpsert).toHaveBeenCalledTimes(4)
    // 4 subscriptions created
    expect(subscriptionService.createSubscription).toHaveBeenCalledTimes(4)
    expect(result.subscriptionIds).toHaveLength(4)
    expect(result.failedModules).toEqual([])
    // Audit metadata reflects the convert flow
    const auditCall = platformAuditCreate.mock.calls[0]![0] as {
      data: { action: string; metadata: Record<string, unknown> }
    }
    expect(auditCall.data.action).toBe("demo.converted")
    expect(auditCall.data.metadata.moduleCount).toBe(4)
    expect(auditCall.data.metadata.failedModules).toBeNull()
    expect(auditCall.data.metadata.isHouseTenant).toBe(false)
  })

  it("skips subscription bridge when billing is disabled", async () => {
    vi.mocked(subscriptionService.isSubscriptionBillingEnabled).mockReturnValue(
      false,
    )
    vi.mocked(demoService.convertDemo).mockResolvedValue({
      snapshottedModules: ["core"],
      originalTemplate: null,
      tenantName: "Acme Demo",
    })

    const platformAuditCreate = vi.fn().mockResolvedValue(null)
    const ctx = createMockPlatformContext({
      prisma: {
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.convert({
      tenantId: TENANT_ID,
      discardData: false,
      billingCycle: "MONTHLY",
    })

    expect(subscriptionService.createSubscription).not.toHaveBeenCalled()
    expect(result.subscriptionIds).toEqual([])
  })

  it("with billingExempt=true: skips subscription bridge, flags tenant, creates CrmAddress", async () => {
    vi.mocked(demoService.convertDemo).mockResolvedValue({
      snapshottedModules: ["core", "crm"],
      originalTemplate: "industriedienstleister_150",
      tenantName: "Exempt GmbH",
    })
    vi.mocked(
      subscriptionService.findOrCreateOperatorCrmAddress,
    ).mockResolvedValue("addr-exempt-1")

    const tenantUpdate = vi.fn().mockResolvedValue({})
    const tenantModuleUpsert = vi.fn().mockResolvedValue({})
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { update: tenantUpdate },
        tenantModule: { upsert: tenantModuleUpsert },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.convert({
      tenantId: TENANT_ID,
      discardData: false,
      billingCycle: "MONTHLY",
      billingExempt: true,
    })

    expect(tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TENANT_ID },
        data: { billingExempt: true },
      }),
    )
    expect(subscriptionService.createSubscription).not.toHaveBeenCalled()
    expect(
      subscriptionService.findOrCreateOperatorCrmAddress,
    ).toHaveBeenCalledTimes(1)
    expect(result.subscriptionIds).toEqual([])
    expect(result.failedModules).toEqual([])
    const auditCall = platformAuditCreate.mock.calls[0]![0] as {
      data: { metadata: Record<string, unknown> }
    }
    expect(auditCall.data.metadata.billingExempt).toBe(true)
  })

  it("skips subscription bridge when tenant is the operator tenant (house rule)", async () => {
    vi.mocked(subscriptionService.isOperatorTenant).mockReturnValue(true)
    vi.mocked(demoService.convertDemo).mockResolvedValue({
      snapshottedModules: ["core"],
      originalTemplate: null,
      tenantName: "Operator Tenant",
    })
    const platformAuditCreate = vi.fn().mockResolvedValue(null)
    const ctx = createMockPlatformContext({
      prisma: { platformAuditLog: { create: platformAuditCreate } },
    })
    const caller = createCaller(ctx)
    await caller.convert({
      tenantId: TENANT_ID,
      discardData: false,
      billingCycle: "MONTHLY",
    })
    expect(subscriptionService.createSubscription).not.toHaveBeenCalled()
    const auditCall = platformAuditCreate.mock.calls[0]![0] as {
      data: { metadata: Record<string, unknown> }
    }
    expect(auditCall.data.metadata.isHouseTenant).toBe(true)
  })
})

describe("demoTenantManagement.delete", () => {
  it("refuses to delete an active demo (FORBIDDEN)", async () => {
    const ctx = createMockPlatformContext({
      prisma: {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            name: "Acme Demo",
            slug: "acme-demo",
            demoTemplate: "industriedienstleister_150",
            createdAt: new Date(),
            demoExpiresAt: new Date(),
            isActive: true,
            isDemo: true,
          }),
        },
      },
    })
    const caller = createCaller(ctx)
    await expect(
      caller.delete({ tenantId: TENANT_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("writes audit BEFORE calling deleteDemo", async () => {
    const auditCreate = vi.fn().mockResolvedValue(null)
    vi.mocked(demoService.deleteDemo).mockImplementation(async () => {
      // By the time the service delete runs, audit must already have been written.
      expect(auditCreate).toHaveBeenCalledTimes(1)
      return { ok: true as const }
    })

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            name: "Acme Demo",
            slug: "acme-demo",
            demoTemplate: "industriedienstleister_150",
            createdAt: new Date(),
            demoExpiresAt: new Date(),
            isActive: false,
            isDemo: true,
          }),
        },
        platformAuditLog: { create: auditCreate },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.delete({ tenantId: TENANT_ID })
    expect(result).toEqual({ ok: true })
  })
})
