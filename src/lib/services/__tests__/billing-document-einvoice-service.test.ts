import { describe, it, expect } from "vitest"
import { validateEInvoiceRequirements, buildInvoiceData } from "../billing-document-einvoice-service"
import type { BillingTenantConfig, BillingDocument, BillingDocumentPosition, CrmAddress } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const DOC_ID = "d0000000-0000-4000-a000-000000000001"
const ADDR_ID = "b0000000-0000-4000-a000-000000000001"

function makeTenantConfig(overrides: Partial<BillingTenantConfig> = {}): BillingTenantConfig {
  return {
    id: "c0000000-0000-4000-a000-000000000001",
    tenantId: TENANT_ID,
    companyName: "Test GmbH",
    companyAddress: "Test Address",
    logoUrl: null,
    bankName: "Sparkasse",
    iban: "DE89370400440532013000",
    bic: "COBADEFFXXX",
    taxId: "DE123456789",
    commercialRegister: null,
    managingDirector: null,
    footerHtml: null,
    phone: null,
    email: null,
    website: null,
    taxNumber: null,
    leitwegId: null,
    eInvoiceEnabled: true,
    companyStreet: "Musterstraße 1",
    companyZip: "12345",
    companyCity: "Musterstadt",
    companyCountry: "DE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeAddress(overrides: Partial<CrmAddress> = {}): CrmAddress {
  return {
    id: ADDR_ID,
    tenantId: TENANT_ID,
    number: "K-001",
    type: "CUSTOMER",
    company: "Kunde AG",
    street: "Kundenstraße 5",
    zip: "54321",
    city: "Kundenstadt",
    country: "DE",
    phone: null,
    fax: null,
    email: null,
    website: null,
    taxNumber: null,
    vatId: "DE987654321",
    leitwegId: null,
    matchCode: null,
    notes: null,
    paymentTermDays: null,
    discountPercent: null,
    discountDays: null,
    discountGroup: null,
    salesPriceListId: null,
    purchasePriceListId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ourCustomerNumber: null,
    createdById: null,
    parentAddressId: null,
    dunningBlocked: false,
    dunningBlockReason: null,
    ...overrides,
  }
}

function makeDocument(overrides: Partial<BillingDocument> = {}): BillingDocument & { positions: BillingDocumentPosition[] } {
  return {
    id: DOC_ID,
    tenantId: TENANT_ID,
    number: "RE-2026-001",
    type: "INVOICE",
    status: "PRINTED",
    addressId: ADDR_ID,
    contactId: null,
    deliveryAddressId: null,
    invoiceAddressId: null,
    inquiryId: null,
    orderId: null,
    parentDocumentId: null,
    orderDate: null,
    documentDate: new Date("2026-03-20"),
    deliveryDate: null,
    deliveryType: null,
    deliveryTerms: null,
    paymentTermDays: 30,
    discountPercent: null,
    discountDays: null,
    discountPercent2: null,
    discountDays2: null,
    shippingCostNet: null,
    shippingCostVatRate: null,
    subtotalNet: 1000,
    totalVat: 190,
    totalGross: 1190,
    notes: null,
    internalNotes: null,
    dunningBlocked: false,
    dunningBlockReason: null,
    headerText: null,
    footerText: null,
    pdfUrl: null,
    eInvoiceXmlUrl: null,
    printedAt: null,
    printedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: null,
    positions: [
      {
        id: "p0000000-0000-4000-a000-000000000001",
        documentId: DOC_ID,
        sortOrder: 1,
        type: "ARTICLE",
        articleId: null,
        articleNumber: "ART-001",
        description: "Software Development",
        quantity: 10,
        unit: "Std",
        unitPrice: 100,
        flatCosts: null,
        priceType: "STANDARD",
        totalPrice: 1000,
        vatRate: 19,
        deliveryDate: null,
        confirmedDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as BillingDocumentPosition,
    ],
    ...overrides,
  } as BillingDocument & { positions: BillingDocumentPosition[] }
}

describe("billing-document-einvoice-service", () => {
  describe("validateEInvoiceRequirements", () => {
    it("returns empty array when all required fields present", () => {
      const result = validateEInvoiceRequirements(
        makeTenantConfig(),
        makeDocument(),
        makeAddress()
      )
      expect(result).toEqual([])
    })

    it("returns missing fields when companyName absent", () => {
      const result = validateEInvoiceRequirements(
        makeTenantConfig({ companyName: null }),
        makeDocument(),
        makeAddress()
      )
      expect(result).toContain("Firmenname (Einstellungen)")
    })

    it("returns missing fields when taxId AND taxNumber absent", () => {
      const result = validateEInvoiceRequirements(
        makeTenantConfig({ taxId: null, taxNumber: null }),
        makeDocument(),
        makeAddress()
      )
      expect(result).toContain("USt-IdNr. oder Steuernummer (Einstellungen)")
    })

    it("passes when taxId present but taxNumber absent", () => {
      const result = validateEInvoiceRequirements(
        makeTenantConfig({ taxId: "DE123456789", taxNumber: null }),
        makeDocument(),
        makeAddress()
      )
      expect(result).not.toContain("USt-IdNr. oder Steuernummer (Einstellungen)")
    })

    it("passes when taxNumber present but taxId absent", () => {
      const result = validateEInvoiceRequirements(
        makeTenantConfig({ taxId: null, taxNumber: "123/456/78901" }),
        makeDocument(),
        makeAddress()
      )
      expect(result).not.toContain("USt-IdNr. oder Steuernummer (Einstellungen)")
    })

    it("returns missing fields when buyer address incomplete", () => {
      const result = validateEInvoiceRequirements(
        makeTenantConfig(),
        makeDocument(),
        makeAddress({ street: null, zip: null, city: null, country: null })
      )
      expect(result).toContain("Straße (Adresse)")
      expect(result).toContain("PLZ (Adresse)")
      expect(result).toContain("Ort (Adresse)")
      expect(result).toContain("Land (Adresse)")
    })

    it("returns missing fields when document has no positions", () => {
      const doc = makeDocument()
      doc.positions = []
      const result = validateEInvoiceRequirements(
        makeTenantConfig(),
        doc,
        makeAddress()
      )
      expect(result).toContain("Mindestens eine Artikelposition")
    })

    it("returns missing fields when companyStreet/companyZip/companyCity absent", () => {
      const result = validateEInvoiceRequirements(
        makeTenantConfig({ companyStreet: null, companyZip: null, companyCity: null }),
        makeDocument(),
        makeAddress()
      )
      expect(result).toContain("Firmen-Straße (Einstellungen)")
      expect(result).toContain("Firmen-PLZ (Einstellungen)")
      expect(result).toContain("Firmen-Ort (Einstellungen)")
    })

    it("ignores TEXT and PAGE_BREAK positions when checking for line items", () => {
      const doc = makeDocument()
      doc.positions = [
        { ...doc.positions[0], type: "TEXT" as const } as BillingDocumentPosition,
        { ...doc.positions[0], type: "PAGE_BREAK" as const } as BillingDocumentPosition,
      ]
      const result = validateEInvoiceRequirements(
        makeTenantConfig(),
        doc,
        makeAddress()
      )
      expect(result).toContain("Mindestens eine Artikelposition")
    })
  })

  describe("buildInvoiceData — cac:InvoicePeriod (§14 UStG BT-73/74)", () => {
    // Helper: peek at the inner ubl:Invoice object regardless of how the
    // library-facing cast hides it from the compiler.
    function ublInvoice(
      result: ReturnType<typeof buildInvoiceData>,
    ): Record<string, unknown> {
      return (result as unknown as { "ubl:Invoice": Record<string, unknown> })[
        "ubl:Invoice"
      ]
    }

    it("emits both StartDate and EndDate when both fields are set", () => {
      const doc = makeDocument({
        servicePeriodFrom: new Date("2026-03-01"),
        servicePeriodTo: new Date("2026-03-31"),
      })
      const result = buildInvoiceData(doc, makeTenantConfig(), makeAddress())
      const inv = ublInvoice(result)
      expect(inv["cac:InvoicePeriod"]).toEqual({
        "cbc:StartDate": "2026-03-01",
        "cbc:EndDate": "2026-03-31",
      })
    })

    it("emits only StartDate when only servicePeriodFrom is set", () => {
      const doc = makeDocument({
        servicePeriodFrom: new Date("2026-03-01"),
        servicePeriodTo: null,
      })
      const result = buildInvoiceData(doc, makeTenantConfig(), makeAddress())
      const inv = ublInvoice(result)
      expect(inv["cac:InvoicePeriod"]).toEqual({ "cbc:StartDate": "2026-03-01" })
    })

    it("emits only EndDate when only servicePeriodTo is set", () => {
      const doc = makeDocument({
        servicePeriodFrom: null,
        servicePeriodTo: new Date("2026-03-31"),
      })
      const result = buildInvoiceData(doc, makeTenantConfig(), makeAddress())
      const inv = ublInvoice(result)
      expect(inv["cac:InvoicePeriod"]).toEqual({ "cbc:EndDate": "2026-03-31" })
    })

    it("omits cac:InvoicePeriod entirely when both fields are null", () => {
      const doc = makeDocument({
        servicePeriodFrom: null,
        servicePeriodTo: null,
      })
      const result = buildInvoiceData(doc, makeTenantConfig(), makeAddress())
      const inv = ublInvoice(result)
      expect(inv).not.toHaveProperty("cac:InvoicePeriod")
    })
  })
})
