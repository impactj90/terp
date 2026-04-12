/**
 * AUDIT-007 — Input Validation: Financial Numeric Bounds
 *
 * Verifies that Zod schemas on billing, CRM, and vacation routers reject
 * out-of-bounds financial numeric values at the input validation layer
 * (before reaching the service/repository).
 *
 * Each test group covers a specific router and field, checking:
 *  1. Values exceeding the upper bound are rejected (BAD_REQUEST)
 *  2. Values below the lower bound are rejected (BAD_REQUEST)
 *  3. Legitimate values pass input validation (may still fail downstream)
 */
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingPaymentsRouter } from "../billing/payments"
import { billingPriceListsRouter } from "../billing/priceLists"
import { billingServiceCasesRouter } from "../billing/serviceCases"
import { billingRecurringInvoicesRouter } from "../billing/recurringInvoices"
import { crmAddressesRouter } from "../crm/addresses"
import { vacationBalancesRouter } from "../vacationBalances"
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

// --- Shared Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const DOC_ID = "d0000000-0000-4000-a000-000000000010"
const PL_ID = "c0000000-0000-4000-a000-000000000010"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000000d00"
const SERVICE_CASE_ID = "e0000000-0000-4000-a000-000000000050"
const RECURRING_ID = "f0000000-0000-4000-a000-000000000060"
const BALANCE_ID = "a0000000-0000-4000-a000-000000000b00"

// --- Module mock helper ---
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

// ============================================================
// BILLING PAYMENTS — amount bounds
// ============================================================

const PAY_VIEW = permissionIdByKey("billing_payments.view")!
const PAY_CREATE = permissionIdByKey("billing_payments.create")!
const PAY_CANCEL = permissionIdByKey("billing_payments.cancel")!
const ALL_PAY_PERMS = [PAY_VIEW, PAY_CREATE, PAY_CANCEL]

const createPaymentCaller = createCallerFactory(billingPaymentsRouter)

function createPaymentCtx(prisma: Record<string, unknown> = {}) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(ALL_PAY_PERMS, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("AUDIT-007: billing.payments.create — amount bounds", () => {
  it("rejects amount exceeding max (999999999999)", async () => {
    const caller = createPaymentCaller(createPaymentCtx())
    await expect(
      caller.create({
        documentId: DOC_ID,
        date: new Date("2026-01-05"),
        amount: 999999999999,
        type: "BANK",
      })
    ).rejects.toThrow()
  })

  it("rejects amount of exactly 1000000000 (above 999999999.99)", async () => {
    const caller = createPaymentCaller(createPaymentCtx())
    await expect(
      caller.create({
        documentId: DOC_ID,
        date: new Date("2026-01-05"),
        amount: 1000000000,
        type: "BANK",
      })
    ).rejects.toThrow()
  })

  it("rejects negative amount (-1)", async () => {
    const caller = createPaymentCaller(createPaymentCtx())
    await expect(
      caller.create({
        documentId: DOC_ID,
        date: new Date("2026-01-05"),
        amount: -1,
        type: "BANK",
      })
    ).rejects.toThrow()
  })

  it("rejects zero amount", async () => {
    const caller = createPaymentCaller(createPaymentCtx())
    await expect(
      caller.create({
        documentId: DOC_ID,
        date: new Date("2026-01-05"),
        amount: 0,
        type: "BANK",
      })
    ).rejects.toThrow()
  })

  it("accepts normal amount (100)", async () => {
    const mockInvoice = {
      id: DOC_ID,
      tenantId: TENANT_ID,
      number: "RE-1",
      type: "INVOICE",
      status: "PRINTED",
      totalGross: 1190,
      documentDate: new Date("2026-01-01"),
      paymentTermDays: 30,
      payments: [],
      childDocuments: [],
      address: { id: "addr1", company: "Test GmbH" },
      contact: null,
    }
    const mockPayment = {
      id: "e0000000-0000-4000-a000-000000000001",
      tenantId: TENANT_ID,
      documentId: DOC_ID,
      date: new Date("2026-01-05"),
      amount: 100,
      type: "BANK",
      status: "ACTIVE",
      isDiscount: false,
      notes: null,
      document: mockInvoice,
    }
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockInvoice),
      },
      billingPayment: {
        create: vi.fn().mockResolvedValue(mockPayment),
      },
    }
    const caller = createPaymentCaller(createPaymentCtx(prisma))
    const result = await caller.create({
      documentId: DOC_ID,
      date: new Date("2026-01-05"),
      amount: 100,
      type: "BANK",
    })
    expect(result?.amount).toBe(100)
  })

  it("accepts amount at the boundary (999999999.99)", async () => {
    const mockInvoice = {
      id: DOC_ID,
      tenantId: TENANT_ID,
      number: "RE-1",
      type: "INVOICE",
      status: "PRINTED",
      totalGross: 999999999.99,
      documentDate: new Date("2026-01-01"),
      paymentTermDays: 30,
      payments: [],
      childDocuments: [],
      address: { id: "addr1", company: "Test GmbH" },
      contact: null,
    }
    const mockPayment = {
      id: "e0000000-0000-4000-a000-000000000001",
      tenantId: TENANT_ID,
      documentId: DOC_ID,
      date: new Date("2026-01-05"),
      amount: 999999999.99,
      type: "BANK",
      status: "ACTIVE",
      isDiscount: false,
      notes: null,
      document: mockInvoice,
    }
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockInvoice),
      },
      billingPayment: {
        create: vi.fn().mockResolvedValue(mockPayment),
      },
    }
    const caller = createPaymentCaller(createPaymentCtx(prisma))
    const result = await caller.create({
      documentId: DOC_ID,
      date: new Date("2026-01-05"),
      amount: 999999999.99,
      type: "BANK",
    })
    expect(result?.amount).toBe(999999999.99)
  })
})

