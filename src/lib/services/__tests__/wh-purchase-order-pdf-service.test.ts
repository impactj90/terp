import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Supabase admin client — all functions must be declared inside the factory
vi.mock("@/lib/supabase/admin", () => {
  const upload = vi.fn().mockResolvedValue({ error: null })
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://test.supabase.co/signed" },
    error: null,
  })
  const from = vi.fn().mockReturnValue({
    upload,
    createSignedUrl,
  })
  return {
    createAdminClient: vi.fn().mockReturnValue({
      storage: { from },
    }),
    // Expose internals for assertions
    __mocks: { upload, createSignedUrl, from },
  }
})

vi.mock("@/lib/config", () => ({
  serverEnv: { supabaseUrl: "https://test.supabase.co" },
  clientEnv: { supabaseUrl: "https://test.supabase.co" },
}))

// Mock the PO service (getById)
vi.mock("@/lib/services/wh-purchase-order-service", () => ({
  getById: vi.fn(),
}))

// Mock the tenant config repo
vi.mock("@/lib/services/billing-tenant-config-repository", () => ({
  findByTenantId: vi.fn(),
}))

// Mock renderToBuffer to avoid actual PDF rendering in tests
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 test")),
  Document: "Document",
  Page: "Page",
  View: "View",
  Text: "Text",
  Image: "Image",
  StyleSheet: { create: (s: unknown) => s },
}))

import { generateAndGetDownloadUrl } from "../wh-purchase-order-pdf-service"
import * as poService from "../wh-purchase-order-service"
import * as tenantConfigRepo from "../billing-tenant-config-repository"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseMocks = (await import("@/lib/supabase/admin") as any).__mocks as {
  upload: ReturnType<typeof vi.fn>
  createSignedUrl: ReturnType<typeof vi.fn>
  from: ReturnType<typeof vi.fn>
}

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const PO_ID = "c1000000-0000-4000-a000-000000000001"

const mockOrder = {
  id: PO_ID,
  tenantId: TENANT_ID,
  number: "BES-2026-001",
  orderDate: new Date("2026-03-25"),
  requestedDelivery: new Date("2026-04-01"),
  confirmedDelivery: null,
  notes: "Test notes",
  subtotalNet: 100,
  totalVat: 19,
  totalGross: 119,
  supplierId: "d1000000-0000-4000-a000-000000000001",
  contactId: null,
  supplier: {
    company: "Test Lieferant GmbH",
    street: "Teststra\u00DFe 1",
    zip: "12345",
    city: "Teststadt",
    ourCustomerNumber: "KD-999",
  },
  contact: { firstName: "Max", lastName: "Mustermann" },
  positions: [
    {
      sortOrder: 0,
      positionType: "ARTICLE",
      supplierArticleNumber: "ART-001",
      description: "Testartikel",
      freeText: null,
      quantity: 10,
      unit: "Stk",
      unitPrice: 10,
      flatCosts: null,
      totalPrice: 100,
      vatRate: 19,
      article: {
        id: "art-1",
        number: "A001",
        name: "Testartikel",
        unit: "Stk",
        buyPrice: 10,
      },
    },
  ],
}

const mockTenantConfig = {
  companyName: "Meine Firma GmbH",
  companyAddress: "Firmenstra\u00DFe 1\n12345 Firmenstadt",
  logoUrl: null,
  bankName: "Testbank",
  iban: "DE89370400440532013000",
  bic: "COBADEFFXXX",
  taxId: "DE123456789",
  commercialRegister: "HRB 12345",
  managingDirector: "Chef Person",
  phone: "+49 123 456789",
  email: "info@firma.de",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  whPurchaseOrder: {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  billingTenantConfig: {
    findUnique: vi.fn().mockResolvedValue(mockTenantConfig),
  },
}

describe("wh-purchase-order-pdf-service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(poService.getById).mockResolvedValue(mockOrder as never)
    vi.mocked(tenantConfigRepo.findByTenantId).mockResolvedValue(mockTenantConfig as never)
    supabaseMocks.upload.mockResolvedValue({ error: null })
    supabaseMocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/signed" },
      error: null,
    })
    mockPrisma.whPurchaseOrder.updateMany.mockResolvedValue({ count: 1 })
  })

  describe("generateAndGetDownloadUrl", () => {
    it("returns signedUrl and filename", async () => {
      const result = await generateAndGetDownloadUrl(
        mockPrisma,
        TENANT_ID,
        PO_ID
      )
      expect(result.signedUrl).toBe("https://test.supabase.co/signed")
      expect(result.filename).toBe("BES-2026-001.pdf")
    })

    it("sets printedAt on the purchase order", async () => {
      await generateAndGetDownloadUrl(mockPrisma, TENANT_ID, PO_ID)

      expect(mockPrisma.whPurchaseOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PO_ID, tenantId: TENANT_ID },
          data: expect.objectContaining({ printedAt: expect.any(Date) }),
        })
      )
    })

    it("uploads PDF to Supabase Storage with correct path", async () => {
      await generateAndGetDownloadUrl(mockPrisma, TENANT_ID, PO_ID)

      expect(supabaseMocks.from).toHaveBeenCalledWith("documents")
      expect(supabaseMocks.upload).toHaveBeenCalledWith(
        `bestellung/BES-2026-001_Test_Lieferant_GmbH.pdf`,
        expect.any(Buffer),
        expect.objectContaining({
          contentType: "application/pdf",
          upsert: true,
        })
      )
    })

    it("creates a signed URL with 300 second expiry", async () => {
      await generateAndGetDownloadUrl(mockPrisma, TENANT_ID, PO_ID)

      expect(supabaseMocks.createSignedUrl).toHaveBeenCalledWith(
        `bestellung/BES-2026-001_Test_Lieferant_GmbH.pdf`,
        300
      )
    })

    it("throws when purchase order not found", async () => {
      vi.mocked(poService.getById).mockRejectedValueOnce(
        Object.assign(new Error("Purchase order not found"), {
          name: "WhPurchaseOrderNotFoundError",
        })
      )

      await expect(
        generateAndGetDownloadUrl(mockPrisma, TENANT_ID, "nonexistent")
      ).rejects.toThrow("Purchase order not found")
    })

    it("throws when upload fails", async () => {
      supabaseMocks.upload.mockResolvedValueOnce({
        error: { message: "Upload quota exceeded" },
      })

      await expect(
        generateAndGetDownloadUrl(mockPrisma, TENANT_ID, PO_ID)
      ).rejects.toThrow("PDF upload failed: Upload quota exceeded")
    })

    it("throws when signed URL creation fails", async () => {
      supabaseMocks.createSignedUrl.mockResolvedValueOnce({
        data: null,
        error: { message: "Bucket not found" },
      })

      await expect(
        generateAndGetDownloadUrl(mockPrisma, TENANT_ID, PO_ID)
      ).rejects.toThrow("Failed to create signed URL: Bucket not found")
    })

    it("sanitizes slashes in filename", async () => {
      vi.mocked(poService.getById).mockResolvedValueOnce({
        ...mockOrder,
        number: "BES/2026/001",
      } as never)

      const result = await generateAndGetDownloadUrl(
        mockPrisma,
        TENANT_ID,
        PO_ID
      )
      expect(result.filename).toBe("BES_2026_001.pdf")
    })
  })
})
