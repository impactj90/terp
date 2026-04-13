import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"

vi.mock("@/lib/services/crm-address-service", () => ({
  create: vi.fn(),
}))
vi.mock("@/lib/services/billing-recurring-invoice-service", () => ({
  create: vi.fn(),
  update: vi.fn(),
}))

import * as crmAddressService from "@/lib/services/crm-address-service"
import * as billingRecurringService from "@/lib/services/billing-recurring-invoice-service"
import * as subscriptionService from "../subscription-service"
import {
  appendMarker,
  removeMarker,
  platformSubscriptionMarker,
} from "../subscription-service"

const OPERATOR_TENANT_ID = "10000000-0000-0000-0000-000000000001"
const CUSTOMER_TENANT_ID = "20000000-0000-0000-0000-000000000001"
const CRM_ADDRESS_ID = "30000000-0000-0000-0000-000000000001"
const RI_ID = "40000000-0000-0000-0000-000000000001"
const SUB_ID_NEW = "50000000-0000-0000-0000-000000000099"
const SUB_ID_OLD = "50000000-0000-0000-0000-000000000001"
const PLATFORM_USER_ID = "60000000-0000-0000-0000-000000000001"

type SubFixture = {
  id: string
  tenantId: string
  module: string
  status: string
  billingCycle: string
  billingRecurringInvoiceId: string | null
  operatorCrmAddressId: string | null
  lastGeneratedInvoiceId: string | null
}

function createMockPrisma(state: {
  platformSubs?: SubFixture[]
  customerTenant?: unknown
  existingRecurring?: unknown
  siblingCount?: number
  recurringRow?: unknown
} = {}) {
  const {
    platformSubs = [],
    customerTenant = {
      name: "Test Customer GmbH",
      email: "x@example.com",
      addressStreet: "Kundenstraße 1",
      addressZip: "12345",
      addressCity: "Berlin",
      addressCountry: "DE",
    },
    existingRecurring = null,
    siblingCount = 0,
    recurringRow = null,
  } = state

  const subscriptionUpdates: Array<Record<string, unknown>> = []
  const subscriptionCreates: Array<Record<string, unknown>> = []

  const prisma = {
    platformSubscription: {
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          if (where.operatorCrmAddressId) {
            const match = platformSubs.find(
              (s) =>
                s.tenantId === where.tenantId && s.operatorCrmAddressId !== null,
            )
            return match
              ? { operatorCrmAddressId: match.operatorCrmAddressId }
              : null
          }
          return null
        },
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => {
          return platformSubs.find((s) => s.id === where.id) ?? null
        },
      ),
      findMany: vi.fn(async () => platformSubs),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: SUB_ID_NEW,
          ...data,
        }
        subscriptionCreates.push(data)
        return created
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Record<string, unknown>
        }) => {
          subscriptionUpdates.push({ id: where.id, ...data })
          return { id: where.id, ...data }
        },
      ),
      count: vi.fn(async () => siblingCount),
    },
    tenant: {
      findUnique: vi.fn(async () => customerTenant),
    },
    billingRecurringInvoice: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        // used by both create (find by addressId+interval) and cancel (find by id)
        if (where.id) return recurringRow
        return existingRecurring
      }),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient & {
    __subscriptionUpdates: Array<Record<string, unknown>>
    __subscriptionCreates: Array<Record<string, unknown>>
  }
  ;(prisma as unknown as { __subscriptionUpdates: unknown }).__subscriptionUpdates =
    subscriptionUpdates
  ;(prisma as unknown as { __subscriptionCreates: unknown }).__subscriptionCreates =
    subscriptionCreates
  ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fnOrArr: unknown) => {
      if (typeof fnOrArr === "function") {
        return await (fnOrArr as (tx: unknown) => Promise<unknown>)(prisma)
      }
      return Promise.all(fnOrArr as unknown[])
    },
  )
  return prisma
}