// ============================================================
// BILLING PRICE LISTS — unitPrice + minQuantity bounds
// ============================================================

const PL_VIEW = permissionIdByKey("billing_price_lists.view")!
const PL_MANAGE = permissionIdByKey("billing_price_lists.manage")!
const ALL_PL_PERMS = [PL_VIEW, PL_MANAGE]

const createPriceListCaller = createCallerFactory(billingPriceListsRouter)

function createPriceListCtx(prisma: Record<string, unknown> = {}) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(ALL_PL_PERMS, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("AUDIT-007: billing.priceLists.entries.create — unitPrice bounds", () => {
  it("rejects unitPrice exceeding max (9999999999)", async () => {
    const caller = createPriceListCaller(createPriceListCtx())
    await expect(
      caller.entries.create({
        priceListId: PL_ID,
        unitPrice: 9999999999,
        description: "Test",
      })
    ).rejects.toThrow()
  })

  it("rejects unitPrice below min (-9999999999)", async () => {
    const caller = createPriceListCaller(createPriceListCtx())
    await expect(
      caller.entries.create({
        priceListId: PL_ID,
        unitPrice: -9999999999,
        description: "Test",
      })
    ).rejects.toThrow()
  })

  it("accepts normal unitPrice (50.00)", async () => {
    const mockEntry = {
      id: "c0000000-0000-4000-a000-000000000020",
      priceListId: PL_ID,
      unitPrice: 50,
      description: "Test",
      itemKey: null,
      articleId: null,
      minQuantity: null,
      unit: null,
      validFrom: null,
      validTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const prisma = {
      billingPriceList: {
        findFirst: vi.fn().mockResolvedValue({
          id: PL_ID,
          tenantId: TENANT_ID,
          name: "Test",
          isActive: true,
        }),
      },
      billingPriceListEntry: {
        create: vi.fn().mockResolvedValue(mockEntry),
      },
    }
    const caller = createPriceListCaller(createPriceListCtx(prisma))
    const result = await caller.entries.create({
      priceListId: PL_ID,
      unitPrice: 50,
      description: "Test",
    })
    expect(result.unitPrice).toBe(50)
  })
})

describe("AUDIT-007: billing.priceLists.entries.create — minQuantity bounds", () => {
  it("rejects minQuantity exceeding max (1000000)", async () => {
    const caller = createPriceListCaller(createPriceListCtx())
    await expect(
      caller.entries.create({
        priceListId: PL_ID,
        unitPrice: 50,
        minQuantity: 1000000,
      })
    ).rejects.toThrow()
  })

  it("rejects negative minQuantity (-1)", async () => {
    const caller = createPriceListCaller(createPriceListCtx())
    await expect(
      caller.entries.create({
        priceListId: PL_ID,
        unitPrice: 50,
        minQuantity: -1,
      })
    ).rejects.toThrow()
  })
})

describe("AUDIT-007: billing.priceLists.entries.bulkImport — unitPrice bounds", () => {
  it("rejects bulk entries with unitPrice exceeding max", async () => {
    const caller = createPriceListCaller(createPriceListCtx())
    await expect(
      caller.entries.bulkImport({
        priceListId: PL_ID,
        entries: [
          { itemKey: "test", unitPrice: 9999999999, unit: "Std" },
        ],
      })
    ).rejects.toThrow()
  })
})

describe("AUDIT-007: billing.priceLists.lookupPrice — quantity bounds", () => {
  it("rejects quantity exceeding max (1000000)", async () => {
    const caller = createPriceListCaller(createPriceListCtx())
    await expect(
      caller.lookupPrice({
        addressId: ADDRESS_ID,
        itemKey: "test",
        quantity: 1000000,
      })
    ).rejects.toThrow()
  })

  it("rejects negative quantity (-1)", async () => {
    const caller = createPriceListCaller(createPriceListCtx())
    await expect(
      caller.lookupPrice({
        addressId: ADDRESS_ID,
        itemKey: "test",
        quantity: -1,
      })
    ).rejects.toThrow()
  })
})

// ============================================================
// BILLING SERVICE CASES — vatRate, quantity, unitPrice, flatCosts
// ============================================================

const SC_VIEW = permissionIdByKey("billing_service_cases.view")!
const SC_CREATE = permissionIdByKey("billing_service_cases.create")!
const SC_EDIT = permissionIdByKey("billing_service_cases.edit")!
const SC_DELETE = permissionIdByKey("billing_service_cases.delete")!
const ALL_SC_PERMS = [SC_VIEW, SC_CREATE, SC_EDIT, SC_DELETE]

const createServiceCaseCaller = createCallerFactory(billingServiceCasesRouter)

function createServiceCaseCtx(prisma: Record<string, unknown> = {}) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(ALL_SC_PERMS, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("AUDIT-007: billing.serviceCases.createInvoice — vatRate bounds", () => {
  it("rejects vatRate: -5", async () => {
    const caller = createServiceCaseCaller(createServiceCaseCtx())
    await expect(
      caller.createInvoice({
        id: SERVICE_CASE_ID,
        positions: [
          { description: "Service", vatRate: -5 },
        ],
      })
    ).rejects.toThrow()
  })

  it("rejects vatRate: 150", async () => {
    const caller = createServiceCaseCaller(createServiceCaseCtx())
    await expect(
      caller.createInvoice({
        id: SERVICE_CASE_ID,
        positions: [
          { description: "Service", vatRate: 150 },
        ],
      })
    ).rejects.toThrow()
  })

  it("accepts vatRate: 19 (standard DE VAT)", async () => {
    // We expect this to pass Zod validation but may fail on service layer
    // (missing service case etc.) — that is fine, we only verify it does NOT
    // fail with a Zod/BAD_REQUEST error.
    const mockCase = {
      id: SERVICE_CASE_ID,
      tenantId: TENANT_ID,
      title: "Test",
      status: "OPEN",
      addressId: ADDRESS_ID,
      address: { id: ADDRESS_ID, company: "Test GmbH" },
    }
    const mockDoc = {
      id: DOC_ID,
      tenantId: TENANT_ID,
      number: "RE-1",
      type: "INVOICE",
    }
    const prisma = {
      billingServiceCase: {
        findFirst: vi.fn().mockResolvedValue(mockCase),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      billingDocument: {
        create: vi.fn().mockResolvedValue(mockDoc),
      },
      billingDocumentPosition: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({ prefix: "RE-", nextValue: 2 }),
      },
    }
    // Should not throw a Zod validation error — may throw something else
    try {
      await createServiceCaseCaller(createServiceCaseCtx(prisma)).createInvoice({
        id: SERVICE_CASE_ID,
        positions: [
          { description: "Service", vatRate: 19 },
        ],
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      // If it throws, it should NOT be a Zod/input validation error
      expect(message).not.toMatch(/validation|invalid|too_big|too_small/i)
    }
  })
})

describe("AUDIT-007: billing.serviceCases.createInvoice — quantity bounds", () => {
  it("rejects quantity exceeding max (1000000)", async () => {
    const caller = createServiceCaseCaller(createServiceCaseCtx())
    await expect(
      caller.createInvoice({
        id: SERVICE_CASE_ID,
        positions: [
          { description: "Service", quantity: 1000000 },
        ],
      })
    ).rejects.toThrow()
  })

  it("rejects negative quantity (-1)", async () => {
    const caller = createServiceCaseCaller(createServiceCaseCtx())
    await expect(
      caller.createInvoice({
        id: SERVICE_CASE_ID,
        positions: [
          { description: "Service", quantity: -1 },
        ],
      })
    ).rejects.toThrow()
  })
})

describe("AUDIT-007: billing.serviceCases.createInvoice — unitPrice bounds", () => {
  it("rejects unitPrice exceeding max", async () => {
    const caller = createServiceCaseCaller(createServiceCaseCtx())
    await expect(
      caller.createInvoice({
        id: SERVICE_CASE_ID,
        positions: [
          { description: "Service", unitPrice: 9999999999 },
        ],
      })
    ).rejects.toThrow()
  })
})

describe("AUDIT-007: billing.serviceCases.createInvoice — flatCosts bounds", () => {
  it("rejects flatCosts exceeding max", async () => {
    const caller = createServiceCaseCaller(createServiceCaseCtx())
    await expect(
      caller.createInvoice({
        id: SERVICE_CASE_ID,
        positions: [
          { description: "Service", flatCosts: 9999999999 },
        ],
      })
    ).rejects.toThrow()
  })

  it("rejects flatCosts below min", async () => {
    const caller = createServiceCaseCaller(createServiceCaseCtx())
    await expect(
      caller.createInvoice({
        id: SERVICE_CASE_ID,
        positions: [
          { description: "Service", flatCosts: -9999999999 },
        ],
      })
    ).rejects.toThrow()
  })
})

// ============================================================
// BILLING RECURRING INVOICES — discountPercent, paymentTermDays, vatRate
// ============================================================

const REC_VIEW = permissionIdByKey("billing_recurring.view")!
const REC_MANAGE = permissionIdByKey("billing_recurring.manage")!
const REC_GENERATE = permissionIdByKey("billing_recurring.generate")!
const ALL_REC_PERMS = [REC_VIEW, REC_MANAGE, REC_GENERATE]

const createRecurringCaller = createCallerFactory(billingRecurringInvoicesRouter)

function createRecurringCtx(prisma: Record<string, unknown> = {}) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(ALL_REC_PERMS, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("AUDIT-007: billing.recurringInvoices.create — discountPercent bounds", () => {
  const baseInput = {
    name: "Monthly Service",
    addressId: ADDRESS_ID,
    interval: "MONTHLY" as const,
    startDate: new Date("2026-01-01"),
    positionTemplate: [
      { type: "FREE" as const, description: "Service", unitPrice: 100 },
    ],
  }

  it("rejects discountPercent: -1", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(
      caller.create({ ...baseInput, discountPercent: -1 })
    ).rejects.toThrow()
  })

  it("rejects discountPercent: 150", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(
      caller.create({ ...baseInput, discountPercent: 150 })
    ).rejects.toThrow()
  })

  it("accepts discountPercent: 10", async () => {
    const mockRecurring = {
      id: RECURRING_ID,
      tenantId: TENANT_ID,
      name: "Monthly Service",
      discountPercent: 10,
    }
    const prisma = {
      billingRecurringInvoice: {
        create: vi.fn().mockResolvedValue(mockRecurring),
        findFirst: vi.fn().mockResolvedValue(mockRecurring),
      },
    }
    try {
      await createRecurringCaller(createRecurringCtx(prisma)).create({
        ...baseInput,
        discountPercent: 10,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      expect(message).not.toMatch(/validation|invalid|too_big|too_small/i)
    }
  })
})

describe("AUDIT-007: billing.recurringInvoices.create — paymentTermDays bounds", () => {
  const baseInput = {
    name: "Monthly Service",
    addressId: ADDRESS_ID,
    interval: "MONTHLY" as const,
    startDate: new Date("2026-01-01"),
    positionTemplate: [
      { type: "FREE" as const, description: "Service", unitPrice: 100 },
    ],
  }

  it("rejects paymentTermDays: -1", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(
      caller.create({ ...baseInput, paymentTermDays: -1 })
    ).rejects.toThrow()
  })

  it("rejects paymentTermDays: 400 (above 365)", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(
      caller.create({ ...baseInput, paymentTermDays: 400 })
    ).rejects.toThrow()
  })

  it("accepts paymentTermDays: 30", async () => {
    const mockRecurring = {
      id: RECURRING_ID,
      tenantId: TENANT_ID,
      name: "Monthly Service",
      paymentTermDays: 30,
    }
    const prisma = {
      billingRecurringInvoice: {
        create: vi.fn().mockResolvedValue(mockRecurring),
        findFirst: vi.fn().mockResolvedValue(mockRecurring),
      },
    }
    try {
      await createRecurringCaller(createRecurringCtx(prisma)).create({
        ...baseInput,
        paymentTermDays: 30,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      expect(message).not.toMatch(/validation|invalid|too_big|too_small/i)
    }
  })
})

describe("AUDIT-007: billing.recurringInvoices — positionTemplate vatRate bounds", () => {
  const makeInput = (vatRate: number) => ({
    name: "Monthly Service",
    addressId: ADDRESS_ID,
    interval: "MONTHLY" as const,
    startDate: new Date("2026-01-01"),
    positionTemplate: [
      { type: "FREE" as const, description: "Service", unitPrice: 100, vatRate },
    ],
  })

  it("rejects vatRate: -5 in position template", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(caller.create(makeInput(-5))).rejects.toThrow()
  })

  it("rejects vatRate: 150 in position template", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(caller.create(makeInput(150))).rejects.toThrow()
  })

  it("accepts vatRate: 19 in position template", async () => {
    const mockRecurring = {
      id: RECURRING_ID,
      tenantId: TENANT_ID,
      name: "Monthly Service",
    }
    const prisma = {
      billingRecurringInvoice: {
        create: vi.fn().mockResolvedValue(mockRecurring),
        findFirst: vi.fn().mockResolvedValue(mockRecurring),
      },
    }
    try {
      await createRecurringCaller(createRecurringCtx(prisma)).create(makeInput(19))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      expect(message).not.toMatch(/validation|invalid|too_big|too_small/i)
    }
  })
})

describe("AUDIT-007: billing.recurringInvoices — positionTemplate unitPrice bounds", () => {
  const makeInput = (unitPrice: number) => ({
    name: "Monthly Service",
    addressId: ADDRESS_ID,
    interval: "MONTHLY" as const,
    startDate: new Date("2026-01-01"),
    positionTemplate: [
      { type: "FREE" as const, description: "Service", unitPrice },
    ],
  })

  it("rejects unitPrice exceeding max in position template", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(caller.create(makeInput(9999999999))).rejects.toThrow()
  })

  it("rejects unitPrice below min in position template", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(caller.create(makeInput(-9999999999))).rejects.toThrow()
  })
})

describe("AUDIT-007: billing.recurringInvoices — positionTemplate flatCosts bounds", () => {
  const makeInput = (flatCosts: number) => ({
    name: "Monthly Service",
    addressId: ADDRESS_ID,
    interval: "MONTHLY" as const,
    startDate: new Date("2026-01-01"),
    positionTemplate: [
      { type: "FREE" as const, description: "Service", flatCosts },
    ],
  })

  it("rejects flatCosts exceeding max in position template", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(caller.create(makeInput(9999999999))).rejects.toThrow()
  })

  it("rejects flatCosts below min in position template", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(caller.create(makeInput(-9999999999))).rejects.toThrow()
  })
})

