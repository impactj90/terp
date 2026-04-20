/**
 * Integration test for `outgoing-invoice-book-csv-service.exportToCsv`
 * against a real Postgres DB. Exercises the full pipeline: service.list
 * → renderCsvString → encodeCsv → audit log.
 *
 * Unit-level CSV logic (row shape, escape, encoding bytes, filename) is
 * covered by `outgoing-invoice-book-csv-service.test.ts`. This test
 * adds real-DB coverage and audit-log verification.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest"

vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "mocked" }),
  createSignedReadUrl: vi.fn().mockResolvedValue("https://example.com/x"),
}))

import { prisma } from "@/lib/db/prisma"
import * as iconv from "iconv-lite"
import { exportToCsv } from "../outgoing-invoice-book-csv-service"

const TENANT_ID = "f0000000-0000-4000-a000-000000000903"
const TENANT_SLUG = "oib-csv-integration"
const USER_ID = "a0000000-0000-4000-a000-000000000903"
const ADDR_ID = "f0000000-0000-4000-a000-000000000913"

async function cleanupDocuments() {
  await prisma.billingDocumentPosition
    .deleteMany({ where: { document: { tenantId: TENANT_ID } } })
    .catch(() => {})
  await prisma.billingDocument
    .deleteMany({ where: { tenantId: TENANT_ID } })
    .catch(() => {})
}

describe.sequential("OutgoingInvoiceBook CSV service integration", () => {
  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TENANT_ID },
      update: {},
      create: {
        id: TENANT_ID,
        name: "OIB CSV Test",
        slug: TENANT_SLUG,
        isActive: true,
      },
    })
    await prisma.user.upsert({
      where: { id: USER_ID },
      update: {},
      create: {
        id: USER_ID,
        email: "oib-csv@test.local",
        displayName: "OIB CSV",
      },
    })
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: USER_ID, tenantId: TENANT_ID } },
      update: {},
      create: { userId: USER_ID, tenantId: TENANT_ID },
    })
    await prisma.crmAddress.upsert({
      where: { id: ADDR_ID },
      update: {},
      create: {
        id: ADDR_ID,
        tenantId: TENANT_ID,
        number: "K-CSV-001",
        company: "Müller & Söhne GmbH",
        type: "CUSTOMER",
        vatId: "DE111222333",
        isActive: true,
      },
    })
  })

  afterAll(async () => {
    await cleanupDocuments()
    await prisma.auditLog
      .deleteMany({ where: { tenantId: TENANT_ID } })
      .catch(() => {})
    await prisma.crmAddress
      .deleteMany({ where: { tenantId: TENANT_ID } })
      .catch(() => {})
    await prisma.userTenant
      .deleteMany({ where: { userId: USER_ID } })
      .catch(() => {})
    await prisma.user.deleteMany({ where: { id: USER_ID } }).catch(() => {})
    await prisma.tenant.deleteMany({ where: { id: TENANT_ID } }).catch(() => {})
  })

  beforeEach(async () => {
    await cleanupDocuments()
    await prisma.auditLog
      .deleteMany({ where: { tenantId: TENANT_ID } })
      .catch(() => {})
  })

  async function createDoc(
    type: "INVOICE" | "CREDIT_NOTE",
    number: string,
    date: Date,
    positions: Array<{ vatRate: number; totalPrice: number }>
  ) {
    const subtotalNet = positions.reduce((s, p) => s + p.totalPrice, 0)
    const totalVat = positions.reduce(
      (s, p) => s + (p.totalPrice * p.vatRate) / 100,
      0
    )
    const doc = await prisma.billingDocument.create({
      data: {
        tenantId: TENANT_ID,
        number,
        type,
        status: "PRINTED",
        addressId: ADDR_ID,
        documentDate: date,
        servicePeriodFrom: new Date("2026-03-01"),
        servicePeriodTo: new Date("2026-03-31"),
        subtotalNet,
        totalVat,
        totalGross: subtotalNet + totalVat,
      },
    })
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!
      await prisma.billingDocumentPosition.create({
        data: {
          documentId: doc.id,
          sortOrder: i + 1,
          type: "ARTICLE",
          description: `Pos ${i + 1}`,
          quantity: 1,
          unit: "Stk",
          unitPrice: p.totalPrice,
          totalPrice: p.totalPrice,
          vatRate: p.vatRate,
        },
      })
    }
  }

  const MARCH_FROM = new Date("2026-03-01")
  const MARCH_TO = new Date("2026-03-31")

  it("exports invoices + credit notes to UTF-8 CSV with real DB data", async () => {
    await createDoc("INVOICE", "RE-CSV-1", new Date("2026-03-10"), [
      { vatRate: 19, totalPrice: 100 },
    ])
    await createDoc("CREDIT_NOTE", "GS-CSV-1", new Date("2026-03-15"), [
      { vatRate: 19, totalPrice: 50 },
    ])
    const result = await exportToCsv(
      prisma,
      TENANT_ID,
      { dateFrom: MARCH_FROM, dateTo: MARCH_TO, encoding: "utf8" },
      { userId: USER_ID }
    )
    expect(result.count).toBe(2)
    expect(result.rowCount).toBe(2)
    expect(result.filename).toBe("Rechnungsausgangsbuch_2026-03.csv")

    const buf = Buffer.from(result.csv, "base64")
    // UTF-8 BOM
    expect(buf[0]).toBe(0xef)
    const csv = buf.slice(3).toString("utf8")
    expect(csv).toContain("Rechnungsnummer;Datum;Typ;Kunde")
    expect(csv).toContain("RE-CSV-1")
    expect(csv).toContain("GS-CSV-1")
    // Credit note row should carry negative net amount ("-50,00")
    const gsLine = csv.split("\r\n").find((l) => l.includes("GS-CSV-1"))!
    expect(gsLine).toMatch(/-50,00/)
  })

  it("emits one row per (entry × vatBreakdown) with mixed rates", async () => {
    await createDoc("INVOICE", "RE-MIX-1", new Date("2026-03-10"), [
      { vatRate: 19, totalPrice: 100 },
      { vatRate: 7, totalPrice: 50 },
    ])
    const result = await exportToCsv(
      prisma,
      TENANT_ID,
      { dateFrom: MARCH_FROM, dateTo: MARCH_TO, encoding: "utf8" },
      { userId: USER_ID }
    )
    expect(result.count).toBe(1) // one entry
    expect(result.rowCount).toBe(2) // two vat buckets
    const buf = Buffer.from(result.csv, "base64").slice(3)
    const csv = buf.toString("utf8")
    const dataLines = csv.split("\r\n").filter((l) => l.includes("RE-MIX-1"))
    expect(dataLines).toHaveLength(2)
    expect(dataLines[0]).toMatch(/;19,00;/) // USt-Satz 19%
    expect(dataLines[1]).toMatch(/;7,00;/) // USt-Satz 7%
  })

  it("Windows-1252 encoding roundtrips umlauts correctly", async () => {
    await createDoc("INVOICE", "RE-UMLAUT-1", new Date("2026-03-15"), [
      { vatRate: 19, totalPrice: 100 },
    ])
    const result = await exportToCsv(
      prisma,
      TENANT_ID,
      { dateFrom: MARCH_FROM, dateTo: MARCH_TO, encoding: "win1252" },
      { userId: USER_ID }
    )
    const buf = Buffer.from(result.csv, "base64")
    expect(buf[0]).not.toBe(0xef) // no BOM
    const decoded = iconv.decode(buf, "win1252")
    expect(decoded).toContain("Müller & Söhne GmbH")
  })

  it("writes audit log with format=csv, encoding, entry and row counts", async () => {
    await createDoc("INVOICE", "RE-AUD-1", new Date("2026-03-10"), [
      { vatRate: 19, totalPrice: 100 },
      { vatRate: 7, totalPrice: 50 },
    ])
    await exportToCsv(
      prisma,
      TENANT_ID,
      { dateFrom: MARCH_FROM, dateTo: MARCH_TO, encoding: "win1252" },
      { userId: USER_ID }
    )
    let logs: Array<{ action: string; metadata: unknown }> = []
    for (let i = 0; i < 10; i++) {
      logs = await prisma.auditLog.findMany({
        where: {
          tenantId: TENANT_ID,
          entityType: "outgoing_invoice_book",
        },
      })
      if (logs.length > 0) break
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(logs).toHaveLength(1)
    expect(logs[0]!.action).toBe("export")
    expect(logs[0]!.metadata).toMatchObject({
      format: "csv",
      encoding: "win1252",
      entryCount: 1,
      rowCount: 2,
    })
  })

  it("excludes DRAFT and CANCELLED invoices from CSV output", async () => {
    await createDoc("INVOICE", "RE-PRINTED", new Date("2026-03-10"), [
      { vatRate: 19, totalPrice: 100 },
    ])
    // Manually add DRAFT + CANCELLED
    const draft = await prisma.billingDocument.create({
      data: {
        tenantId: TENANT_ID,
        number: "RE-DRAFT",
        type: "INVOICE",
        status: "DRAFT",
        addressId: ADDR_ID,
        documentDate: new Date("2026-03-11"),
        subtotalNet: 100,
        totalVat: 19,
        totalGross: 119,
      },
    })
    await prisma.billingDocumentPosition.create({
      data: {
        documentId: draft.id,
        sortOrder: 1,
        type: "ARTICLE",
        description: "pos",
        quantity: 1,
        unit: "Stk",
        unitPrice: 100,
        totalPrice: 100,
        vatRate: 19,
      },
    })
    const cancelled = await prisma.billingDocument.create({
      data: {
        tenantId: TENANT_ID,
        number: "RE-CANCELLED",
        type: "INVOICE",
        status: "CANCELLED",
        addressId: ADDR_ID,
        documentDate: new Date("2026-03-12"),
        subtotalNet: 100,
        totalVat: 19,
        totalGross: 119,
      },
    })
    await prisma.billingDocumentPosition.create({
      data: {
        documentId: cancelled.id,
        sortOrder: 1,
        type: "ARTICLE",
        description: "pos",
        quantity: 1,
        unit: "Stk",
        unitPrice: 100,
        totalPrice: 100,
        vatRate: 19,
      },
    })
    const result = await exportToCsv(
      prisma,
      TENANT_ID,
      { dateFrom: MARCH_FROM, dateTo: MARCH_TO, encoding: "utf8" },
      { userId: USER_ID }
    )
    expect(result.count).toBe(1)
    const csv = Buffer.from(result.csv, "base64").slice(3).toString("utf8")
    expect(csv).toContain("RE-PRINTED")
    expect(csv).not.toContain("RE-DRAFT")
    expect(csv).not.toContain("RE-CANCELLED")
  })

  it("empty range produces header-only CSV", async () => {
    const result = await exportToCsv(
      prisma,
      TENANT_ID,
      { dateFrom: MARCH_FROM, dateTo: MARCH_TO, encoding: "utf8" },
      { userId: USER_ID }
    )
    expect(result.count).toBe(0)
    expect(result.rowCount).toBe(0)
    const csv = Buffer.from(result.csv, "base64").slice(3).toString("utf8")
    const lines = csv.trimEnd().split("\r\n")
    expect(lines).toHaveLength(1) // just the header
    expect(lines[0]).toContain("Rechnungsnummer")
  })
})
