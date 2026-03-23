/**
 * AUDIT-004 verification tests
 *
 * Verifies that billing-document-einvoice-service and macro-executor
 * use tenant-scoped repository methods instead of direct Prisma writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// --- Constants ---

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const DOC_ID = "d0000000-0000-4000-a000-000000000001"
const EXECUTION_ID = "e0000000-0000-4000-a000-000000000001"
const MACRO_ID = "m0000000-0000-4000-a000-000000000001"
const ASSIGNMENT_ID = "a0000000-0000-4000-a000-000000000010"

// ============================================================================
// Mocks for billing-document-einvoice-service dependencies
// ============================================================================

vi.mock("@e-invoice-eu/core", () => {
  const MockInvoiceService = class {
    generate = vi.fn().mockResolvedValue("<xml>test</xml>")
  }
  return { InvoiceService: MockInvoiceService }
})

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({
        download: vi.fn().mockResolvedValue({
          data: new Blob(["fake-pdf"]),
          error: null,
        }),
        upload: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
}))

vi.mock("@/lib/config", () => ({
  clientEnv: { supabaseUrl: "http://localhost:54321" },
  serverEnv: { supabaseUrl: "http://localhost:54321" },
}))

vi.mock("@/lib/pdf/pdf-storage", () => ({
  getXmlStoragePath: vi.fn().mockReturnValue("tenants/test/einvoice.xml"),
  getStoragePath: vi.fn().mockReturnValue("tenants/test/invoice.pdf"),
}))

// Mock billing-document-service (getById) — used by einvoice-service via relative import
vi.mock("../billing-document-service", () => ({
  getById: vi.fn().mockResolvedValue({
    id: "d0000000-0000-4000-a000-000000000001",
    tenantId: "a0000000-0000-4000-a000-000000000100",
    number: "RE-2026-001",
    type: "INVOICE",
    status: "PRINTED",
    addressId: "b0000000-0000-4000-a000-000000000001",
    documentDate: new Date("2026-03-20"),
    deliveryDate: null,
    paymentTermDays: 30,
    discountPercent: null,
    discountDays: null,
    subtotalNet: 1000,
    totalVat: 190,
    totalGross: 1190,
    positions: [
      {
        id: "p0000000-0000-4000-a000-000000000001",
        documentId: "d0000000-0000-4000-a000-000000000001",
        sortOrder: 1,
        type: "ARTICLE",
        description: "Software Development",
        quantity: 10,
        unit: "Std",
        unitPrice: 100,
        totalPrice: 1000,
        vatRate: 19,
      },
    ],
  }),
}))

// Mock billing-tenant-config-repository — used by einvoice-service via relative import
vi.mock("../billing-tenant-config-repository", () => ({
  findByTenantId: vi.fn().mockResolvedValue({
    id: "c0000000-0000-4000-a000-000000000001",
    tenantId: "a0000000-0000-4000-a000-000000000100",
    companyName: "Test GmbH",
    companyStreet: "Musterstr. 1",
    companyZip: "12345",
    companyCity: "Musterstadt",
    companyCountry: "DE",
    taxId: "DE123456789",
    taxNumber: null,
    iban: "DE89370400440532013000",
    bic: "COBADEFFXXX",
    bankName: "Sparkasse",
    email: null,
    phone: null,
    eInvoiceEnabled: true,
  }),
}))

// Spy on billing-document-repository (relative path used by einvoice-service)
vi.mock("../billing-document-repository", () => ({
  update: vi.fn().mockResolvedValue({
    id: "d0000000-0000-4000-a000-000000000001",
    tenantId: "a0000000-0000-4000-a000-000000000100",
    eInvoiceXmlUrl: "tenants/test/einvoice.xml",
  }),
}))

// ============================================================================
// Mocks for macro-executor dependencies (absolute @/ paths)
// ============================================================================

// Mock macros-repository — macro-executor imports via @/lib/services/macros-repository
vi.mock("@/lib/services/macros-repository", () => ({
  updateExecution: vi.fn().mockResolvedValue({
    id: "e0000000-0000-4000-a000-000000000001",
    tenantId: "a0000000-0000-4000-a000-000000000100",
    status: "completed",
  }),
}))

// Mock macros-service — macro-executor imports executeAction via @/lib/services/macros-service
vi.mock("@/lib/services/macros-service", () => ({
  executeAction: vi.fn(),
}))

// ============================================================================
// Test 1 — E-invoice uses billingDocRepo.update() with tenantId
// ============================================================================

describe("AUDIT-004: billing-document-einvoice-service tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("AUDIT-004: generateAndStoreEInvoice calls billingDocRepo.update() with tenantId", async () => {
    const billingDocRepo = await import("../billing-document-repository")

    const prisma = {
      crmAddress: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "b0000000-0000-4000-a000-000000000001",
          tenantId: TENANT_ID,
          company: "Kunde AG",
          street: "Kundenstr. 5",
          zip: "54321",
          city: "Kundenstadt",
          country: "DE",
          vatId: "DE987654321",
          leitwegId: null,
        }),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient

    const { generateAndStoreEInvoice } = await import(
      "../billing-document-einvoice-service"
    )

    const result = await generateAndStoreEInvoice(prisma, TENANT_ID, DOC_ID)

    // Verify the repo update was called (not direct Prisma)
    expect(billingDocRepo.update).toHaveBeenCalledTimes(1)

    // Verify tenantId is passed as second argument
    const [calledPrisma, calledTenantId, calledDocId, calledData] =
      (billingDocRepo.update as ReturnType<typeof vi.fn>).mock.calls[0]

    expect(calledPrisma).toBe(prisma)
    expect(calledTenantId).toBe(TENANT_ID)
    expect(calledDocId).toBe(DOC_ID)
    expect(calledData).toEqual({ eInvoiceXmlUrl: expect.any(String) })

    // Verify result
    expect(result).toHaveProperty("xmlStoragePath")
  })

  it("AUDIT-004: eInvoiceXmlUrl is saved via tenant-scoped repo, not bare prisma.update", async () => {
    const billingDocRepo = await import("../billing-document-repository")

    const prisma = {
      crmAddress: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "b0000000-0000-4000-a000-000000000001",
          tenantId: TENANT_ID,
          company: "Kunde AG",
          street: "Kundenstr. 5",
          zip: "54321",
          city: "Kundenstadt",
          country: "DE",
          vatId: null,
          leitwegId: null,
        }),
      },
      // Deliberately add billingDocument.update to catch regressions
      billingDocument: {
        update: vi.fn(),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient

    const { generateAndStoreEInvoice } = await import(
      "../billing-document-einvoice-service"
    )

    await generateAndStoreEInvoice(prisma, TENANT_ID, DOC_ID)

    // billingDocRepo.update should be called
    expect(billingDocRepo.update).toHaveBeenCalledTimes(1)

    // Direct prisma.billingDocument.update should NOT be called
    expect(
      (prisma as unknown as { billingDocument: { update: ReturnType<typeof vi.fn> } })
        .billingDocument.update
    ).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Test 2, 3, 4 — Macro executor tenant-scoped execution + assignment updates
// ============================================================================

describe("AUDIT-004: macro-executor tenant isolation", () => {
  const mockMacro = {
    id: MACRO_ID,
    tenantId: TENANT_ID,
    name: "Test Macro",
    macroType: "weekly",
    actionType: "log_message",
    actionParams: {},
    isActive: true,
    assignments: [
      {
        id: ASSIGNMENT_ID,
        tenantId: TENANT_ID,
        macroId: MACRO_ID,
        executionDay: 1, // Monday
        isActive: true,
        lastExecutedDate: null,
        lastExecutedAt: null,
      },
    ],
  }

  function createMockPrisma() {
    return {
      macro: {
        findMany: vi.fn(),
      },
      macroExecution: {
        create: vi.fn().mockResolvedValue({
          id: EXECUTION_ID,
          tenantId: TENANT_ID,
          macroId: MACRO_ID,
          assignmentId: ASSIGNMENT_ID,
          status: "running",
        }),
        update: vi.fn(), // Should NOT be called — tracks regression
      },
      macroAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("AUDIT-004: success path calls macrosRepo.updateExecution() with tenantId and correct data shape", async () => {
    const macrosRepo = await import("@/lib/services/macros-repository")
    const macrosService = await import("@/lib/services/macros-service")

    ;(macrosService.executeAction as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { action: "log_message", executed_at: "2026-03-23" },
      error: null,
    })

    const prisma = createMockPrisma()
    ;(prisma.macro.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([mockMacro]) // weekly
      .mockResolvedValueOnce([]) // monthly

    const { MacroExecutor } = await import("../macro-executor")
    const executor = new MacroExecutor(prisma)

    // Monday 2026-03-23
    const monday = new Date(Date.UTC(2026, 2, 23))
    const result = await executor.executeDueMacros(TENANT_ID, monday)

    expect(result.executed).toBe(1)
    expect(result.failed).toBe(0)

    // Verify macrosRepo.updateExecution was called with tenant-scoped args
    expect(macrosRepo.updateExecution).toHaveBeenCalledTimes(1)
    expect(macrosRepo.updateExecution).toHaveBeenCalledWith(
      prisma,
      TENANT_ID,
      EXECUTION_ID,
      {
        completedAt: expect.any(Date),
        status: "completed",
        result: expect.any(Object),
        errorMessage: null,
      }
    )

    // Verify the data shape includes all 4 required fields
    const updateCall = (macrosRepo.updateExecution as ReturnType<typeof vi.fn>).mock.calls[0]
    const data = updateCall[3]
    expect(data).toHaveProperty("completedAt")
    expect(data).toHaveProperty("status")
    expect(data).toHaveProperty("result")
    expect(data).toHaveProperty("errorMessage")

    // Direct prisma.macroExecution.update should NOT be called
    expect(
      (prisma.macroExecution as unknown as { update: ReturnType<typeof vi.fn> }).update
    ).not.toHaveBeenCalled()
  })

  it("AUDIT-004: failure path calls macrosRepo.updateExecution() with status 'failed' and error message", async () => {
    const macrosRepo = await import("@/lib/services/macros-repository")
    const macrosService = await import("@/lib/services/macros-service")

    // Mock executeAction to return an error result (non-throwing)
    ;(macrosService.executeAction as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: null,
      error: "Something went wrong",
    })

    const prisma = createMockPrisma()
    ;(prisma.macro.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([mockMacro]) // weekly
      .mockResolvedValueOnce([]) // monthly

    const { MacroExecutor } = await import("../macro-executor")
    const executor = new MacroExecutor(prisma)

    const monday = new Date(Date.UTC(2026, 2, 23))
    const result = await executor.executeDueMacros(TENANT_ID, monday)

    // Action returned error, so executeSingleMacro throws -> counted as failed
    expect(result.failed).toBe(1)

    // Verify updateExecution was called with "failed" status
    expect(macrosRepo.updateExecution).toHaveBeenCalledTimes(1)
    expect(macrosRepo.updateExecution).toHaveBeenCalledWith(
      prisma,
      TENANT_ID,
      EXECUTION_ID,
      {
        completedAt: expect.any(Date),
        status: "failed",
        result: {},
        errorMessage: "Something went wrong",
      }
    )

    // Direct prisma.macroExecution.update should NOT be called
    expect(
      (prisma.macroExecution as unknown as { update: ReturnType<typeof vi.fn> }).update
    ).not.toHaveBeenCalled()
  })

  it("AUDIT-004: catch block updates execution AND re-throws the error", async () => {
    const macrosRepo = await import("@/lib/services/macros-repository")
    const macrosService = await import("@/lib/services/macros-service")

    const thrownError = new Error("Unexpected runtime crash")

    // Mock executeAction to THROW (not return error -- actual throw)
    ;(macrosService.executeAction as ReturnType<typeof vi.fn>).mockRejectedValue(
      thrownError
    )

    const prisma = createMockPrisma()
    ;(prisma.macro.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([mockMacro]) // weekly
      .mockResolvedValueOnce([]) // monthly

    const { MacroExecutor } = await import("../macro-executor")
    const executor = new MacroExecutor(prisma)

    const monday = new Date(Date.UTC(2026, 2, 23))
    const result = await executor.executeDueMacros(TENANT_ID, monday)

    // The error is caught in executeDueMacros and counted as failed
    expect(result.failed).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toBe("Unexpected runtime crash")

    // Verify updateExecution was called in catch block with "failed" + error message
    expect(macrosRepo.updateExecution).toHaveBeenCalledTimes(1)
    expect(macrosRepo.updateExecution).toHaveBeenCalledWith(
      prisma,
      TENANT_ID,
      EXECUTION_ID,
      {
        completedAt: expect.any(Date),
        status: "failed",
        result: {},
        errorMessage: String(thrownError),
      }
    )

    // Verify it was the catch block path -- status "failed" with empty result object
    const data = (macrosRepo.updateExecution as ReturnType<typeof vi.fn>).mock.calls[0][3]
    expect(data.status).toBe("failed")
    expect(data.result).toEqual({})

    // Direct prisma.macroExecution.update should NOT be called
    expect(
      (prisma.macroExecution as unknown as { update: ReturnType<typeof vi.fn> }).update
    ).not.toHaveBeenCalled()
  })

  it("AUDIT-004: macroAssignment.updateMany where clause includes tenantId for weekly macros", async () => {
    const macrosService = await import("@/lib/services/macros-service")

    ;(macrosService.executeAction as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { action: "log_message" },
      error: null,
    })

    const prisma = createMockPrisma()
    ;(prisma.macro.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([mockMacro]) // weekly
      .mockResolvedValueOnce([]) // monthly

    const { MacroExecutor } = await import("../macro-executor")
    const executor = new MacroExecutor(prisma)

    const monday = new Date(Date.UTC(2026, 2, 23))
    await executor.executeDueMacros(TENANT_ID, monday)

    // Verify macroAssignment.updateMany includes tenantId in where clause
    const updateManyMock = (prisma.macroAssignment as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany
    expect(updateManyMock).toHaveBeenCalledTimes(1)
    const updateManyCall = updateManyMock.mock.calls[0][0]
    expect(updateManyCall.where).toHaveProperty("tenantId", TENANT_ID)
    expect(updateManyCall.where).toHaveProperty("id")
  })

  it("AUDIT-004: macroAssignment.updateMany where clause includes tenantId for monthly macros", async () => {
    const macrosService = await import("@/lib/services/macros-service")

    ;(macrosService.executeAction as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { action: "log_message" },
      error: null,
    })

    const monthlyMacro = {
      ...mockMacro,
      macroType: "monthly",
      assignments: [
        {
          ...mockMacro.assignments[0],
          executionDay: 23, // 23rd day of month
        },
      ],
    }

    const prisma = createMockPrisma()
    ;(prisma.macro.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // weekly
      .mockResolvedValueOnce([monthlyMacro]) // monthly

    const { MacroExecutor } = await import("../macro-executor")
    const executor = new MacroExecutor(prisma)

    // 23rd of March 2026
    const day23 = new Date(Date.UTC(2026, 2, 23))
    await executor.executeDueMacros(TENANT_ID, day23)

    // Verify macroAssignment.updateMany includes tenantId in where clause
    const updateManyMock = (prisma.macroAssignment as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany
    expect(updateManyMock).toHaveBeenCalledTimes(1)
    const updateManyCall = updateManyMock.mock.calls[0][0]
    expect(updateManyCall.where).toHaveProperty("tenantId", TENANT_ID)
    expect(updateManyCall.where).toHaveProperty("id")
  })

  it("AUDIT-004: updateExecution data shape matches repo signature (completedAt, status, result, errorMessage)", async () => {
    const macrosRepo = await import("@/lib/services/macros-repository")
    const macrosService = await import("@/lib/services/macros-service")

    ;(macrosService.executeAction as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { action: "log_message" },
      error: null,
    })

    const prisma = createMockPrisma()
    ;(prisma.macro.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([mockMacro]) // weekly
      .mockResolvedValueOnce([]) // monthly

    const { MacroExecutor } = await import("../macro-executor")
    const executor = new MacroExecutor(prisma)

    const monday = new Date(Date.UTC(2026, 2, 23))
    await executor.executeDueMacros(TENANT_ID, monday)

    // Get the data argument (4th arg) passed to updateExecution
    const data = (macrosRepo.updateExecution as ReturnType<typeof vi.fn>).mock.calls[0][3]

    // Verify each field type matches the repo's expected signature:
    // { completedAt: Date, status: string, result: object, errorMessage: string | null }
    expect(data.completedAt).toBeInstanceOf(Date)
    expect(typeof data.status).toBe("string")
    expect(typeof data.result).toBe("object")
    expect(data.result).not.toBeNull()
    // errorMessage should be string or null
    expect(data.errorMessage === null || typeof data.errorMessage === "string").toBe(true)
  })
})