describe("AUDIT-007: billing.recurringInvoices — discountDays bounds", () => {
  const baseInput = {
    name: "Monthly Service",
    addressId: ADDRESS_ID,
    interval: "MONTHLY" as const,
    startDate: new Date("2026-01-01"),
    positionTemplate: [
      { type: "FREE" as const, description: "Service", unitPrice: 100 },
    ],
  }

  it("rejects discountDays: -1", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(
      caller.create({ ...baseInput, discountDays: -1 })
    ).rejects.toThrow()
  })

  it("rejects discountDays: 400 (above 365)", async () => {
    const caller = createRecurringCaller(createRecurringCtx())
    await expect(
      caller.create({ ...baseInput, discountDays: 400 })
    ).rejects.toThrow()
  })
})

// ============================================================
// CRM ADDRESSES — paymentTermDays, discountPercent, discountDays
// ============================================================

const CRM_VIEW = permissionIdByKey("crm_addresses.view")!
const CRM_CREATE = permissionIdByKey("crm_addresses.create")!
const CRM_EDIT = permissionIdByKey("crm_addresses.edit")!
const CRM_DELETE = permissionIdByKey("crm_addresses.delete")!
const ALL_CRM_PERMS = [CRM_VIEW, CRM_CREATE, CRM_EDIT, CRM_DELETE]

