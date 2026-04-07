import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Hoisted mocks ---

const { mockUpload, mockRemove, mockCreateSignedUploadUrl, mockCreateSignedReadUrl } =
  vi.hoisted(() => ({
    mockUpload: vi.fn().mockResolvedValue({ path: "mocked" }),
    mockRemove: vi.fn().mockResolvedValue(undefined),
    mockCreateSignedUploadUrl: vi.fn().mockResolvedValue({
      signedUrl: "https://example.com/upload",
      path: "mocked",
      token: "tok",
    }),
    mockCreateSignedReadUrl: vi.fn().mockResolvedValue("https://example.com/read"),
  }))

const { mockParsePdfForZugferd } = vi.hoisted(() => ({
  mockParsePdfForZugferd: vi.fn().mockResolvedValue({
    hasZugferd: false,
    parsedInvoice: null,
    rawXml: null,
    profile: null,
    parseErrors: [],
  }),
}))

const { mockMatchSupplier } = vi.hoisted(() => ({
  mockMatchSupplier: vi.fn().mockResolvedValue({
    supplierId: null,
    matchMethod: null,
    confidence: 0,
  }),
}))

const { mockGetNextNumber } = vi.hoisted(() => ({
  mockGetNextNumber: vi.fn().mockResolvedValue("ER-0001"),
}))

const { mockAuditLog } = vi.hoisted(() => ({
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/supabase/storage", () => ({
  upload: mockUpload,
  remove: mockRemove,
  createSignedUploadUrl: mockCreateSignedUploadUrl,
  createSignedReadUrl: mockCreateSignedReadUrl,
}))

vi.mock("../zugferd-parser-service", () => ({
  parsePdfForZugferd: mockParsePdfForZugferd,
}))

vi.mock("../inbound-invoice-supplier-matcher", () => ({
  matchSupplier: mockMatchSupplier,
}))

vi.mock("../number-sequence-service", () => ({
  getNextNumber: mockGetNextNumber,
}))

vi.mock("../inbound-invoice-approval-service", () => ({
  createApprovalSteps: vi.fn().mockResolvedValue(undefined),
  handleMaterialChange: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../audit-logs-service", () => ({
  log: mockAuditLog,
  computeChanges: vi.fn((before, after, fields) => {
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    for (const f of fields) {
      if (String(before[f] ?? "") !== String(after[f] ?? "")) {
        changes[f] = { old: before[f], new: after[f] }
      }
    }
    return Object.keys(changes).length > 0 ? changes : null
  }),
}))

// --- Import after mocks ---

import * as service from "../inbound-invoice-service"

const TENANT_ID = "a0000000-0000-4000-a000-000000000200"
const USER_ID = "u0000000-0000-4000-a000-000000000001"

function makeMockInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-001",
    tenantId: TENANT_ID,
    number: "ER-0001",
    source: "manual",
    status: "DRAFT",
    approvalVersion: 1,
    invoiceNumber: "R-2024-001",
    invoiceDate: new Date("2024-01-15"),
    dueDate: new Date("2024-02-15"),
    totalNet: 100,
    totalVat: 19,
    totalGross: 119,
    supplierId: "sup-001",
    supplierStatus: "matched",
    paymentTermDays: 30,
    pdfStoragePath: "tenant/inv-001/invoice.pdf",
    pdfOriginalFilename: "invoice.pdf",
    notes: null,
    createdBy: USER_ID,
    submittedBy: null,
    submittedAt: null,
    datevExportedAt: null,
    datevExportedBy: null,
    lineItems: [],
    approvals: [],
    supplier: null,
    createdByUser: null,
    submitter: null,
    ...overrides,
  }
}

const mockFindFirst = vi.fn()
const mockFindMany = vi.fn()
const mockCount = vi.fn()
const mockCreate = vi.fn()
const mockUpdateMany = vi.fn()
const mockDeleteMany = vi.fn()
const mockLineItemDeleteMany = vi.fn()
const mockLineItemCreateMany = vi.fn()
const mockTransaction = vi.fn()

