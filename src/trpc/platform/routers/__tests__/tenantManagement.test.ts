/**
 * Tests for the platform tenantManagement router (Phase 9).
 *
 * Covers create/update/deactivate/reactivate lifecycle plus enableModule /
 * disableModule, including contract-reference persistence and the
 * NOT_FOUND path when a module isn't enabled.
 *
 * users-service.create is mocked at the module boundary — the tests focus
 * on the router orchestration (transaction wiring, audit writes, error
 * paths) rather than the already-tested user-creation flow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/services/users-service", () => ({
  create: vi.fn().mockResolvedValue({
    user: {
      id: "a0000000-0000-4000-a000-0000000000bb",
      email: "admin@test.gmbh",
      displayName: "Admin User",
    },
    welcomeEmail: { sent: true, fallbackLink: null },
  }),
}))

vi.mock("@/lib/platform/subscription-service", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    createSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
  }
})

import { createCallerFactory } from "../../init"
import { platformTenantManagementRouter } from "../tenantManagement"
import { createMockPlatformContext } from "../../__tests__/helpers"
import { create as createUserService } from "@/lib/services/users-service"
import * as subscriptionService from "@/lib/platform/subscription-service"

const createCaller = createCallerFactory(platformTenantManagementRouter)

const OPERATOR_ID = "00000000-0000-4000-a000-000000000001"
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const MODULE_ROW_ID = "a0000000-0000-4000-a000-0000000000cc"

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: TENANT_ID,
    name: "Test GmbH",
    slug: "test-gmbh",
    isActive: true,
    isDemo: false,
    email: "info@test.gmbh",
    demoExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createUserService).mockResolvedValue({
    user: {
      id: "a0000000-0000-4000-a000-0000000000bb",
      email: "admin@test.gmbh",
      displayName: "Admin User",
    } as unknown as Awaited<ReturnType<typeof createUserService>>["user"],
    welcomeEmail: { sent: true, fallbackLink: null },
  })
})

describe("tenantManagement.create", () => {
  it("creates tenant + initial admin user and writes a platform audit row", async () => {
    const tenantFindUnique = vi.fn().mockResolvedValue(null) // slug free
    const tenantCreate = vi.fn().mockResolvedValue(makeTenant())
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { findUnique: tenantFindUnique, create: tenantCreate },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    const result = await caller.create({
      name: "Test GmbH",
      slug: "test-gmbh",
      contactEmail: "info@test.gmbh",
      initialAdminEmail: "admin@test.gmbh",
      initialAdminDisplayName: "Admin User",
      addressStreet: "Musterstraße 1",
      addressZip: "12345",
      addressCity: "Berlin",
      addressCountry: "Deutschland",
    })

    expect(tenantCreate).toHaveBeenCalled()
    expect(createUserService).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        email: "admin@test.gmbh",
        displayName: "Admin User",
      }),
      expect.any(Object),
    )
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "tenant.created",
          platformUserId: OPERATOR_ID,
          targetTenantId: TENANT_ID,
        }),
      }),
    )
    expect(result.welcomeEmailSent).toBe(true)
    expect(result.inviteLink).toBeNull()
  })

  it("returns CONFLICT when the slug already exists", async () => {
    const tenantFindUnique = vi.fn().mockResolvedValue(makeTenant())
    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { findUnique: tenantFindUnique, create: vi.fn() },
      },
    })
    const caller = createCaller(ctx)
    await expect(
      caller.create({
        name: "Test GmbH",
        slug: "test-gmbh",
        contactEmail: "info@test.gmbh",
        initialAdminEmail: "admin@test.gmbh",
        initialAdminDisplayName: "Admin User",
        addressStreet: "Musterstraße 1",
        addressZip: "12345",
        addressCity: "Berlin",
        addressCountry: "Deutschland",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("tenantManagement.deactivate / reactivate", () => {
  it("flips isActive=false and records the reason in the audit metadata", async () => {
    const findUnique = vi.fn().mockResolvedValue(makeTenant())
    const update = vi.fn().mockResolvedValue(makeTenant({ isActive: false }))
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { findUnique, update },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.deactivate({ id: TENANT_ID, reason: "Kündigung zum 31.12." })

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TENANT_ID },
        data: { isActive: false },
      }),
    )
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "tenant.deactivated",
          metadata: expect.objectContaining({ reason: "Kündigung zum 31.12." }),
        }),
      }),
    )
  })

  it("reactivate flips isActive back to true", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue(makeTenant({ isActive: false }))
    const update = vi.fn().mockResolvedValue(makeTenant({ isActive: true }))
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { findUnique, update },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.reactivate({ id: TENANT_ID })

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TENANT_ID },
        data: { isActive: true },
      }),
    )
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "tenant.reactivated" }),
      }),
    )
  })
})

describe("tenantManagement.enableModule", () => {
  it("persists operatorNote and records it in the audit metadata", async () => {
    const tenantFindUnique = vi.fn().mockResolvedValue({ id: TENANT_ID })
    const upsert = vi.fn().mockResolvedValue({
      id: MODULE_ROW_ID,
      tenantId: TENANT_ID,
      module: "crm",
      enabledAt: new Date(),
      enabledByPlatformUserId: OPERATOR_ID,
      operatorNote: "#INV-2026-042",
    })
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { findUnique: tenantFindUnique },
        tenantModule: { upsert },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.enableModule({
      tenantId: TENANT_ID,
      moduleKey: "crm",
      operatorNote: "#INV-2026-042",
    })

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          operatorNote: "#INV-2026-042",
          enabledByPlatformUserId: OPERATOR_ID,
        }),
      }),
    )
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "module.enabled",
          targetTenantId: TENANT_ID,
          metadata: expect.objectContaining({
            moduleKey: "crm",
            operatorNote: "#INV-2026-042",
          }),
        }),
      }),
    )
  })

  it("succeeds with null operatorNote and persists null in the audit metadata", async () => {
    const tenantFindUnique = vi.fn().mockResolvedValue({ id: TENANT_ID })
    const upsert = vi.fn().mockResolvedValue({
      id: MODULE_ROW_ID,
      tenantId: TENANT_ID,
      module: "billing",
      enabledAt: new Date(),
      enabledByPlatformUserId: OPERATOR_ID,
      operatorNote: null,
    })
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { findUnique: tenantFindUnique },
        tenantModule: { upsert },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.enableModule({ tenantId: TENANT_ID, moduleKey: "billing" })

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ operatorNote: null }),
      }),
    )
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ operatorNote: null }),
        }),
      }),
    )
  })
})

describe("tenantManagement.enableModule — subscription wiring (Phase 10a)", () => {
  const OPERATOR_TENANT_ID = "10000000-0000-0000-0000-000000000001"

  beforeEach(() => {
    vi.stubEnv("PLATFORM_OPERATOR_TENANT_ID", OPERATOR_TENANT_ID)
    vi.mocked(subscriptionService.createSubscription).mockReset()
    vi.mocked(subscriptionService.cancelSubscription).mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("creates platform_subscription and records ids in audit metadata", async () => {
    const tenantFindUnique = vi.fn().mockResolvedValue({ id: TENANT_ID })
    const upsert = vi.fn().mockResolvedValue({
      id: MODULE_ROW_ID,
      tenantId: TENANT_ID,
      module: "crm",
      enabledAt: new Date(),
      enabledByPlatformUserId: OPERATOR_ID,
      operatorNote: null,
    })
    const platformSubscriptionFindFirst = vi.fn().mockResolvedValue(null)
    const platformAuditCreate = vi.fn().mockResolvedValue(null)
    vi.mocked(subscriptionService.createSubscription).mockResolvedValue({
      subscriptionId: "sub-1",
      operatorCrmAddressId: "crm-1",
      billingRecurringInvoiceId: "ri-1",
      joinedExistingRecurring: false,
    })

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { findUnique: tenantFindUnique },
        tenantModule: { upsert },
        platformSubscription: { findFirst: platformSubscriptionFindFirst },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.enableModule({
      tenantId: TENANT_ID,
      moduleKey: "crm",
      billingCycle: "MONTHLY",
    })

    expect(subscriptionService.createSubscription).toHaveBeenCalledTimes(1)
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            subscriptionId: "sub-1",
            billingRecurringInvoiceId: "ri-1",
            billingCycle: "MONTHLY",
          }),
        }),
      }),
    )
  })

  it("skips creation when an active subscription already exists (re-enable)", async () => {
    const tenantFindUnique = vi.fn().mockResolvedValue({ id: TENANT_ID })
    const upsert = vi.fn().mockResolvedValue({
      id: MODULE_ROW_ID,
      tenantId: TENANT_ID,
      module: "crm",
      enabledAt: new Date(),
      enabledByPlatformUserId: OPERATOR_ID,
      operatorNote: null,
    })
    const platformSubscriptionFindFirst = vi
      .fn()
      .mockResolvedValue({ id: "existing-sub" })
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { findUnique: tenantFindUnique },
        tenantModule: { upsert },
        platformSubscription: { findFirst: platformSubscriptionFindFirst },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.enableModule({
      tenantId: TENANT_ID,
      moduleKey: "crm",
      billingCycle: "MONTHLY",
    })

    expect(subscriptionService.createSubscription).not.toHaveBeenCalled()
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            subscriptionId: null,
            billingRecurringInvoiceId: null,
          }),
        }),
      }),
    )
  })

  it("operator tenant booking modules on itself: tenant_modules upserted, NO subscription created", async () => {
    // The "house" tenant id matches the env var.
    const HOUSE_ID = OPERATOR_TENANT_ID
    const tenantFindUnique = vi.fn().mockResolvedValue({ id: HOUSE_ID })
    const upsert = vi.fn().mockResolvedValue({
      id: MODULE_ROW_ID,
      tenantId: HOUSE_ID,
      module: "crm",
      enabledAt: new Date(),
      enabledByPlatformUserId: OPERATOR_ID,
      operatorNote: null,
    })
    const platformSubscriptionFindFirst = vi.fn()
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { findUnique: tenantFindUnique },
        tenantModule: { upsert },
        platformSubscription: { findFirst: platformSubscriptionFindFirst },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.enableModule({
      tenantId: HOUSE_ID,
      moduleKey: "crm",
      billingCycle: "MONTHLY",
    })

    // Module toggle still happened.
    expect(upsert).toHaveBeenCalled()
    // Subscription block was completely skipped: no findFirst, no create.
    expect(platformSubscriptionFindFirst).not.toHaveBeenCalled()
    expect(subscriptionService.createSubscription).not.toHaveBeenCalled()
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            subscriptionId: null,
            billingRecurringInvoiceId: null,
          }),
        }),
      }),
    )
  })

  it("does not touch subscription logic when env var unset", async () => {
    vi.stubEnv("PLATFORM_OPERATOR_TENANT_ID", "")
    const tenantFindUnique = vi.fn().mockResolvedValue({ id: TENANT_ID })
    const upsert = vi.fn().mockResolvedValue({
      id: MODULE_ROW_ID,
      tenantId: TENANT_ID,
      module: "crm",
      enabledAt: new Date(),
      enabledByPlatformUserId: OPERATOR_ID,
      operatorNote: null,
    })
    const platformSubscriptionFindFirst = vi.fn()
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenant: { findUnique: tenantFindUnique },
        tenantModule: { upsert },
        platformSubscription: { findFirst: platformSubscriptionFindFirst },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.enableModule({
      tenantId: TENANT_ID,
      moduleKey: "crm",
      billingCycle: "MONTHLY",
    })

    expect(platformSubscriptionFindFirst).not.toHaveBeenCalled()
    expect(subscriptionService.createSubscription).not.toHaveBeenCalled()
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            subscriptionId: null,
            billingRecurringInvoiceId: null,
          }),
        }),
      }),
    )
  })
})

describe("tenantManagement.disableModule", () => {
  it("deletes the row and records the reason in the audit metadata", async () => {
    const tenantModuleFindUnique = vi.fn().mockResolvedValue({
      id: MODULE_ROW_ID,
      tenantId: TENANT_ID,
      module: "crm",
      operatorNote: "#INV-2026-042",
    })
    const tenantModuleDelete = vi.fn().mockResolvedValue({ id: MODULE_ROW_ID })
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenantModule: {
          findUnique: tenantModuleFindUnique,
          delete: tenantModuleDelete,
        },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.disableModule({
      tenantId: TENANT_ID,
      moduleKey: "crm",
      reason: "Kündigung zum 31.12.",
    })

    expect(tenantModuleDelete).toHaveBeenCalledWith({
      where: { id: MODULE_ROW_ID },
    })
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "module.disabled",
          metadata: expect.objectContaining({
            moduleKey: "crm",
            reason: "Kündigung zum 31.12.",
          }),
        }),
      }),
    )
  })

  it("throws NOT_FOUND when the module isn't enabled for the tenant", async () => {
    const tenantModuleFindUnique = vi.fn().mockResolvedValue(null)
    const ctx = createMockPlatformContext({
      prisma: {
        tenantModule: { findUnique: tenantModuleFindUnique, delete: vi.fn() },
      },
    })
    const caller = createCaller(ctx)
    await expect(
      caller.disableModule({ tenantId: TENANT_ID, moduleKey: "crm" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("refuses to disable the core module", async () => {
    const ctx = createMockPlatformContext({
      prisma: {
        tenantModule: { findUnique: vi.fn(), delete: vi.fn() },
      },
    })
    const caller = createCaller(ctx)
    await expect(
      caller.disableModule({ tenantId: TENANT_ID, moduleKey: "core" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})

describe("tenantManagement.disableModule — subscription wiring (Phase 10a)", () => {
  const OPERATOR_TENANT_ID = "10000000-0000-0000-0000-000000000001"

  beforeEach(() => {
    vi.stubEnv("PLATFORM_OPERATOR_TENANT_ID", OPERATOR_TENANT_ID)
    vi.mocked(subscriptionService.cancelSubscription).mockReset()
    vi.mocked(subscriptionService.cancelSubscription).mockResolvedValue()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("cancels the active subscription when one exists", async () => {
    const tenantModuleFindUnique = vi.fn().mockResolvedValue({
      id: MODULE_ROW_ID,
      tenantId: TENANT_ID,
      module: "crm",
      operatorNote: null,
    })
    const tenantModuleDelete = vi.fn().mockResolvedValue({ id: MODULE_ROW_ID })
    const platformSubscriptionFindFirst = vi
      .fn()
      .mockResolvedValue({ id: "sub-1" })
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenantModule: {
          findUnique: tenantModuleFindUnique,
          delete: tenantModuleDelete,
        },
        platformSubscription: { findFirst: platformSubscriptionFindFirst },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.disableModule({
      tenantId: TENANT_ID,
      moduleKey: "crm",
      reason: "Kündigung",
    })

    expect(subscriptionService.cancelSubscription).toHaveBeenCalledTimes(1)
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            cancelledSubscriptionId: "sub-1",
          }),
        }),
      }),
    )
  })

  it("operator tenant disabling its own module: tenant_modules deleted, NO cancel call", async () => {
    const HOUSE_ID = OPERATOR_TENANT_ID
    const tenantModuleFindUnique = vi.fn().mockResolvedValue({
      id: MODULE_ROW_ID,
      tenantId: HOUSE_ID,
      module: "crm",
      operatorNote: null,
    })
    const tenantModuleDelete = vi.fn().mockResolvedValue({ id: MODULE_ROW_ID })
    const platformSubscriptionFindFirst = vi.fn()
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenantModule: {
          findUnique: tenantModuleFindUnique,
          delete: tenantModuleDelete,
        },
        platformSubscription: { findFirst: platformSubscriptionFindFirst },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.disableModule({
      tenantId: HOUSE_ID,
      moduleKey: "crm",
    })

    expect(tenantModuleDelete).toHaveBeenCalled()
    expect(platformSubscriptionFindFirst).not.toHaveBeenCalled()
    expect(subscriptionService.cancelSubscription).not.toHaveBeenCalled()
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            cancelledSubscriptionId: null,
          }),
        }),
      }),
    )
  })

  it("still succeeds when no active subscription exists", async () => {
    const tenantModuleFindUnique = vi.fn().mockResolvedValue({
      id: MODULE_ROW_ID,
      tenantId: TENANT_ID,
      module: "crm",
      operatorNote: null,
    })
    const tenantModuleDelete = vi.fn().mockResolvedValue({ id: MODULE_ROW_ID })
    const platformSubscriptionFindFirst = vi.fn().mockResolvedValue(null)
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        tenantModule: {
          findUnique: tenantModuleFindUnique,
          delete: tenantModuleDelete,
        },
        platformSubscription: { findFirst: platformSubscriptionFindFirst },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)

    await caller.disableModule({
      tenantId: TENANT_ID,
      moduleKey: "crm",
    })

    expect(subscriptionService.cancelSubscription).not.toHaveBeenCalled()
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            cancelledSubscriptionId: null,
          }),
        }),
      }),
    )
  })
})