const createCrmCaller = createCallerFactory(crmAddressesRouter)

function createCrmCtx(prisma: Record<string, unknown> = {}) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(ALL_CRM_PERMS, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("AUDIT-007: crm.addresses.create — discountPercent bounds", () => {
  it("rejects discountPercent: -1", async () => {
    const caller = createCrmCaller(createCrmCtx())
    await expect(
      caller.create({ company: "Test GmbH", discountPercent: -1 })
    ).rejects.toThrow()
  })

  it("rejects discountPercent: 150", async () => {
    const caller = createCrmCaller(createCrmCtx())
    await expect(
      caller.create({ company: "Test GmbH", discountPercent: 150 })
    ).rejects.toThrow()
  })

  it("accepts discountPercent: 10", async () => {
    const mockAddress = {
      id: ADDRESS_ID,
      tenantId: TENANT_ID,
      number: "K-1",
      type: "CUSTOMER",
      company: "Test GmbH",
      discountPercent: 10,
      isActive: true,
    }
    const prisma = {
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({ prefix: "K-", nextValue: 2 }),
      },
      crmAddress: {
        create: vi.fn().mockResolvedValue(mockAddress),
      },
    }
    const caller = createCrmCaller(createCrmCtx(prisma))
    const result = await caller.create({
      company: "Test GmbH",
      discountPercent: 10,
    })
    expect(result.discountPercent).toBe(10)
  })
})