function createMockPrisma() {
  return {
    inboundInvoice: {
      findFirst: mockFindFirst,
      findMany: mockFindMany,
      count: mockCount,
      create: mockCreate,
      updateMany: mockUpdateMany,
      deleteMany: mockDeleteMany,
    },
    inboundInvoiceLineItem: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: mockLineItemCreateMany,
      deleteMany: mockLineItemDeleteMany,
    },
    $transaction: mockTransaction,
  } as unknown as PrismaClient
}

describe("inbound-invoice-service", () => {
  let prisma: PrismaClient

  beforeEach(() => {
    vi.clearAllMocks()
    prisma = createMockPrisma()
  })

  describe("createFromUpload", () => {
    it("creates invoice from plain PDF upload", async () => {
      const created = makeMockInvoice()
      mockCreate.mockResolvedValue(created)

      const result = await service.createFromUpload(
        prisma, TENANT_ID, Buffer.from("fake-pdf"), "invoice.pdf", USER_ID
      )

      expect(mockUpload).toHaveBeenCalledWith(
        "inbound-invoices",
        expect.stringContaining(`${TENANT_ID}/`),
        expect.any(Buffer),
        expect.objectContaining({ contentType: "application/pdf" })
      )
      expect(mockCreate).toHaveBeenCalled()
      expect(result.number).toBe("ER-0001")
    })

    it("creates line items when ZUGFeRD is detected", async () => {
      mockParsePdfForZugferd.mockResolvedValueOnce({
        hasZugferd: true,
        parsedInvoice: {
          invoiceNumber: "471102",
          totalGross: 529.87,
          totalNet: 473,
          totalVat: 56.87,
          sellerVatId: "DE123456789",
          sellerName: "Lieferant GmbH",
          lineItems: [
            { lineId: "1", description: "Item A", quantity: 10, unitPriceNet: 47.3, totalNet: 473, vatRate: 19, vatAmount: 56.87, unit: "H87", articleNumber: null },
          ],
        },
        rawXml: "<xml/>",
        profile: "EN16931",
        parseErrors: [],
      })

      const created = makeMockInvoice({ source: "zugferd" })
      mockCreate.mockResolvedValue(created)
      mockLineItemCreateMany.mockResolvedValue({ count: 1 })

      await service.createFromUpload(
        prisma, TENANT_ID, Buffer.from("zugferd-pdf"), "rechnung.pdf", USER_ID
      )

      expect(mockLineItemCreateMany).toHaveBeenCalled()
    })

    it("throws DuplicateError when supplier+invoiceNumber already exists", async () => {
      mockParsePdfForZugferd.mockResolvedValueOnce({
        hasZugferd: true,
        parsedInvoice: { invoiceNumber: "R-DUPE", sellerVatId: null, sellerName: null, lineItems: [] },
        rawXml: null,
        profile: null,
        parseErrors: [],
      })
      mockMatchSupplier.mockResolvedValueOnce({
        supplierId: "sup-001",
        matchMethod: "vat_id",
        confidence: 1,
      })
      // Duplicate check: existing invoice found
      mockFindFirst.mockResolvedValueOnce({ id: "existing-inv" })

      await expect(
        service.createFromUpload(prisma, TENANT_ID, Buffer.from("pdf"), "dup.pdf", USER_ID)
      ).rejects.toThrow(service.InboundInvoiceDuplicateError)
    })
  })

  describe("update", () => {
    it("increments approvalVersion when material fields change", async () => {
      const existing = makeMockInvoice({ totalGross: 100, approvalVersion: 1 })
      mockFindFirst.mockResolvedValue(existing)
      mockUpdateMany.mockResolvedValue({ count: 1 })

      await service.update(prisma, TENANT_ID, "inv-001", { totalGross: 200 })

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ approvalVersion: 2 }),
        })
      )
    })

    it("does not increment approvalVersion when only notes change", async () => {
      const existing = makeMockInvoice()
      mockFindFirst.mockResolvedValue(existing)
      mockUpdateMany.mockResolvedValue({ count: 1 })

      await service.update(prisma, TENANT_ID, "inv-001", { notes: "updated" })

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ approvalVersion: 2 }),
        })
      )
    })

    it("rejects update on non-DRAFT/REJECTED invoice", async () => {
      const existing = makeMockInvoice({ status: "APPROVED" })
      mockFindFirst.mockResolvedValue(existing)

      await expect(
        service.update(prisma, TENANT_ID, "inv-001", { notes: "x" })
      ).rejects.toThrow(service.InboundInvoiceValidationError)
    })
  })

  describe("submitForApproval", () => {
    it("requires matched supplier", async () => {
      const existing = makeMockInvoice({ supplierId: null })
      mockFindFirst.mockResolvedValue(existing)

      await expect(
        service.submitForApproval(prisma, TENANT_ID, "inv-001", USER_ID)
      ).rejects.toThrow("Supplier must be assigned")
    })

    it("requires invoice number", async () => {
      const existing = makeMockInvoice({ invoiceNumber: null })
      mockFindFirst.mockResolvedValue(existing)

      await expect(
        service.submitForApproval(prisma, TENANT_ID, "inv-001", USER_ID)
      ).rejects.toThrow("Invoice number is required")
    })

    it("sets submittedBy and calls createApprovalSteps on valid submit", async () => {
      const existing = makeMockInvoice()
      mockFindFirst.mockResolvedValue(existing)
      mockUpdateMany.mockResolvedValue({ count: 1 })

      await service.submitForApproval(prisma, TENANT_ID, "inv-001", USER_ID)

      // Verify submitted fields set
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            submittedBy: USER_ID,
          }),
        })
      )

      // Verify approval service was called
      const { createApprovalSteps } = await import("../inbound-invoice-approval-service")
      expect(createApprovalSteps).toHaveBeenCalledWith(
        prisma, TENANT_ID, "inv-001",
        expect.any(Number),
        existing.approvalVersion
      )
    })
  })

  describe("updateLineItems", () => {
    it("rejects when line item sum does not match header total", async () => {
      const existing = makeMockInvoice({ totalNet: 100, status: "DRAFT" })
      mockFindFirst.mockResolvedValue(existing)

      await expect(
        service.updateLineItems(prisma, TENANT_ID, "inv-001", [
          { totalNet: 50 },
          { totalNet: 40 }, // sum=90 ≠ 100
        ])
      ).rejects.toThrow("does not match header total")
    })

    it("accepts when line item sum matches within ±0.01", async () => {
      const existing = makeMockInvoice({ totalNet: 100, status: "DRAFT" })
      mockFindFirst.mockResolvedValue(existing)
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
        return fn({
          inboundInvoiceLineItem: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
        })
      })

      await expect(
        service.updateLineItems(prisma, TENANT_ID, "inv-001", [
          { totalNet: 60 },
          { totalNet: 40.005 }, // sum=100.005, within ±0.01
        ])
      ).resolves.not.toThrow()
    })
  })

  describe("remove", () => {
    it("only allows deleting DRAFT invoices", async () => {
      const existing = makeMockInvoice({ status: "APPROVED" })
      mockFindFirst.mockResolvedValue(existing)

      await expect(
        service.remove(prisma, TENANT_ID, "inv-001")
      ).rejects.toThrow("only DRAFT")
    })

    it("removes PDF from storage and deletes record", async () => {
      const existing = makeMockInvoice({ status: "DRAFT" })
      mockFindFirst.mockResolvedValue(existing)
      mockDeleteMany.mockResolvedValue({ count: 1 })

      await service.remove(prisma, TENANT_ID, "inv-001")

      expect(mockRemove).toHaveBeenCalledWith(
        "inbound-invoices",
        [existing.pdfStoragePath]
      )
      expect(mockDeleteMany).toHaveBeenCalled()
    })
  })

  describe("reopenExported", () => {
    it("rejects non-EXPORTED invoices", async () => {
      const existing = makeMockInvoice({ status: "APPROVED" })
      mockFindFirst.mockResolvedValue(existing)

      await expect(
        service.reopenExported(prisma, TENANT_ID, "inv-001")
      ).rejects.toThrow("only EXPORTED")
    })
  })
})