describe("platform subscription-service", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_OPERATOR_TENANT_ID", OPERATOR_TENANT_ID)
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe("isSubscriptionBillingEnabled", () => {
    it("returns true when env var set", () => {
      expect(subscriptionService.isSubscriptionBillingEnabled()).toBe(true)
    })
    it("returns false when env var empty", () => {
      vi.stubEnv("PLATFORM_OPERATOR_TENANT_ID", "")
      expect(subscriptionService.isSubscriptionBillingEnabled()).toBe(false)
    })
  })

  describe("isOperatorTenant", () => {
    it("returns true for the env-configured operator tenant id", () => {
      expect(subscriptionService.isOperatorTenant(OPERATOR_TENANT_ID)).toBe(true)
    })
    it("returns false for any other tenant id", () => {
      expect(subscriptionService.isOperatorTenant(CUSTOMER_TENANT_ID)).toBe(false)
    })
    it("returns false when env var unset (no operator → nothing is the house)", () => {
      vi.stubEnv("PLATFORM_OPERATOR_TENANT_ID", "")
      expect(subscriptionService.isOperatorTenant(OPERATOR_TENANT_ID)).toBe(false)
    })
  })

  describe("marker helpers", () => {
    it("platformSubscriptionMarker formats correctly", () => {
      expect(platformSubscriptionMarker("abc")).toBe("[platform_subscription:abc]")
    })

    it("appendMarker handles null input", () => {
      expect(appendMarker(null, "x")).toBe("[platform_subscription:x]")
    })
    it("appendMarker handles empty string", () => {
      expect(appendMarker("", "x")).toBe("[platform_subscription:x]")
    })
    it("appendMarker appends with single space", () => {
      expect(appendMarker("[platform_subscription:a]", "b")).toBe(
        "[platform_subscription:a] [platform_subscription:b]",
      )
    })
    it("appendMarker does not dedupe — double-append creates two", () => {
      expect(appendMarker("[platform_subscription:x]", "x")).toBe(
        "[platform_subscription:x] [platform_subscription:x]",
      )
    })

    it("removeMarker removes leading marker", () => {
      expect(
        removeMarker("[platform_subscription:a] [platform_subscription:b]", "a"),
      ).toBe("[platform_subscription:b]")
    })
    it("removeMarker removes middle marker", () => {
      expect(
        removeMarker(
          "[platform_subscription:a] [platform_subscription:b] [platform_subscription:c]",
          "b",
        ),
      ).toBe("[platform_subscription:a] [platform_subscription:c]")
    })
    it("removeMarker removes trailing marker", () => {
      expect(
        removeMarker("[platform_subscription:a] [platform_subscription:b]", "b"),
      ).toBe("[platform_subscription:a]")
    })
    it("removeMarker with non-existent marker returns whitespace-normalized input", () => {
      expect(
        removeMarker("[platform_subscription:a]  [platform_subscription:b]", "z"),
      ).toBe("[platform_subscription:a] [platform_subscription:b]")
    })
    it("removeMarker handles null input", () => {
      expect(removeMarker(null, "a")).toBe("")
    })
  })

  describe("findOrCreateOperatorCrmAddress", () => {
    it("reuses existing CrmAddress when a prior subscription has one", async () => {
      const prisma = createMockPrisma({
        platformSubs: [
          {
            id: SUB_ID_OLD,
            tenantId: CUSTOMER_TENANT_ID,
            module: "core",
            status: "active",
            billingCycle: "MONTHLY",
            billingRecurringInvoiceId: RI_ID,
            operatorCrmAddressId: CRM_ADDRESS_ID,
            lastGeneratedInvoiceId: null,
          },
        ],
      })

      const result = await subscriptionService.findOrCreateOperatorCrmAddress(
        prisma,
        CUSTOMER_TENANT_ID,
      )
      expect(result).toBe(CRM_ADDRESS_ID)
      expect(crmAddressService.create).not.toHaveBeenCalled()
    })

    it("creates a new CrmAddress when no prior mapping exists", async () => {
      const prisma = createMockPrisma({ platformSubs: [] })
      ;(crmAddressService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: CRM_ADDRESS_ID,
      })

      const result = await subscriptionService.findOrCreateOperatorCrmAddress(
        prisma,
        CUSTOMER_TENANT_ID,
      )
      expect(result).toBe(CRM_ADDRESS_ID)
      expect(crmAddressService.create).toHaveBeenCalledWith(
        prisma,
        OPERATOR_TENANT_ID,
        expect.objectContaining({
          type: "CUSTOMER",
          company: "Test Customer GmbH",
          street: "Kundenstraße 1",
        }),
        expect.any(String),
      )
    })

    it("throws NOT_FOUND when tenant doesn't exist", async () => {
      const prisma = createMockPrisma({ customerTenant: null })
      await expect(
        subscriptionService.findOrCreateOperatorCrmAddress(
          prisma,
          CUSTOMER_TENANT_ID,
        ),
      ).rejects.toThrow(/not found/)
    })
  })

  describe("createSubscription", () => {
    it("creates NEW recurring invoice when none exists for (customer, cycle)", async () => {
      const prisma = createMockPrisma({
        platformSubs: [
          {
            id: SUB_ID_OLD,
            tenantId: CUSTOMER_TENANT_ID,
            module: "core",
            status: "active",
            billingCycle: "MONTHLY",
            billingRecurringInvoiceId: null,
            operatorCrmAddressId: CRM_ADDRESS_ID,
            lastGeneratedInvoiceId: null,
          },
        ],
        existingRecurring: null,
      })
      ;(billingRecurringService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: RI_ID,
      })

      const result = await subscriptionService.createSubscription(
        prisma,
        {
          customerTenantId: CUSTOMER_TENANT_ID,
          module: "crm",
          billingCycle: "MONTHLY",
        },
        PLATFORM_USER_ID,
      )

      expect(result.joinedExistingRecurring).toBe(false)
      expect(result.billingRecurringInvoiceId).toBe(RI_ID)
      expect(billingRecurringService.create).toHaveBeenCalledTimes(1)
      expect(billingRecurringService.update).not.toHaveBeenCalled()
      const createCall = (billingRecurringService.create as ReturnType<typeof vi.fn>).mock.calls[0]!
      const createInput = createCall[2] as {
        positionTemplate: Array<{ description: string }>
        internalNotes: string
      }
      expect(createInput.positionTemplate).toHaveLength(1)
      expect(createInput.positionTemplate[0]!.description).toMatch(/CRM/)
      expect(createInput.internalNotes).toContain("[platform_subscription:")
    })

    it("throws PlatformSubscriptionSelfBillError when customer === operator", async () => {
      const prisma = createMockPrisma({ platformSubs: [] })
      await expect(
        subscriptionService.createSubscription(
          prisma,
          {
            customerTenantId: OPERATOR_TENANT_ID,
            module: "crm",
            billingCycle: "MONTHLY",
          },
          PLATFORM_USER_ID,
        ),
      ).rejects.toBeInstanceOf(subscriptionService.PlatformSubscriptionSelfBillError)
      // No CrmAddress, no recurring invoice, no platform_subscriptions row.
      expect(crmAddressService.create).not.toHaveBeenCalled()
      expect(billingRecurringService.create).not.toHaveBeenCalled()
      expect(billingRecurringService.update).not.toHaveBeenCalled()
    })

    it("throws PlatformSubscriptionBillingExemptError when customer is billing-exempt", async () => {
      const prisma = createMockPrisma({
        platformSubs: [],
        customerTenant: { billingExempt: true },
      })
      await expect(
        subscriptionService.createSubscription(
          prisma,
          {
            customerTenantId: CUSTOMER_TENANT_ID,
            module: "crm",
            billingCycle: "MONTHLY",
          },
          PLATFORM_USER_ID,
        ),
      ).rejects.toBeInstanceOf(
        subscriptionService.PlatformSubscriptionBillingExemptError,
      )
      expect(crmAddressService.create).not.toHaveBeenCalled()
      expect(billingRecurringService.create).not.toHaveBeenCalled()
      expect(billingRecurringService.update).not.toHaveBeenCalled()
    })

    it("throws NOT_FOUND when customer tenant doesn't exist", async () => {
      const prisma = createMockPrisma({
        platformSubs: [],
        customerTenant: null,
      })
      await expect(
        subscriptionService.createSubscription(
          prisma,
          {
            customerTenantId: CUSTOMER_TENANT_ID,
            module: "crm",
            billingCycle: "MONTHLY",
          },
          PLATFORM_USER_ID,
        ),
      ).rejects.toThrow(/not found/)
      expect(crmAddressService.create).not.toHaveBeenCalled()
      expect(billingRecurringService.create).not.toHaveBeenCalled()
    })

    it("JOINS existing recurring invoice with matching cycle", async () => {
      const existing = {
        id: RI_ID,
        positionTemplate: [
          {
            type: "FREE",
            description: "Terp Core — Benutzer, Mitarbeiter, Stammdaten",
            quantity: 1,
            unit: "Monat",
            unitPrice: 8,
            vatRate: 19,
          },
        ],
        internalNotes: `[platform_subscription:${SUB_ID_OLD}]`,
      }
      const prisma = createMockPrisma({
        platformSubs: [
          {
            id: SUB_ID_OLD,
            tenantId: CUSTOMER_TENANT_ID,
            module: "core",
            status: "active",
            billingCycle: "MONTHLY",
            billingRecurringInvoiceId: RI_ID,
            operatorCrmAddressId: CRM_ADDRESS_ID,
            lastGeneratedInvoiceId: null,
          },
        ],
        existingRecurring: existing,
      })
      ;(billingRecurringService.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: RI_ID,
      })

      const result = await subscriptionService.createSubscription(
        prisma,
        {
          customerTenantId: CUSTOMER_TENANT_ID,
          module: "crm",
          billingCycle: "MONTHLY",
        },
        PLATFORM_USER_ID,
      )

      expect(result.joinedExistingRecurring).toBe(true)
      expect(result.billingRecurringInvoiceId).toBe(RI_ID)
      expect(billingRecurringService.create).not.toHaveBeenCalled()
      expect(billingRecurringService.update).toHaveBeenCalledTimes(1)
      const updateCall = (billingRecurringService.update as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(updateCall[2].positionTemplate).toHaveLength(2)
      expect(updateCall[2].internalNotes).toMatch(
        /\[platform_subscription:.+\] \[platform_subscription:.+\]/,
      )
    })
  })

  describe("cancelSubscription", () => {
    it("throws CONFLICT on already-cancelled subscription", async () => {
      const prisma = createMockPrisma({
        platformSubs: [
          {
            id: SUB_ID_OLD,
            tenantId: CUSTOMER_TENANT_ID,
            module: "crm",
            status: "cancelled",
            billingCycle: "MONTHLY",
            billingRecurringInvoiceId: RI_ID,
            operatorCrmAddressId: CRM_ADDRESS_ID,
            lastGeneratedInvoiceId: null,
          },
        ],
      })
      await expect(
        subscriptionService.cancelSubscription(
          prisma,
          { subscriptionId: SUB_ID_OLD, reason: "test" },
          PLATFORM_USER_ID,
        ),
      ).rejects.toThrow(/already/)
    })

    it("Path A (last sub) sets endDate on recurring invoice to nextDueDate - 1ms", async () => {
      const nextDueDate = new Date("2026-05-01T00:00:00Z")
      const prisma = createMockPrisma({
        platformSubs: [
          {
            id: SUB_ID_OLD,
            tenantId: CUSTOMER_TENANT_ID,
            module: "crm",
            status: "active",
            billingCycle: "MONTHLY",
            billingRecurringInvoiceId: RI_ID,
            operatorCrmAddressId: CRM_ADDRESS_ID,
            lastGeneratedInvoiceId: null,
          },
        ],
        siblingCount: 0,
        recurringRow: {
          nextDueDate,
          positionTemplate: [],
          internalNotes: `[platform_subscription:${SUB_ID_OLD}]`,
        },
      })

      await subscriptionService.cancelSubscription(
        prisma,
        { subscriptionId: SUB_ID_OLD, reason: "Path A" },
        PLATFORM_USER_ID,
      )

      expect(billingRecurringService.update).toHaveBeenCalledTimes(1)
      const updateCall = (billingRecurringService.update as ReturnType<typeof vi.fn>).mock.calls[0]!
      const expected = new Date(nextDueDate.getTime() - 1)
      expect((updateCall[2].endDate as Date).getTime()).toBe(expected.getTime())
      expect(updateCall[2].positionTemplate).toBeUndefined()
      expect(updateCall[2].internalNotes).toBeUndefined()
    })

    it("Path B (sibling remain) removes matching position and marker, no endDate", async () => {
      const prisma = createMockPrisma({
        platformSubs: [
          {
            id: SUB_ID_OLD,
            tenantId: CUSTOMER_TENANT_ID,
            module: "crm",
            status: "active",
            billingCycle: "MONTHLY",
            billingRecurringInvoiceId: RI_ID,
            operatorCrmAddressId: CRM_ADDRESS_ID,
            lastGeneratedInvoiceId: null,
          },
        ],
        siblingCount: 2,
        recurringRow: {
          nextDueDate: new Date("2026-05-01T00:00:00Z"),
          positionTemplate: [
            {
              type: "FREE",
              description: "Terp Core — Benutzer, Mitarbeiter, Stammdaten",
              quantity: 1,
              unit: "Monat",
              unitPrice: 8,
              vatRate: 19,
            },
            {
              type: "FREE",
              description: "Terp CRM — Adressen, Kontakte, Korrespondenz, Anfragen",
              quantity: 1,
              unit: "Monat",
              unitPrice: 4,
              vatRate: 19,
            },
          ],
          internalNotes: `[platform_subscription:${SUB_ID_OLD}] [platform_subscription:other]`,
        },
      })

      await subscriptionService.cancelSubscription(
        prisma,
        { subscriptionId: SUB_ID_OLD, reason: "Path B" },
        PLATFORM_USER_ID,
      )

      expect(billingRecurringService.update).toHaveBeenCalledTimes(1)
      const updateCall = (billingRecurringService.update as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(updateCall[2].endDate).toBeUndefined()
      expect(updateCall[2].positionTemplate).toHaveLength(1)
      expect((updateCall[2].positionTemplate as Array<{ description: string }>)[0]!.description).toMatch(/Core/)
      expect(updateCall[2].internalNotes).toBe("[platform_subscription:other]")
    })

    it("Path B with missing description logs warning but still removes marker", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const prisma = createMockPrisma({
        platformSubs: [
          {
            id: SUB_ID_OLD,
            tenantId: CUSTOMER_TENANT_ID,
            module: "crm",
            status: "active",
            billingCycle: "MONTHLY",
            billingRecurringInvoiceId: RI_ID,
            operatorCrmAddressId: CRM_ADDRESS_ID,
            lastGeneratedInvoiceId: null,
          },
        ],
        siblingCount: 1,
        recurringRow: {
          nextDueDate: new Date("2026-05-01T00:00:00Z"),
          positionTemplate: [
            {
              type: "FREE",
              description: "Terp Core — Benutzer, Mitarbeiter, Stammdaten",
              quantity: 1,
              unit: "Monat",
              unitPrice: 8,
              vatRate: 19,
            },
          ],
          internalNotes: `[platform_subscription:${SUB_ID_OLD}] [platform_subscription:other]`,
        },
      })

      await subscriptionService.cancelSubscription(
        prisma,
        { subscriptionId: SUB_ID_OLD, reason: "Path B orphan" },
        PLATFORM_USER_ID,
      )
      expect(warnSpy).toHaveBeenCalled()
      const updateCall = (billingRecurringService.update as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(updateCall[2].positionTemplate).toHaveLength(1)
      expect(updateCall[2].internalNotes).toBe("[platform_subscription:other]")
      warnSpy.mockRestore()
    })

    it("Path B with duplicate descriptions only removes ONE", async () => {
      const dupPos = {
        type: "FREE",
        description: "Terp CRM — Adressen, Kontakte, Korrespondenz, Anfragen",
        quantity: 1,
        unit: "Monat",
        unitPrice: 4,
        vatRate: 19,
      }
      const prisma = createMockPrisma({
        platformSubs: [
          {
            id: SUB_ID_OLD,
            tenantId: CUSTOMER_TENANT_ID,
            module: "crm",
            status: "active",
            billingCycle: "MONTHLY",
            billingRecurringInvoiceId: RI_ID,
            operatorCrmAddressId: CRM_ADDRESS_ID,
            lastGeneratedInvoiceId: null,
          },
        ],
        siblingCount: 1,
        recurringRow: {
          nextDueDate: new Date("2026-05-01T00:00:00Z"),
          positionTemplate: [dupPos, dupPos],
          internalNotes: `[platform_subscription:${SUB_ID_OLD}] [platform_subscription:other]`,
        },
      })

      await subscriptionService.cancelSubscription(
        prisma,
        { subscriptionId: SUB_ID_OLD, reason: "dup" },
        PLATFORM_USER_ID,
      )
      const updateCall = (billingRecurringService.update as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(updateCall[2].positionTemplate).toHaveLength(1)
    })
  })
})