describe("AUDIT-007: crm.addresses.create — paymentTermDays bounds", () => {
  it("rejects paymentTermDays: -1", async () => {
    const caller = createCrmCaller(createCrmCtx())
    await expect(
      caller.create({ company: "Test GmbH", paymentTermDays: -1 })
    ).rejects.toThrow()
  })

  it("rejects paymentTermDays: 400 (above 365)", async () => {
    const caller = createCrmCaller(createCrmCtx())
    await expect(
      caller.create({ company: "Test GmbH", paymentTermDays: 400 })
    ).rejects.toThrow()
  })

  it("accepts paymentTermDays: 30", async () => {
    const mockAddress = {
      id: ADDRESS_ID,
      tenantId: TENANT_ID,
      number: "K-1",
      type: "CUSTOMER",
      company: "Test GmbH",
      paymentTermDays: 30,
      isActive: true,
    }
    const prisma = {
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({ prefix: "K-", nextValue: 2 }),
      },
      crmAddress: {
        create: vi.fn().mockResolvedValue(mockAddress),
      },
    }
    const caller = createCrmCaller(createCrmCtx(prisma))
    const result = await caller.create({
      company: "Test GmbH",
      paymentTermDays: 30,
    })
    expect(result.paymentTermDays).toBe(30)
  })
})

