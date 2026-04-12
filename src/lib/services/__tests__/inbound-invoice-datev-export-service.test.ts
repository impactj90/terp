/**
 * Unit tests for DATEV export formatting functions.
 * Integration test for full export against real DB.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import * as iconv from "iconv-lite"

// Mock storage (used transitively by invoice service)
vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "mocked" }),
  remove: vi.fn().mockResolvedValue(undefined),
  createSignedUploadUrl: vi.fn().mockResolvedValue({
    signedUrl: "https://example.com/upload", path: "mocked", token: "tok",
  }),
  createSignedReadUrl: vi.fn().mockResolvedValue("https://example.com/read"),
}))

// Mock PubSub
vi.mock("@/lib/pubsub/singleton", () => ({
  getHub: vi.fn().mockResolvedValue({ publish: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock("@/lib/pubsub/topics", () => ({
  userTopic: vi.fn((id: string) => `user:${id}`),
}))

import {
  formatDatevDate,
  buildDatevHeader,
  VAT_KEY_MAP,
  exportToCsv,
} from "../inbound-invoice-datev-export-service"
import { prisma } from "@/lib/db/prisma"

// --- Unit Tests (no DB) ---

describe("DATEV format helpers", () => {
  it("formatDatevDate returns DDMM", () => {
    expect(formatDatevDate(new Date("2024-03-15"))).toBe("1503")
    expect(formatDatevDate(new Date("2024-01-01"))).toBe("0101")
    expect(formatDatevDate(new Date("2024-12-31"))).toBe("3112")
  })

  it("VAT_KEY_MAP: 19% → 9, 7% → 8, 0% → 0", () => {
    expect(VAT_KEY_MAP[19]).toBe(9)
    expect(VAT_KEY_MAP[7]).toBe(8)
    expect(VAT_KEY_MAP[0]).toBe(0)
  })

  it("buildDatevHeader starts with EXTF", () => {
    const header = buildDatevHeader()
    expect(header).toMatch(/^"EXTF";700;21;"Buchungsstapel"/)
  })

  it("buildDatevHeader uses semicolon delimiter", () => {
    const header = buildDatevHeader()
    expect(header.split(";").length).toBeGreaterThanOrEqual(15)
  })
})

// --- Integration Tests (real DB) ---

const TEST_TENANT_ID = "f0000000-0000-4000-a000-000000000808"
const TEST_TENANT_SLUG = "datev-export-integration"
const TEST_USER_ID = "a0000000-0000-4000-a000-000000000801"

describe.sequential("DATEV export integration", () => {
  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TEST_TENANT_ID },
      update: {},
      create: { id: TEST_TENANT_ID, name: "DATEV Export Test", slug: TEST_TENANT_SLUG, isActive: true },
    })
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: { id: TEST_USER_ID, email: "datev-test@test.local", displayName: "DATEV Test" },
    })
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: TEST_USER_ID, tenantId: TEST_TENANT_ID } },
      update: {},
      create: { userId: TEST_USER_ID, tenantId: TEST_TENANT_ID },
    })
  })

  afterAll(async () => {
    await prisma.inboundInvoiceLineItem.deleteMany({ where: { invoice: { tenantId: TEST_TENANT_ID } } }).catch(() => {})
    await prisma.inboundInvoice.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
    await prisma.crmAddress.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
    await prisma.numberSequence.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
    await prisma.userTenant.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } }).catch(() => {})
    await prisma.tenant.deleteMany({ where: { id: TEST_TENANT_ID } }).catch(() => {})
  })

  beforeEach(async () => {
    await prisma.inboundInvoiceLineItem.deleteMany({ where: { invoice: { tenantId: TEST_TENANT_ID } } }).catch(() => {})
    await prisma.inboundInvoice.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  })

  async function createApprovedInvoice(overrides: Record<string, unknown> = {}) {
    const supplier = await prisma.crmAddress.upsert({
      where: { id: "f0000000-0000-4000-a000-000000000809" },
      update: {},
      create: {
        id: "f0000000-0000-4000-a000-000000000809",
        tenantId: TEST_TENANT_ID,
        number: "LF-DATEV-001",
        company: "Müller & Söhne GmbH",
        type: "SUPPLIER",
        isActive: true,
        vatId: "DE999888777",
      },
    })

    const invoice = await prisma.inboundInvoice.create({
      data: {
        tenantId: TEST_TENANT_ID,
        number: `ER-DTV-${Date.now()}`,
        source: "manual",
        status: "APPROVED",
        supplierId: supplier.id,
        supplierStatus: "matched",
        invoiceNumber: "R-2024-100",
        invoiceDate: new Date("2024-06-15"),
        totalGross: 119,
        totalNet: 100,
        totalVat: 19,
        ...overrides,
      },
    })

    // Add a line item with 19% VAT
    await prisma.inboundInvoiceLineItem.create({
      data: {
        invoiceId: invoice.id,
        position: 1,
        description: "Büromaterial",
        quantity: 1,
        unitPriceNet: 100,
        totalNet: 100,
        vatRate: 19,
        vatAmount: 19,
        totalGross: 119,
        sortOrder: 1,
      },
    })

    return invoice
  }

  it("exports approved invoices as DATEV CSV with correct format", async () => {
    const inv = await createApprovedInvoice()

    const result = await exportToCsv(
      prisma, TEST_TENANT_ID, { invoiceIds: [inv.id] }, TEST_USER_ID
    )

    expect(result.count).toBe(1)
    expect(result.filename).toMatch(/^DATEV_Buchungsstapel_\d{8}\.csv$/)

    // Decode from Windows-1252
    const csvString = iconv.decode(result.csv, "win1252")

    // Check header
    const lines = csvString.split("\r\n")
    expect(lines[0]).toContain('"EXTF"')
    expect(lines[0]).toContain('"Buchungsstapel"')

    // Check column header
    expect(lines[1]).toContain("Umsatz")
    expect(lines[1]).toContain("Buchungstext")

    // Check data row
    const dataRow = lines[2]!
    expect(dataRow).toContain("119,00")     // Umsatz with comma
    expect(dataRow).toContain("S")          // Soll
    expect(dataRow).toContain("EUR")        // WKZ
    expect(dataRow).toContain("9")          // BU-Schlüssel for 19%
    expect(dataRow).toContain("1506")       // Belegdatum DDMM
    expect(dataRow).toContain("R-2024-100") // Belegfeld 1
    expect(dataRow).toContain("Müller")     // Buchungstext with Umlaut
  })

  it("encodes German Umlauts correctly in Windows-1252", async () => {
    await createApprovedInvoice()

    const result = await exportToCsv(
      prisma, TEST_TENANT_ID, {}, TEST_USER_ID
    )

    const csvString = iconv.decode(result.csv, "win1252")
    expect(csvString).toContain("Müller & Söhne GmbH")
  })

  it("truncates Buchungstext at 60 chars", async () => {
    const longName = "A".repeat(70)
    const supplier = await prisma.crmAddress.upsert({
      where: { id: "f0000000-0000-4000-a000-000000000810" },
      update: { company: longName },
      create: {
        id: "f0000000-0000-4000-a000-000000000810",
        tenantId: TEST_TENANT_ID,
        number: "LF-LONG",
        company: longName,
        type: "SUPPLIER",
        isActive: true,
      },
    })

    await prisma.inboundInvoice.create({
      data: {
        tenantId: TEST_TENANT_ID,
        number: `ER-LONG-${Date.now()}`,
        source: "manual",
        status: "APPROVED",
        supplierId: supplier.id,
        supplierStatus: "matched",
        invoiceNumber: "R-LONG-001",
        invoiceDate: new Date("2024-06-15"),
        totalGross: 50,
      },
    })

    const result = await exportToCsv(
      prisma, TEST_TENANT_ID, {}, TEST_USER_ID
    )

    const csvString = iconv.decode(result.csv, "win1252")
    // Buchungstext field should be max 60 chars
    const lines = csvString.split("\r\n")
    const dataLines = lines.slice(2).filter((l) => l.trim())
    for (const line of dataLines) {
      const fields = line.split(";")
      const buchungstext = fields[13]?.replace(/"/g, "") ?? ""
      expect(buchungstext.length).toBeLessThanOrEqual(60)
    }
  })

  it("marks invoices as EXPORTED after export", async () => {
    const inv = await createApprovedInvoice()

    await exportToCsv(
      prisma, TEST_TENANT_ID, { invoiceIds: [inv.id] }, TEST_USER_ID
    )

    const updated = await prisma.inboundInvoice.findFirst({
      where: { id: inv.id },
    })
    expect(updated!.status).toBe("EXPORTED")
    expect(updated!.datevExportedAt).toBeTruthy()
    expect(updated!.datevExportedBy).toBe(TEST_USER_ID)
  })

  it("throws when no approved invoices found", async () => {
    await expect(
      exportToCsv(prisma, TEST_TENANT_ID, {}, TEST_USER_ID)
    ).rejects.toThrow("Keine exportierbaren Rechnungen")
  })

  it("uses semicolon as delimiter", async () => {
    await createApprovedInvoice()

    const result = await exportToCsv(
      prisma, TEST_TENANT_ID, {}, TEST_USER_ID
    )

    const csvString = iconv.decode(result.csv, "win1252")
    const lines = csvString.split("\r\n")
    // Data row should have semicolons
    expect(lines[2]!.split(";").length).toBeGreaterThanOrEqual(10)
  })
})
