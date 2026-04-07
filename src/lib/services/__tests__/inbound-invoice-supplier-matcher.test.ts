import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import { matchSupplier, levenshteinSimilarity } from "../inbound-invoice-supplier-matcher"
import type { ParsedInvoice } from "../zugferd-xml-parser"

function emptyParsed(overrides: Partial<ParsedInvoice> = {}): ParsedInvoice {
  return {
    invoiceNumber: null,
    invoiceDate: null,
    invoiceTypeCode: null,
    currency: null,
    dueDate: null,
    sellerName: null,
    sellerVatId: null,
    sellerTaxNumber: null,
    sellerStreet: null,
    sellerZip: null,
    sellerCity: null,
    sellerCountry: null,
    sellerIban: null,
    sellerBic: null,
    buyerName: null,
    buyerVatId: null,
    buyerReference: null,
    totalNet: null,
    totalVat: null,
    totalGross: null,
    amountDue: null,
    paymentTermDays: null,
    lineItems: [],
    profile: null,
    ...overrides,
  }
}

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const SUPPLIER_ID = "b0000000-0000-4000-b000-000000000001"

function createMockPrisma() {
  return {
    crmAddress: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaClient
}

describe("inbound-invoice-supplier-matcher", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("levenshteinSimilarity", () => {
    it("returns 1.0 for identical strings", () => {
      expect(levenshteinSimilarity("Lieferant GmbH", "Lieferant GmbH")).toBe(1.0)
    })

    it("returns 1.0 for identical case-insensitive", () => {
      expect(levenshteinSimilarity("LIEFERANT GMBH", "lieferant gmbh")).toBe(1.0)
    })

    it("returns high similarity for minor typo", () => {
      const sim = levenshteinSimilarity("Lieferant GmbH", "Lieferant Gmbh")
      expect(sim).toBeGreaterThan(0.9)
    })

    it("returns low similarity for completely different strings", () => {
      const sim = levenshteinSimilarity("Lieferant GmbH", "Kunde AG")
      expect(sim).toBeLessThan(0.5)
    })

    it("handles empty strings", () => {
      expect(levenshteinSimilarity("", "")).toBe(1.0)
    })
  })

  describe("matchSupplier", () => {
    it("matches by VAT ID (highest priority)", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: SUPPLIER_ID })

      const result = await matchSupplier(
        prisma,
        TENANT_ID,
        emptyParsed({ sellerVatId: "DE123456789" }),
        null
      )

      expect(result.supplierId).toBe(SUPPLIER_ID)
      expect(result.matchMethod).toBe("vat_id")
      expect(result.confidence).toBe(1.0)
    })

    it("matches by tax number when no VAT ID match", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // VAT ID query returns null
        .mockResolvedValueOnce({ id: SUPPLIER_ID }) // Tax number query matches

      const result = await matchSupplier(
        prisma,
        TENANT_ID,
        emptyParsed({ sellerVatId: "DE999999999", sellerTaxNumber: "201/113/40209" }),
        null
      )

      expect(result.supplierId).toBe(SUPPLIER_ID)
      expect(result.matchMethod).toBe("tax_number")
      expect(result.confidence).toBe(0.95)
    })

    it("matches by email domain", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // No VAT/tax matches
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: SUPPLIER_ID }) // Email domain match

      const result = await matchSupplier(
        prisma,
        TENANT_ID,
        emptyParsed({ sellerVatId: "XX000", sellerTaxNumber: "000" }),
        "info@lieferant.de"
      )

      expect(result.supplierId).toBe(SUPPLIER_ID)
      expect(result.matchMethod).toBe("email_domain")
      expect(result.confidence).toBe(0.8)
    })

    it("matches by fuzzy name (Levenshtein > 0.85)", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      ;(prisma.crmAddress.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: SUPPLIER_ID, company: "Lieferant GmbH" },
        { id: "other-id", company: "Totally Different Company" },
      ])

      const result = await matchSupplier(
        prisma,
        TENANT_ID,
        emptyParsed({ sellerName: "Lieferant Gmbh" }), // minor case diff
        null
      )

      expect(result.supplierId).toBe(SUPPLIER_ID)
      expect(result.matchMethod).toBe("fuzzy_name")
      expect(result.confidence).toBeGreaterThan(0.85)
    })

    it("returns no match when nothing matches", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      ;(prisma.crmAddress.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "other-id", company: "Totally Different Company" },
      ])

      const result = await matchSupplier(
        prisma,
        TENANT_ID,
        emptyParsed({ sellerName: "XYZ Corp" }),
        null
      )

      expect(result.supplierId).toBeNull()
      expect(result.matchMethod).toBeNull()
      expect(result.confidence).toBe(0)
    })
  })
})