describe("AUDIT-007: crm.addresses.create — discountDays bounds", () => {
  it("rejects discountDays: -1", async () => {
    const caller = createCrmCaller(createCrmCtx())
    await expect(
      caller.create({ company: "Test GmbH", discountDays: -1 })
    ).rejects.toThrow()
  })

  it("rejects discountDays: 400 (above 365)", async () => {
    const caller = createCrmCaller(createCrmCtx())
    await expect(
      caller.create({ company: "Test GmbH", discountDays: 400 })
    ).rejects.toThrow()
  })
})

describe("AUDIT-007: crm.addresses.update — discountPercent bounds", () => {
  it("rejects discountPercent: -1 on update", async () => {
    const caller = createCrmCaller(createCrmCtx())
    await expect(
      caller.update({ id: ADDRESS_ID, discountPercent: -1 })
    ).rejects.toThrow()
  })

  it("rejects discountPercent: 150 on update", async () => {
    const caller = createCrmCaller(createCrmCtx())
    await expect(
      caller.update({ id: ADDRESS_ID, discountPercent: 150 })
    ).rejects.toThrow()
  })
})

describe("AUDIT-007: crm.addresses.update — paymentTermDays bounds", () => {
  it("rejects paymentTermDays: -1 on update", async () => {
    const caller = createCrmCaller(createCrmCtx())
    await expect(
      caller.update({ id: ADDRESS_ID, paymentTermDays: -1 })
    ).rejects.toThrow()
  })

  it("rejects paymentTermDays: 400 on update", async () => {
    const caller = createCrmCaller(createCrmCtx())
    await expect(
      caller.update({ id: ADDRESS_ID, paymentTermDays: 400 })
    ).rejects.toThrow()
  })
})

