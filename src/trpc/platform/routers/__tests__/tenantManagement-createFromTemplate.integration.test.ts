/**
 * Tests for platform `tenantManagement.createFromTemplate`.
 *
 * Mocks the downstream services (users-service, holiday-service,
 * billing-tenant-config-service, location-service, tenant-templates
 * registry) at the module boundary and uses the auto-mock Prisma proxy
 * from `../../__tests__/helpers`. Focus: router orchestration
 * (transaction wiring, ordering, audit writes, starter-kind guard,
 * Zod refinements for IBAN + Bundesland).
 *
 * Database-level integration coverage for the template itself lives in
 * `src/lib/tenant-templates/__tests__/industriedienstleister_starter.integration.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/services/users-service", () => ({
  create: vi.fn().mockResolvedValue({
    user: {
      id: "a0000000-0000-4000-a000-0000000000bb",
      email: "admin@starter.gmbh",
      displayName: "Starter Admin",
    },
    welcomeEmail: { sent: true, fallbackLink: null },
  }),
}))

const mockHolidayGenerate = vi.fn()
vi.mock("@/lib/services/holiday-service", () => ({
  generate: (...args: unknown[]) => mockHolidayGenerate(...args),
}))

const mockBillingTenantConfigUpsert = vi.fn()
vi.mock("@/lib/services/billing-tenant-config-service", () => ({
  upsert: (...args: unknown[]) => mockBillingTenantConfigUpsert(...args),
}))

const mockLocationCreate = vi.fn()
vi.mock("@/lib/services/location-service", () => ({
  create: (...args: unknown[]) => mockLocationCreate(...args),
}))

const mockApplyConfig = vi.fn()
const mockApplySeedData = vi.fn()
vi.mock("@/lib/tenant-templates/registry", () => ({
  getTenantTemplate: vi.fn((key: string) => {
    if (key === "industriedienstleister_starter") {
      return {
        key,
        label: "Industriedienstleister — Starter (leer)",
        description: "",
        industry: "industriedienstleister",
        kind: "starter" as const,
        applyConfig: mockApplyConfig,
      }
    }
    if (key === "industriedienstleister_150") {
      return {
        key,
        label: "Industriedienstleister (150 MA)",
        description: "",
        industry: "industriedienstleister",
        kind: "showcase" as const,
        applyConfig: mockApplyConfig,
        applySeedData: mockApplySeedData,
      }
    }
    throw new Error(`Unknown tenant template: ${key}`)
  }),
}))

vi.mock("@/lib/platform/subscription-service", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    createSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    findOrCreateOperatorCrmAddress: vi.fn(),
  }
})

import { createCallerFactory } from "../../init"
import { platformTenantManagementRouter } from "../tenantManagement"
import { createMockPlatformContext } from "../../__tests__/helpers"
import { create as createUserService } from "@/lib/services/users-service"

const createCaller = createCallerFactory(platformTenantManagementRouter)

const OPERATOR_ID = "00000000-0000-4000-a000-000000000001"
const TENANT_ID = "a0000000-0000-4000-a000-000000000200"

const VALID_IBAN = "DE89370400440532013000"

function makeTenantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TENANT_ID,
    name: "Starter GmbH",
    slug: "starter-gmbh",
    isActive: true,
    isDemo: false,
    email: "info@starter.gmbh",
    demoExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Starter GmbH",
    slug: "starter-gmbh",
    contactEmail: "info@starter.gmbh",
    initialAdminEmail: "admin@starter.gmbh",
    initialAdminDisplayName: "Starter Admin",
    addressStreet: "Musterstraße 1",
    addressZip: "12345",
    addressCity: "Berlin",
    addressCountry: "Deutschland",
    templateKey: "industriedienstleister_starter",
    billingConfig: {
      legalName: "Starter GmbH",
      iban: VALID_IBAN,
      bic: "COBADEFFXXX",
      taxId: "DE123456789",
      leitwegId: "04-01-00000000-11",
    },
    holidayState: "BY",
    defaultLocation: {
      name: "Hauptsitz",
      street: "Musterstraße 1",
      zip: "12345",
      city: "Berlin",
      country: "Deutschland",
    },
    ...overrides,
  }
}

function makeCtx(prismaOverrides: Record<string, unknown> = {}) {
  const tenantFindUnique = vi.fn().mockResolvedValue(null) // slug free
  const tenantCreate = vi.fn().mockResolvedValue(makeTenantRow())
  const userGroupCreate = vi.fn().mockResolvedValue({
    id: "g0000000-0000-4000-a000-000000000002",
    tenantId: TENANT_ID,
    name: "Administratoren",
    code: "ADMIN",
    isAdmin: true,
  })
  const platformAuditCreate = vi.fn().mockResolvedValue(null)

  return createMockPlatformContext({
    prisma: {
      tenant: { findUnique: tenantFindUnique, create: tenantCreate },
      userGroup: { create: userGroupCreate },
      platformAuditLog: { create: platformAuditCreate },
      ...prismaOverrides,
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createUserService).mockResolvedValue({
    user: {
      id: "a0000000-0000-4000-a000-0000000000bb",
      email: "admin@starter.gmbh",
      displayName: "Starter Admin",
    } as unknown as Awaited<ReturnType<typeof createUserService>>["user"],
    welcomeEmail: { sent: true, fallbackLink: null },
  })
  mockHolidayGenerate.mockResolvedValue([])
  mockBillingTenantConfigUpsert.mockResolvedValue({})
  mockLocationCreate.mockResolvedValue({})
  mockApplyConfig.mockResolvedValue({
    departments: [],
    tariffs: [],
    dayPlans: [],
    weekPlans: [],
    accountGroups: [],
    accounts: [],
    bookingTypes: [],
    absenceTypes: [],
    whArticleGroups: [],
  })
})

describe("tenantManagement.createFromTemplate", () => {
  it("orchestrates core → template → holidays → billing → location and writes platform audit", async () => {
    const ctx = makeCtx()
    const caller = createCaller(ctx)

    const result = await caller.createFromTemplate(validInput())

    // Core: tenant + userGroup + user
    expect(createUserService).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        email: "admin@starter.gmbh",
        displayName: "Starter Admin",
      }),
      expect.any(Object),
    )

    // Template applyConfig called with the correct ctx shape
    expect(mockApplyConfig).toHaveBeenCalledTimes(1)
    expect(mockApplyConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        adminUserId: "a0000000-0000-4000-a000-0000000000bb",
      }),
    )
    // Starter template has no applySeedData — must not run even if defined
    expect(mockApplySeedData).not.toHaveBeenCalled()

    // Holidays: exactly two calls, current + next year, both with the chosen state
    expect(mockHolidayGenerate).toHaveBeenCalledTimes(2)
    const currentYear = new Date().getFullYear()
    expect(mockHolidayGenerate).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      TENANT_ID,
      { year: currentYear, state: "BY" },
    )
    expect(mockHolidayGenerate).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      TENANT_ID,
      { year: currentYear + 1, state: "BY" },
    )

    // Billing tenant config upsert carries the legal name + IBAN
    expect(mockBillingTenantConfigUpsert).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        companyName: "Starter GmbH",
        iban: VALID_IBAN,
        bic: "COBADEFFXXX",
        taxId: "DE123456789",
        leitwegId: "04-01-00000000-11",
        companyStreet: "Musterstraße 1",
        companyZip: "12345",
        companyCity: "Berlin",
        companyCountry: "Deutschland",
      }),
    )

    // Default location
    expect(mockLocationCreate).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        code: "HQ",
        name: "Hauptsitz",
        address: "Musterstraße 1, 12345",
        city: "Berlin",
        country: "Deutschland",
      }),
    )

    // Post-tx platform audit
    const platformAuditCreate = (
      ctx.prisma as unknown as {
        platformAuditLog: { create: ReturnType<typeof vi.fn> }
      }
    ).platformAuditLog.create
    expect(platformAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "tenant.created_from_template",
          platformUserId: OPERATOR_ID,
          targetTenantId: TENANT_ID,
          metadata: expect.objectContaining({
            templateKey: "industriedienstleister_starter",
            industry: "industriedienstleister",
            kind: "starter",
            holidayState: "BY",
          }),
        }),
      }),
    )

    expect(result.tenant.id).toBe(TENANT_ID)
    expect(result.welcomeEmailSent).toBe(true)
    expect(result.inviteLink).toBeNull()
    expect(result.templateKey).toBe("industriedienstleister_starter")
    expect(result.industry).toBe("industriedienstleister")
  })

  it("rejects a showcase template with BAD_REQUEST (no tenant is created)", async () => {
    const ctx = makeCtx()
    const caller = createCaller(ctx)

    await expect(
      caller.createFromTemplate(
        validInput({ templateKey: "industriedienstleister_150" }),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    const tenantCreate = (
      ctx.prisma as unknown as {
        tenant: { create: ReturnType<typeof vi.fn> }
      }
    ).tenant.create
    expect(tenantCreate).not.toHaveBeenCalled()
    expect(mockApplyConfig).not.toHaveBeenCalled()
    expect(mockHolidayGenerate).not.toHaveBeenCalled()
  })

  it("rejects an unknown template key with the registry's error", async () => {
    const ctx = makeCtx()
    const caller = createCaller(ctx)

    await expect(
      caller.createFromTemplate(validInput({ templateKey: "does-not-exist" })),
    ).rejects.toThrow(/Unknown tenant template/)
  })

  it("rejects an invalid IBAN via Zod refinement", async () => {
    const ctx = makeCtx()
    const caller = createCaller(ctx)

    await expect(
      caller.createFromTemplate(
        validInput({
          billingConfig: {
            legalName: "Starter GmbH",
            iban: "DE00000000000000000000",
            bic: "COBADEFFXXX",
            taxId: "DE123456789",
            leitwegId: "04-01-00000000-11",
          },
        }),
      ),
    ).rejects.toThrow(/IBAN/i)

    expect(mockApplyConfig).not.toHaveBeenCalled()
  })

  it("rejects an unknown Bundesland code via Zod refinement", async () => {
    const ctx = makeCtx()
    const caller = createCaller(ctx)

    await expect(
      caller.createFromTemplate(validInput({ holidayState: "XX" })),
    ).rejects.toThrow(/Bundesland/)

    expect(mockApplyConfig).not.toHaveBeenCalled()
  })

  it("returns CONFLICT when the slug already exists (no downstream calls)", async () => {
    const ctx = makeCtx({
      tenant: {
        findUnique: vi.fn().mockResolvedValue(makeTenantRow()),
        create: vi.fn(),
      },
    })
    const caller = createCaller(ctx)

    await expect(
      caller.createFromTemplate(validInput()),
    ).rejects.toMatchObject({ code: "CONFLICT" })

    expect(mockApplyConfig).not.toHaveBeenCalled()
    expect(mockHolidayGenerate).not.toHaveBeenCalled()
    expect(mockBillingTenantConfigUpsert).not.toHaveBeenCalled()
    expect(mockLocationCreate).not.toHaveBeenCalled()
  })
})
