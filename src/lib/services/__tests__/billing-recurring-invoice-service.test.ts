import { describe, it, expect, vi } from "vitest"
import * as service from "../billing-recurring-invoice-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const REC_ID = "d0000000-0000-4000-a000-000000000010"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const DOC_ID = "e0000000-0000-4000-a000-000000000010"

const mockTemplate = {
  id: REC_ID,
  tenantId: TENANT_ID,
  name: "Wartungsvertrag Firma A",
  addressId: ADDRESS_ID,
  contactId: null,
  interval: "MONTHLY" as const,
  servicePeriodMode: "IN_ARREARS" as const,
  startDate: new Date("2026-01-01"),
  endDate: null,
  nextDueDate: new Date("2026-03-01"),
  lastGeneratedAt: new Date("2026-02-01"),
  autoGenerate: true,
  isActive: true,
  deliveryType: null,
  deliveryTerms: null,
  paymentTermDays: 30,
  discountPercent: null,
  discountDays: null,
  notes: null,
  internalNotes: null,
  positionTemplate: [
    { type: "FREE", description: "Monatliche Wartung", quantity: 1, unit: "Stk", unitPrice: 500, vatRate: 19 },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  address: { id: ADDRESS_ID, company: "Firma A" },
  contact: null,
}

function createMockPrisma(overrides: Record<string, Record<string, unknown>> = {}) {
  return {
    billingRecurringInvoice: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(mockTemplate),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.billingRecurringInvoice,
    },
    crmAddress: {
      findFirst: vi.fn().mockResolvedValue({ id: ADDRESS_ID, tenantId: TENANT_ID }),
      ...overrides.crmAddress,
    },
    crmContact: {
      findFirst: vi.fn().mockResolvedValue(null),
      ...overrides.crmContact,
    },
    billingDocument: {
      create: vi.fn().mockResolvedValue({ id: DOC_ID }),
      findFirst: vi.fn().mockResolvedValue({ id: DOC_ID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.billingDocument,
    },
    billingDocumentPosition: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      ...overrides.billingDocumentPosition,
    },
    numberSequence: {
      upsert: vi.fn().mockResolvedValue({ prefix: "RE-", nextValue: 2 }),
      ...overrides.numberSequence,
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(createMockPrisma(overrides))),
  } as unknown as PrismaClient
}

describe("billing-recurring-invoice-service", () => {
  // --- calculateNextDueDate ---
  describe("calculateNextDueDate", () => {
    it("advances MONTHLY by 1 month", () => {
      const result = service.calculateNextDueDate(new Date("2026-01-15"), "MONTHLY")
      expect(result.getMonth()).toBe(1) // February
      expect(result.getDate()).toBe(15)
    })

    it("advances QUARTERLY by 3 months", () => {
      const result = service.calculateNextDueDate(new Date("2026-01-01"), "QUARTERLY")
      expect(result.getMonth()).toBe(3) // April
    })

    it("advances SEMI_ANNUALLY by 6 months", () => {
      const result = service.calculateNextDueDate(new Date("2026-01-01"), "SEMI_ANNUALLY")
      expect(result.getMonth()).toBe(6) // July
    })

    it("advances ANNUALLY by 1 year", () => {
      const result = service.calculateNextDueDate(new Date("2026-01-01"), "ANNUALLY")
      expect(result.getFullYear()).toBe(2027)
      expect(result.getMonth()).toBe(0) // January
    })
  })

  // --- calculateServicePeriod ---
  describe("calculateServicePeriod", () => {
    function parts(d: Date) {
      return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
    }

    it("MONTHLY / IN_ARREARS: April generates period = previous month", () => {
      const { from, to } = service.calculateServicePeriod(new Date(2026, 3, 1), "MONTHLY", "IN_ARREARS")
      expect(parts(from)).toEqual({ y: 2026, m: 3, d: 1 })
      expect(parts(to)).toEqual({ y: 2026, m: 3, d: 31 })
    })

    it("MONTHLY / IN_ADVANCE: April generates period = April", () => {
      const { from, to } = service.calculateServicePeriod(new Date(2026, 3, 1), "MONTHLY", "IN_ADVANCE")
      expect(parts(from)).toEqual({ y: 2026, m: 4, d: 1 })
      expect(parts(to)).toEqual({ y: 2026, m: 4, d: 30 })
    })

    it("QUARTERLY / IN_ARREARS: April generates Q1 (Jan–Mar)", () => {
      const { from, to } = service.calculateServicePeriod(new Date(2026, 3, 1), "QUARTERLY", "IN_ARREARS")
      expect(parts(from)).toEqual({ y: 2026, m: 1, d: 1 })
      expect(parts(to)).toEqual({ y: 2026, m: 3, d: 31 })
    })

    it("QUARTERLY / IN_ADVANCE: April generates Q2 (Apr–Jun)", () => {
      const { from, to } = service.calculateServicePeriod(new Date(2026, 3, 1), "QUARTERLY", "IN_ADVANCE")
      expect(parts(from)).toEqual({ y: 2026, m: 4, d: 1 })
      expect(parts(to)).toEqual({ y: 2026, m: 6, d: 30 })
    })

    it("SEMI_ANNUALLY / IN_ARREARS: July generates H1 (Jan–Jun)", () => {
      const { from, to } = service.calculateServicePeriod(new Date(2026, 6, 1), "SEMI_ANNUALLY", "IN_ARREARS")
      expect(parts(from)).toEqual({ y: 2026, m: 1, d: 1 })
      expect(parts(to)).toEqual({ y: 2026, m: 6, d: 30 })
    })

    it("SEMI_ANNUALLY / IN_ADVANCE: July generates H2 (Jul–Dec)", () => {
      const { from, to } = service.calculateServicePeriod(new Date(2026, 6, 1), "SEMI_ANNUALLY", "IN_ADVANCE")
      expect(parts(from)).toEqual({ y: 2026, m: 7, d: 1 })
      expect(parts(to)).toEqual({ y: 2026, m: 12, d: 31 })
    })

    it("ANNUALLY / IN_ARREARS: Jan 2026 generates 2025", () => {
      const { from, to } = service.calculateServicePeriod(new Date(2026, 0, 15), "ANNUALLY", "IN_ARREARS")
      expect(parts(from)).toEqual({ y: 2025, m: 1, d: 1 })
      expect(parts(to)).toEqual({ y: 2025, m: 12, d: 31 })
    })

    it("ANNUALLY / IN_ADVANCE: Jan 2026 generates 2026", () => {
      const { from, to } = service.calculateServicePeriod(new Date(2026, 0, 15), "ANNUALLY", "IN_ADVANCE")
      expect(parts(from)).toEqual({ y: 2026, m: 1, d: 1 })
      expect(parts(to)).toEqual({ y: 2026, m: 12, d: 31 })
    })

    it("MONTHLY / IN_ARREARS: handles Jan→Dec year boundary (Jan 2026 → Dec 2025)", () => {
      const { from, to } = service.calculateServicePeriod(new Date(2026, 0, 1), "MONTHLY", "IN_ARREARS")
      expect(parts(from)).toEqual({ y: 2025, m: 12, d: 1 })
      expect(parts(to)).toEqual({ y: 2025, m: 12, d: 31 })
    })

    it("MONTHLY / IN_ADVANCE: handles Feb leap year (2024 → 29 days)", () => {
      const { from, to } = service.calculateServicePeriod(new Date(2024, 1, 1), "MONTHLY", "IN_ADVANCE")
      expect(parts(from)).toEqual({ y: 2024, m: 2, d: 1 })
      expect(parts(to)).toEqual({ y: 2024, m: 2, d: 29 })
    })
  })

  // --- list ---
  describe("list", () => {
    it("delegates to repository findMany", async () => {
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findMany: vi.fn().mockResolvedValue([mockTemplate]),
          count: vi.fn().mockResolvedValue(1),
        },
      })
      const result = await service.list(prisma, TENANT_ID, { page: 1, pageSize: 25 })
      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
    })
  })

  // --- getById ---
  describe("getById", () => {
    it("returns template when found", async () => {
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue(mockTemplate),
        },
      })
      const result = await service.getById(prisma, TENANT_ID, REC_ID)
      expect(result.id).toBe(REC_ID)
      expect(result.name).toBe("Wartungsvertrag Firma A")
    })

    it("throws NotFoundError when not found", async () => {
      const prisma = createMockPrisma()
      await expect(service.getById(prisma, TENANT_ID, REC_ID)).rejects.toThrow(
        service.BillingRecurringInvoiceNotFoundError
      )
    })
  })

  // --- create ---
  describe("create", () => {
    it("creates template with valid input", async () => {
      const prisma = createMockPrisma()
      const result = await service.create(
        prisma,
        TENANT_ID,
        {
          name: "Test Template",
          addressId: ADDRESS_ID,
          interval: "MONTHLY",
          startDate: new Date("2026-04-01"),
          positionTemplate: [
            { type: "FREE", description: "Test", quantity: 1, unitPrice: 100, vatRate: 19 },
          ],
        },
        USER_ID
      )
      expect(result).toBeDefined()
      expect(prisma.billingRecurringInvoice.create).toHaveBeenCalled()
    })

    it("throws validation error when address not in tenant", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        service.create(
          prisma,
          TENANT_ID,
          {
            name: "Test",
            addressId: ADDRESS_ID,
            interval: "MONTHLY",
            startDate: new Date("2026-04-01"),
            positionTemplate: [{ type: "FREE", description: "X", quantity: 1, unitPrice: 10 }],
          },
          USER_ID
        )
      ).rejects.toThrow("Address not found in this tenant")
    })

    it("throws validation error when positionTemplate is empty", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.create(
          prisma,
          TENANT_ID,
          {
            name: "Test",
            addressId: ADDRESS_ID,
            interval: "MONTHLY",
            startDate: new Date("2026-04-01"),
            positionTemplate: [],
          },
          USER_ID
        )
      ).rejects.toThrow("Position template must have at least one entry")
    })

    it("throws validation error when endDate <= startDate", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.create(
          prisma,
          TENANT_ID,
          {
            name: "Test",
            addressId: ADDRESS_ID,
            interval: "MONTHLY",
            startDate: new Date("2026-04-01"),
            endDate: new Date("2026-03-01"),
            positionTemplate: [{ type: "FREE", description: "X", quantity: 1, unitPrice: 10 }],
          },
          USER_ID
        )
      ).rejects.toThrow("End date must be after start date")
    })
  })

  // --- generate ---
  describe("generate", () => {
    it("creates INVOICE document from template", async () => {
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue(mockTemplate),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      const result = await service.generate(prisma, TENANT_ID, REC_ID, USER_ID)
      expect(result).toBeDefined()
      expect(prisma.$transaction).toHaveBeenCalled()
    })

    it("persists servicePeriodFrom/To computed from template mode + interval (IN_ARREARS MONTHLY)", async () => {
      const createSpy = vi.fn().mockResolvedValue({ id: DOC_ID })
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockTemplate,
            interval: "MONTHLY",
            servicePeriodMode: "IN_ARREARS",
            nextDueDate: new Date(2026, 3, 1), // 2026-04-01 local
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        billingDocument: {
          create: createSpy,
          findFirst: vi.fn().mockResolvedValue({ id: DOC_ID }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      await service.generate(prisma, TENANT_ID, REC_ID, USER_ID)
      const createCall = createSpy.mock.calls[0]?.[0] as { data: Record<string, unknown> }
      const from = createCall.data.servicePeriodFrom as Date
      const to = createCall.data.servicePeriodTo as Date
      expect(from.getFullYear()).toBe(2026)
      expect(from.getMonth()).toBe(2) // March
      expect(from.getDate()).toBe(1)
      expect(to.getFullYear()).toBe(2026)
      expect(to.getMonth()).toBe(2) // March
      expect(to.getDate()).toBe(31)
    })

    it("persists servicePeriodFrom/To from IN_ADVANCE MONTHLY as current month", async () => {
      const createSpy = vi.fn().mockResolvedValue({ id: DOC_ID })
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockTemplate,
            interval: "MONTHLY",
            servicePeriodMode: "IN_ADVANCE",
            nextDueDate: new Date(2026, 3, 1), // 2026-04-01 local
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        billingDocument: {
          create: createSpy,
          findFirst: vi.fn().mockResolvedValue({ id: DOC_ID }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      await service.generate(prisma, TENANT_ID, REC_ID, USER_ID)
      const createCall = createSpy.mock.calls[0]?.[0] as { data: Record<string, unknown> }
      const from = createCall.data.servicePeriodFrom as Date
      const to = createCall.data.servicePeriodTo as Date
      expect(from.getMonth()).toBe(3) // April
      expect(from.getDate()).toBe(1)
      expect(to.getMonth()).toBe(3) // April
      expect(to.getDate()).toBe(30)
    })

    it("throws when template is inactive", async () => {
      const inactiveTemplate = { ...mockTemplate, isActive: false }
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue(inactiveTemplate),
        },
      })
      await expect(service.generate(prisma, TENANT_ID, REC_ID, USER_ID)).rejects.toThrow(
        "Template is inactive"
      )
    })

    it("deactivates template when endDate is reached", async () => {
      const expiredTemplate = {
        ...mockTemplate,
        endDate: new Date("2026-02-15"),
        nextDueDate: new Date("2026-03-01"), // past endDate
      }
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue(expiredTemplate),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      await expect(service.generate(prisma, TENANT_ID, REC_ID, USER_ID)).rejects.toThrow(
        "Template end date has been reached"
      )
    })

    it("throws NotFoundError for non-existent template", async () => {
      const prisma = createMockPrisma()
      await expect(service.generate(prisma, TENANT_ID, REC_ID, USER_ID)).rejects.toThrow(
        service.BillingRecurringInvoiceNotFoundError
      )
    })
  })

  // --- generateDue ---
  describe("generateDue", () => {
    it("processes all due templates with autoGenerate=true", async () => {
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue(mockTemplate),
          findMany: vi.fn().mockResolvedValue([mockTemplate]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      const result = await service.generateDue(prisma, new Date("2026-03-15"))
      expect(result.generated).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.results).toHaveLength(1)
    })

    it("returns count of generated and failed", async () => {
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue(null), // will cause NotFoundError in transaction
          findMany: vi.fn().mockResolvedValue([mockTemplate]),
        },
      })
      const result = await service.generateDue(prisma, new Date("2026-03-15"))
      // The template is found via findMany (findDue) but generate will fail
      // because the transaction's findById returns null
      expect(result.failed).toBe(1)
      expect(result.results[0]?.error).toBeDefined()
    })
  })

  // --- activate / deactivate ---
  describe("activate / deactivate", () => {
    it("activate sets isActive=true", async () => {
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue({ ...mockTemplate, isActive: false }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      const result = await service.activate(prisma, TENANT_ID, REC_ID)
      expect(result).toBeDefined()
    })

    it("deactivate sets isActive=false", async () => {
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue(mockTemplate),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      const result = await service.deactivate(prisma, TENANT_ID, REC_ID)
      expect(result).toBeDefined()
    })

    it("throws NotFoundError for non-existent id", async () => {
      const prisma = createMockPrisma()
      await expect(service.activate(prisma, TENANT_ID, REC_ID)).rejects.toThrow(
        service.BillingRecurringInvoiceNotFoundError
      )
    })
  })

  // --- preview ---
  describe("preview", () => {
    it("returns preview with calculated totals", async () => {
      const prisma = createMockPrisma({
        billingRecurringInvoice: {
          findFirst: vi.fn().mockResolvedValue(mockTemplate),
        },
      })
      const result = await service.preview(prisma, TENANT_ID, REC_ID)
      expect(result.subtotalNet).toBe(500)
      expect(result.totalVat).toBe(95)
      expect(result.totalGross).toBe(595)
      expect(result.positions).toHaveLength(1)
    })

    it("throws NotFoundError when template not found", async () => {
      const prisma = createMockPrisma()
      await expect(service.preview(prisma, TENANT_ID, REC_ID)).rejects.toThrow(
        service.BillingRecurringInvoiceNotFoundError
      )
    })
  })
})