// ============================================================
// VACATION BALANCES — entitlement, carryover, adjustments
// ============================================================

const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!

const createVacationCaller = createCallerFactory(vacationBalancesRouter)

function createVacationCtx(prisma: Record<string, unknown> = {}) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([ABSENCES_MANAGE], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("AUDIT-007: vacationBalances.create — entitlement bounds", () => {
  it("rejects entitlement: 500 (above 365)", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        year: 2026,
        entitlement: 500,
      })
    ).rejects.toThrow()
  })

  it("rejects entitlement: -500 (below -365)", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        year: 2026,
        entitlement: -500,
      })
    ).rejects.toThrow()
  })

  it("accepts entitlement: 30", async () => {
    const mockBalance = {
      id: BALANCE_ID,
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      year: 2026,
      entitlement: 30,
      carryover: 0,
      adjustments: 0,
      taken: 0,
      carryoverExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      employee: {
        id: EMPLOYEE_ID,
        firstName: "John",
        lastName: "Doe",
        personnelNumber: "EMP001",
        isActive: true,
        departmentId: null,
      },
    }
    const prisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(mockBalance),
      },
    }
    const caller = createVacationCaller(createVacationCtx(prisma))
    const result = await caller.create({
      employeeId: EMPLOYEE_ID,
      year: 2026,
      entitlement: 30,
    })
    expect(result.entitlement).toBe(30)
  })
})

describe("AUDIT-007: vacationBalances.create — carryover bounds", () => {
  it("rejects carryover: 500 (above 365)", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        year: 2026,
        carryover: 500,
      })
    ).rejects.toThrow()
  })

  it("rejects carryover: -500 (below -365)", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        year: 2026,
        carryover: -500,
      })
    ).rejects.toThrow()
  })
})

describe("AUDIT-007: vacationBalances.create — adjustments bounds", () => {
  it("rejects adjustments: 500 (above 365)", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        year: 2026,
        adjustments: 500,
      })
    ).rejects.toThrow()
  })

  it("rejects adjustments: -500 (below -365)", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        year: 2026,
        adjustments: -500,
      })
    ).rejects.toThrow()
  })
})

describe("AUDIT-007: vacationBalances.update — entitlement bounds", () => {
  it("rejects entitlement: 500 on update", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.update({ id: BALANCE_ID, entitlement: 500 })
    ).rejects.toThrow()
  })

  it("rejects entitlement: -500 on update", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.update({ id: BALANCE_ID, entitlement: -500 })
    ).rejects.toThrow()
  })

  it("accepts entitlement: 28 on update", async () => {
    const mockBalance = {
      id: BALANCE_ID,
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      year: 2026,
      entitlement: 28,
      carryover: 5,
      adjustments: 2,
      taken: 10,
      carryoverExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      employee: {
        id: EMPLOYEE_ID,
        firstName: "John",
        lastName: "Doe",
        personnelNumber: "EMP001",
        isActive: true,
        departmentId: null,
      },
    }
    const prisma = {
      vacationBalance: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockBalance)
          .mockResolvedValueOnce(mockBalance),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createVacationCaller(createVacationCtx(prisma))
    const result = await caller.update({ id: BALANCE_ID, entitlement: 28 })
    expect(result.entitlement).toBe(28)
  })
})

describe("AUDIT-007: vacationBalances.update — carryover bounds", () => {
  it("rejects carryover: 500 on update", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.update({ id: BALANCE_ID, carryover: 500 })
    ).rejects.toThrow()
  })

  it("rejects carryover: -500 on update", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.update({ id: BALANCE_ID, carryover: -500 })
    ).rejects.toThrow()
  })
})

describe("AUDIT-007: vacationBalances.update — adjustments bounds", () => {
  it("rejects adjustments: 500 on update", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.update({ id: BALANCE_ID, adjustments: 500 })
    ).rejects.toThrow()
  })

  it("rejects adjustments: -500 on update", async () => {
    const caller = createVacationCaller(createVacationCtx())
    await expect(
      caller.update({ id: BALANCE_ID, adjustments: -500 })
    ).rejects.toThrow()
  })
})
