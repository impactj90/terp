/**
 * Integration test for `outgoing-invoice-book-service.list()` against a
 * real Postgres database. Verifies that the Prisma query produces the
 * correct shape, filters, joins, sort order, and aggregation — things
 * the unit + router tests (mocked Prisma) cannot catch.
 *
 * Seeds a dedicated test tenant (deterministic UUID in the f-range so
 * it never collides with dev-seed data) and cleans up in `afterAll`.
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

// Storage is not used by the service layer, but safe to mock.
vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "mocked" }),
  createSignedReadUrl: vi.fn().mockResolvedValue("https://example.com/read"),
}))

import { prisma } from "@/lib/db/prisma"
import * as service from "../outgoing-invoice-book-service"

const TENANT_A = "f0000000-0000-4000-a000-000000000900"
const TENANT_A_SLUG = "oib-integration-a"
const TENANT_B = "f0000000-0000-4000-a000-000000000901"
const TENANT_B_SLUG = "oib-integration-b"
const USER_ID = "a0000000-0000-4000-a000-000000000900"
const ADDR_ID_A = "f0000000-0000-4000-a000-000000000910"
const ADDR_ID_B = "f0000000-0000-4000-a000-000000000911"

async function cleanupDocuments(tenantId: string) {
  await prisma.billingDocumentPosition
    .deleteMany({ where: { document: { tenantId } } })
    .catch(() => {})
  await prisma.billingDocument
    .deleteMany({ where: { tenantId } })
    .catch(() => {})
}

describe.sequential("OutgoingInvoiceBookService integration", () => {
  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TENANT_A },
      update: {},
      create: {
        id: TENANT_A,
        name: "OIB Test A",
        slug: TENANT_A_SLUG,
        isActive: true,
      },
    })
    await prisma.tenant.upsert({
      where: { id: TENANT_B },
      update: {},
      create: {
        id: TENANT_B,
        name: "OIB Test B",
        slug: TENANT_B_SLUG,
        isActive: true,
      },
    })
    await prisma.user.upsert({
      where: { id: USER_ID },
      update: {},
      create: {
        id: USER_ID,
        email: "oib-test@test.local",
        displayName: "OIB Test",
      },
    })
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: USER_ID, tenantId: TENANT_A } },
      update: {},
      create: { userId: USER_ID, tenantId: TENANT_A },
    })
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: USER_ID, tenantId: TENANT_B } },
      update: {},
      create: { userId: USER_ID, tenantId: TENANT_B },
    })
    await prisma.crmAddress.upsert({
      where: { id: ADDR_ID_A },
      update: {},
      create: {
        id: ADDR_ID_A,
        tenantId: TENANT_A,
        number: "K-A-001",
        company: "Müller GmbH",
        type: "CUSTOMER",
        vatId: "DE123456789",
        isActive: true,
      },
    })
    await prisma.crmAddress.upsert({
      where: { id: ADDR_ID_B },
      update: {},
      create: {
        id: ADDR_ID_B,
        tenantId: TENANT_B,
        number: "K-B-001",
        company: "Other Tenant GmbH",
        type: "CUSTOMER",
        isActive: true,
      },
    })
  })

  afterAll(async () => {
    await cleanupDocuments(TENANT_A)
    await cleanupDocuments(TENANT_B)
    await prisma.crmAddress
      .deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } })
      .catch(() => {})
    await prisma.userTenant
      .deleteMany({ where: { userId: USER_ID } })
      .catch(() => {})
    await prisma.user.deleteMany({ where: { id: USER_ID } }).catch(() => {})
    await prisma.tenant
      .deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } })
      .catch(() => {})
  })

  beforeEach(async () => {
    await cleanupDocuments(TENANT_A)
    await cleanupDocuments(TENANT_B)
  })

  // ──────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────

  let counter = 0
  async function createDoc(params: {
    tenantId?: string
    addressId?: string
    number?: string
    type:
      | "INVOICE"
      | "CREDIT_NOTE"
      | "OFFER"
      | "ORDER_CONFIRMATION"
      | "DELIVERY_NOTE"
      | "SERVICE_NOTE"
      | "RETURN_DELIVERY"
    status:
      | "DRAFT"
      | "PRINTED"
      | "PARTIALLY_FORWARDED"
      | "FORWARDED"
      | "CANCELLED"
    documentDate: Date
    servicePeriodFrom?: Date | null
    servicePeriodTo?: Date | null
    positions?: Array<{
      type?: "ARTICLE" | "FREE" | "TEXT" | "PAGE_BREAK" | "SUBTOTAL"
      vatRate: number | null
      totalPrice: number | null
    }>
    subtotalNet?: number
    totalVat?: number
    totalGross?: number
  }) {
    counter++
    const number = params.number ?? `RE-INT-${Date.now()}-${counter}`
    const positions = params.positions ?? [
      { type: "ARTICLE" as const, vatRate: 19, totalPrice: 100 },
    ]
    // Totals default to sum of positions at implied rates (tests may
    // override to check divergence between stored totals and computed
    // breakdown).
    const subtotalNet =
      params.subtotalNet ??
      positions.reduce((s, p) => s + (p.totalPrice ?? 0), 0)
    const totalVat =
      params.totalVat ??
      positions.reduce(
        (s, p) => s + ((p.totalPrice ?? 0) * (p.vatRate ?? 0)) / 100,
        0
      )
    const totalGross = params.totalGross ?? subtotalNet + totalVat

    const doc = await prisma.billingDocument.create({
      data: {
        tenantId: params.tenantId ?? TENANT_A,
        number,
        type: params.type,
        status: params.status,
        addressId: params.addressId ?? ADDR_ID_A,
        documentDate: params.documentDate,
        servicePeriodFrom: params.servicePeriodFrom ?? null,
        servicePeriodTo: params.servicePeriodTo ?? null,
        subtotalNet,
        totalVat,
        totalGross,
      },
    })
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!
      await prisma.billingDocumentPosition.create({
        data: {
          documentId: doc.id,
          sortOrder: i + 1,
          type: p.type ?? "ARTICLE",
          description: `Pos ${i + 1}`,
          quantity: 1,
          unit: "Stk",
          unitPrice: p.totalPrice ?? 0,
          totalPrice: p.totalPrice,
          vatRate: p.vatRate,
        },
      })
    }
    return doc
  }

  const MARCH_FROM = new Date("2026-03-01")
  const MARCH_TO = new Date("2026-03-31")

  // ──────────────────────────────────────────────────────────────────
  // Filters: Status
  // ──────────────────────────────────────────────────────────────────

  it("excludes DRAFT documents", async () => {
    await createDoc({
      type: "INVOICE",
      status: "DRAFT",
      documentDate: new Date("2026-03-15"),
    })
    const { entries, summary } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(entries).toHaveLength(0)
    expect(summary.totalGross).toBe(0)
  })

  it("excludes CANCELLED documents", async () => {
    await createDoc({
      type: "INVOICE",
      status: "CANCELLED",
      documentDate: new Date("2026-03-15"),
    })
    const { entries } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(entries).toHaveLength(0)
  })

  it("includes PRINTED, FORWARDED, PARTIALLY_FORWARDED invoices", async () => {
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-10"),
      number: "P-PRINTED",
    })
    await createDoc({
      type: "INVOICE",
      status: "FORWARDED",
      documentDate: new Date("2026-03-11"),
      number: "P-FORWARDED",
    })
    await createDoc({
      type: "INVOICE",
      status: "PARTIALLY_FORWARDED",
      documentDate: new Date("2026-03-12"),
      number: "P-PARTIALLY",
    })
    const { entries } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    const nums = entries.map((e) => e.number).sort()
    expect(nums).toEqual(["P-FORWARDED", "P-PARTIALLY", "P-PRINTED"])
  })

  // ──────────────────────────────────────────────────────────────────
  // Filters: Type
  // ──────────────────────────────────────────────────────────────────

  it("excludes non-INVOICE/CREDIT_NOTE document types", async () => {
    const nonBillingTypes: Array<
      | "OFFER"
      | "ORDER_CONFIRMATION"
      | "DELIVERY_NOTE"
      | "SERVICE_NOTE"
      | "RETURN_DELIVERY"
    > = [
      "OFFER",
      "ORDER_CONFIRMATION",
      "DELIVERY_NOTE",
      "SERVICE_NOTE",
      "RETURN_DELIVERY",
    ]
    for (const type of nonBillingTypes) {
      await createDoc({
        type,
        status: "PRINTED",
        documentDate: new Date("2026-03-15"),
      })
    }
    const { entries } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(entries).toHaveLength(0)
  })

  it("includes INVOICE + CREDIT_NOTE document types", async () => {
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-10"),
      number: "I-1",
    })
    await createDoc({
      type: "CREDIT_NOTE",
      status: "PRINTED",
      documentDate: new Date("2026-03-11"),
      number: "C-1",
    })
    const { entries } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.type).sort()).toEqual([
      "CREDIT_NOTE",
      "INVOICE",
    ])
  })

  // ──────────────────────────────────────────────────────────────────
  // Signs & Aggregation
  // ──────────────────────────────────────────────────────────────────

  it("negates subtotalNet / totalVat / totalGross for CREDIT_NOTE", async () => {
    await createDoc({
      type: "CREDIT_NOTE",
      status: "PRINTED",
      documentDate: new Date("2026-03-15"),
      positions: [{ type: "ARTICLE", vatRate: 19, totalPrice: 100 }],
    })
    const { entries, summary } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(entries[0]!.subtotalNet).toBe(-100)
    expect(entries[0]!.totalVat).toBe(-19)
    expect(entries[0]!.totalGross).toBe(-119)
    expect(entries[0]!.vatBreakdown[0]!.net).toBe(-100)
    expect(summary.totalGross).toBe(-119)
  })

  it("aggregates mixed 19% + 7% into 2 buckets, sorted descending", async () => {
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-15"),
      positions: [
        { type: "ARTICLE", vatRate: 19, totalPrice: 100 },
        { type: "ARTICLE", vatRate: 7, totalPrice: 50 },
      ],
    })
    const { entries, summary } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(entries[0]!.vatBreakdown).toHaveLength(2)
    expect(entries[0]!.vatBreakdown.map((b) => b.vatRate)).toEqual([19, 7])
    expect(summary.perRate.map((r) => r.vatRate)).toEqual([19, 7])
  })

  it("skips structural positions (TEXT / PAGE_BREAK / SUBTOTAL)", async () => {
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-15"),
      positions: [
        { type: "TEXT", vatRate: null, totalPrice: null },
        { type: "PAGE_BREAK", vatRate: null, totalPrice: null },
        { type: "SUBTOTAL", vatRate: null, totalPrice: null },
        { type: "ARTICLE", vatRate: 19, totalPrice: 100 },
      ],
    })
    const { entries } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(entries[0]!.vatBreakdown).toHaveLength(1)
    expect(entries[0]!.vatBreakdown[0]!.net).toBe(100)
  })

  it("handles dynamic VAT rates (e.g. historic 16%)", async () => {
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-15"),
      positions: [{ type: "ARTICLE", vatRate: 16, totalPrice: 100 }],
    })
    const { summary } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(summary.perRate.map((r) => r.vatRate)).toEqual([16])
  })

  // ──────────────────────────────────────────────────────────────────
  // Tenant Isolation
  // ──────────────────────────────────────────────────────────────────

  it("does not leak documents across tenants", async () => {
    await createDoc({
      tenantId: TENANT_A,
      addressId: ADDR_ID_A,
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-15"),
      number: "TENANT-A-1",
    })
    await createDoc({
      tenantId: TENANT_B,
      addressId: ADDR_ID_B,
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-15"),
      number: "TENANT-B-1",
    })
    const a = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    const b = await service.list(prisma, TENANT_B, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(a.entries.map((e) => e.number)).toEqual(["TENANT-A-1"])
    expect(b.entries.map((e) => e.number)).toEqual(["TENANT-B-1"])
  })

  // ──────────────────────────────────────────────────────────────────
  // Date Range
  // ──────────────────────────────────────────────────────────────────

  it("includes docs on both bounds (inclusive range)", async () => {
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-01T00:00:00Z"),
      number: "BOUND-FROM",
    })
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-31T23:59:59Z"),
      number: "BOUND-TO",
    })
    const { entries } = await service.list(prisma, TENANT_A, {
      dateFrom: new Date("2026-03-01T00:00:00Z"),
      dateTo: new Date("2026-03-31T23:59:59Z"),
    })
    const nums = entries.map((e) => e.number).sort()
    expect(nums).toEqual(["BOUND-FROM", "BOUND-TO"])
  })

  it("excludes docs just outside the range", async () => {
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-02-28T23:59:59Z"),
      number: "BEFORE",
    })
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-04-01T00:00:01Z"),
      number: "AFTER",
    })
    const { entries } = await service.list(prisma, TENANT_A, {
      dateFrom: new Date("2026-03-01T00:00:00Z"),
      dateTo: new Date("2026-03-31T23:59:59Z"),
    })
    expect(entries).toHaveLength(0)
  })

  it("rejects when dateFrom > dateTo", async () => {
    await expect(
      service.list(prisma, TENANT_A, {
        dateFrom: new Date("2026-04-01"),
        dateTo: new Date("2026-03-01"),
      })
    ).rejects.toThrow(/dateFrom/)
  })

  // ──────────────────────────────────────────────────────────────────
  // Sort Order
  // ──────────────────────────────────────────────────────────────────

  it("sorts by documentDate asc, then number asc", async () => {
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-15"),
      number: "RE-B",
    })
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-10"),
      number: "RE-C",
    })
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-15"),
      number: "RE-A",
    })
    const { entries } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(entries.map((e) => e.number)).toEqual(["RE-C", "RE-A", "RE-B"])
  })

  // ──────────────────────────────────────────────────────────────────
  // Customer Join
  // ──────────────────────────────────────────────────────────────────

  it("joins customer info (company, number, vatId) from CRM address", async () => {
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-15"),
    })
    const { entries } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(entries[0]!.customerName).toBe("Müller GmbH")
    expect(entries[0]!.customerNumber).toBe("K-A-001")
    expect(entries[0]!.customerVatId).toBe("DE123456789")
  })

  // ──────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────

  it("aggregates summary across multiple documents", async () => {
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-10"),
      positions: [{ type: "ARTICLE", vatRate: 19, totalPrice: 100 }],
    })
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-15"),
      positions: [{ type: "ARTICLE", vatRate: 19, totalPrice: 200 }],
    })
    await createDoc({
      type: "INVOICE",
      status: "PRINTED",
      documentDate: new Date("2026-03-20"),
      positions: [{ type: "ARTICLE", vatRate: 7, totalPrice: 50 }],
    })
    const { summary } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(summary.perRate).toHaveLength(2)
    expect(summary.perRate.find((r) => r.vatRate === 19)!.net).toBe(300)
    expect(summary.perRate.find((r) => r.vatRate === 7)!.net).toBe(50)
    expect(summary.totalNet).toBe(350)
    expect(summary.totalVat).toBe(60.5)
    expect(summary.totalGross).toBe(410.5)
  })

  it("returns empty entries + zero summary when no matches", async () => {
    const { entries, summary } = await service.list(prisma, TENANT_A, {
      dateFrom: MARCH_FROM,
      dateTo: MARCH_TO,
    })
    expect(entries).toEqual([])
    expect(summary.perRate).toEqual([])
    expect(summary.totalNet).toBe(0)
    expect(summary.totalGross).toBe(0)
  })
})
