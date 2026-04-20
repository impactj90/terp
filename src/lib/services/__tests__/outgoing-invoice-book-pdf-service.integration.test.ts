/**
 * Integration test for `outgoing-invoice-book-pdf-service.generateAndGetDownloadUrl`.
 *
 * Uses a real Postgres DB to exercise the `bookService.list()` →
 * PDF-rendering → storage-upload → audit-log pipeline. The storage
 * client and @react-pdf/renderer are mocked because:
 *   - Storage hits a live Supabase bucket (test fixture pollution).
 *   - React-PDF is heavy and its binary output is not what we assert on
 *     — we check the wiring, path, filename, and audit trail.
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

const storageMocks = vi.hoisted(() => ({
  upload: vi.fn().mockResolvedValue({ path: "mocked" }),
  createSignedReadUrl: vi
    .fn()
    .mockResolvedValue("https://example.com/signed-pdf"),
}))

vi.mock("@/lib/supabase/storage", () => storageMocks)

vi.mock("@react-pdf/renderer", () => ({
  Document: () => null,
  Page: () => null,
  View: () => null,
  Text: () => null,
  Image: () => null,
  StyleSheet: { create: (o: unknown) => o },
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake")),
}))

import { prisma } from "@/lib/db/prisma"
import { generateAndGetDownloadUrl } from "../outgoing-invoice-book-pdf-service"

const TENANT_ID = "f0000000-0000-4000-a000-000000000902"
const TENANT_SLUG = "oib-pdf-integration"
const USER_ID = "a0000000-0000-4000-a000-000000000902"
const ADDR_ID = "f0000000-0000-4000-a000-000000000912"

async function cleanupDocuments() {
  await prisma.billingDocumentPosition
    .deleteMany({ where: { document: { tenantId: TENANT_ID } } })
    .catch(() => {})
  await prisma.billingDocument
    .deleteMany({ where: { tenantId: TENANT_ID } })
    .catch(() => {})
}

describe.sequential("OutgoingInvoiceBook PDF service integration", () => {
  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TENANT_ID },
      update: {},
      create: {
        id: TENANT_ID,
        name: "OIB PDF Test",
        slug: TENANT_SLUG,
        isActive: true,
      },
    })
    await prisma.user.upsert({
      where: { id: USER_ID },
      update: {},
      create: {
        id: USER_ID,
        email: "oib-pdf@test.local",
        displayName: "OIB PDF",
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
        number: "K-PDF-001",
        company: "PDF Customer GmbH",
        type: "CUSTOMER",
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
    storageMocks.upload.mockClear()
    storageMocks.createSignedReadUrl.mockClear()
    storageMocks.createSignedReadUrl.mockResolvedValue(
      "https://example.com/signed-pdf"
    )
    await prisma.auditLog
      .deleteMany({ where: { tenantId: TENANT_ID } })
      .catch(() => {})
  })

  async function createInvoice(
    overrides: Record<string, unknown> = {},
    positions: Array<{
      type?: "ARTICLE" | "FREE"
      vatRate: number
      totalPrice: number
    }> = [{ type: "ARTICLE", vatRate: 19, totalPrice: 100 }]
  ) {
    const subtotalNet = positions.reduce((s, p) => s + p.totalPrice, 0)
    const totalVat = positions.reduce(
      (s, p) => s + (p.totalPrice * p.vatRate) / 100,
      0
    )
    const doc = await prisma.billingDocument.create({
      data: {
        tenantId: TENANT_ID,
        number: `RE-PDF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: "INVOICE",
        status: "PRINTED",
        addressId: ADDR_ID,
        documentDate: new Date("2026-03-15"),
        subtotalNet,
        totalVat,
        totalGross: subtotalNet + totalVat,
        ...overrides,
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
          unitPrice: p.totalPrice,
          totalPrice: p.totalPrice,
          vatRate: p.vatRate,
        },
      })
    }
    return doc
  }

  const MARCH_FROM = new Date("2026-03-01")
  const MARCH_TO = new Date("2026-03-31")

  it("generates PDF, uploads to storage, returns signed URL + filename", async () => {
    await createInvoice()
    const result = await generateAndGetDownloadUrl(
      prisma,
      TENANT_ID,
      { dateFrom: MARCH_FROM, dateTo: MARCH_TO },
      { userId: USER_ID }
    )
    expect(result.signedUrl).toBe("https://example.com/signed-pdf")
    expect(result.filename).toBe("Rechnungsausgangsbuch_2026-03.pdf")
    expect(result.count).toBe(1)

    // Storage upload called with correct bucket + path prefix
    expect(storageMocks.upload).toHaveBeenCalledTimes(1)
    const [bucket, path, , opts] = storageMocks.upload.mock.calls[0]!
    expect(bucket).toBe("documents")
    expect(path).toMatch(
      /^rechnungsausgangsbuch\/[0-9a-f-]+\/2026-03-01_bis_2026-03-31\.pdf$/
    )
    expect(opts).toMatchObject({
      contentType: "application/pdf",
      upsert: true,
    })

    // Signed URL generated with 60 s expiry
    expect(storageMocks.createSignedReadUrl).toHaveBeenCalledWith(
      "documents",
      expect.any(String),
      60
    )
  })

  it("writes an audit log entry with export/outgoing_invoice_book/pdf", async () => {
    await createInvoice()
    await generateAndGetDownloadUrl(
      prisma,
      TENANT_ID,
      { dateFrom: MARCH_FROM, dateTo: MARCH_TO },
      { userId: USER_ID }
    )
    // Give best-effort audit a moment — the service uses .catch() so the
    // promise is not awaited inside the service. We poll briefly.
    let logs: Array<{
      action: string
      entityType: string
      metadata: unknown
    }> = []
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
      format: "pdf",
      entryCount: 1,
    })
    expect(
      (logs[0]!.metadata as { storagePath: string }).storagePath
    ).toMatch(/^rechnungsausgangsbuch\/[0-9a-f-]+\/.*\.pdf$/)
  })

  it("range filename when dates span multiple months", async () => {
    await createInvoice({ documentDate: new Date("2026-03-15") })
    await createInvoice({ documentDate: new Date("2026-04-05") })
    const result = await generateAndGetDownloadUrl(
      prisma,
      TENANT_ID,
      {
        dateFrom: new Date("2026-03-01"),
        dateTo: new Date("2026-04-30"),
      },
      { userId: USER_ID }
    )
    expect(result.filename).toBe(
      "Rechnungsausgangsbuch_2026-03-01_bis_2026-04-30.pdf"
    )
    expect(result.count).toBe(2)
  })

  it("supports empty result (count=0)", async () => {
    const result = await generateAndGetDownloadUrl(
      prisma,
      TENANT_ID,
      { dateFrom: MARCH_FROM, dateTo: MARCH_TO },
      { userId: USER_ID }
    )
    expect(result.count).toBe(0)
    expect(storageMocks.upload).toHaveBeenCalledTimes(1)
  })

  it("throws OutgoingInvoiceBookPdfError if signed URL fails", async () => {
    await createInvoice()
    storageMocks.createSignedReadUrl.mockResolvedValueOnce(null)
    await expect(
      generateAndGetDownloadUrl(
        prisma,
        TENANT_ID,
        { dateFrom: MARCH_FROM, dateTo: MARCH_TO },
        { userId: USER_ID }
      )
    ).rejects.toThrow(/Signed URL generation failed/)
  })

  it("wraps storage upload errors as OutgoingInvoiceBookPdfError", async () => {
    await createInvoice()
    storageMocks.upload.mockRejectedValueOnce(new Error("quota exceeded"))
    await expect(
      generateAndGetDownloadUrl(
        prisma,
        TENANT_ID,
        { dateFrom: MARCH_FROM, dateTo: MARCH_TO },
        { userId: USER_ID }
      )
    ).rejects.toThrow(/PDF upload failed: quota exceeded/)
  })
})
