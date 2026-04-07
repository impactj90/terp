/**
 * Integration tests for inbound-invoice-service against real DB.
 * Storage is mocked (Supabase may not be running).
 *
 * Tests run sequentially — some depend on DB state from prior tests.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { PDFDocument } from "pdf-lib"

// Mock Supabase storage
vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "mocked" }),
  remove: vi.fn().mockResolvedValue(undefined),
  createSignedUploadUrl: vi.fn().mockResolvedValue({
    signedUrl: "https://example.com/upload",
    path: "mocked",
    token: "tok",
  }),
  createSignedReadUrl: vi.fn().mockResolvedValue("https://example.com/read"),
}))

import { prisma } from "@/lib/db/prisma"
import * as service from "../inbound-invoice-service"
import * as lineItemRepo from "../inbound-invoice-line-item-repository"

// --- Constants ---

const TEST_TENANT_ID = "f0000000-0000-4000-a000-000000000505"
const TEST_TENANT_SLUG = "inbound-invoice-integration"
const TEST_USER_ID = "a0000000-0000-4000-a000-000000000505"

const FIXTURES_DIR = path.resolve(__dirname, "fixtures/zugferd")

function loadFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name))
}

async function createPlainPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage()
  page.drawText("Plain invoice without ZUGFeRD", { x: 50, y: 500 })
  return Buffer.from(await doc.save())
}

// --- Setup & Teardown ---

beforeAll(async () => {
  // Create test tenant
  await prisma.tenant.upsert({
    where: { id: TEST_TENANT_ID },
    update: {},
    create: {
      id: TEST_TENANT_ID,
      name: "Inbound Invoice Integration Test",
      slug: TEST_TENANT_SLUG,
      isActive: true,
    },
  })

  // Create test user (needed for submittedBy FK)
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: {
      id: TEST_USER_ID,
      email: "invoice-int-test@test.local",
      displayName: "Test User",
    },
  })

  // Link user to tenant
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: TEST_USER_ID, tenantId: TEST_TENANT_ID } },
    update: {},
    create: { userId: TEST_USER_ID, tenantId: TEST_TENANT_ID },
  })
})

afterAll(async () => {
  // Cleanup in dependency order
  await prisma.inboundInvoiceLineItem
    .deleteMany({ where: { invoice: { tenantId: TEST_TENANT_ID } } })
    .catch(() => {})
  await prisma.inboundInvoice
    .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
    .catch(() => {})
  await prisma.inboundEmailLog
    .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
    .catch(() => {})
  await prisma.numberSequence
    .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
    .catch(() => {})
  await prisma.crmAddress
    .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
    .catch(() => {})
  await prisma.userTenant
    .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
    .catch(() => {})
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } }).catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: TEST_TENANT_ID } }).catch(() => {})
})

async function cleanupInvoices() {
  await prisma.inboundInvoiceLineItem
    .deleteMany({ where: { invoice: { tenantId: TEST_TENANT_ID } } })
    .catch(() => {})
  await prisma.inboundInvoice
    .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
    .catch(() => {})
}

// --- Tests ---

describe.sequential("inbound-invoice-service integration", () => {
  beforeEach(async () => {
    await cleanupInvoices()
  })

  // ---------------------------------------------------------------
  // 1. Upload plain PDF → DRAFT, no ZUGFeRD, no line items
  // ---------------------------------------------------------------
  it("creates DRAFT invoice from plain PDF upload", async () => {
    const pdf = await createPlainPdf()

    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "plain-invoice.pdf", TEST_USER_ID
    )

    expect(invoice.status).toBe("DRAFT")
    expect(invoice.source).toBe("manual")
    expect(invoice.zugferdProfile).toBeNull()
    expect(invoice.pdfStoragePath).toBeTruthy()
    expect(invoice.pdfOriginalFilename).toBe("plain-invoice.pdf")
    expect(invoice.number).toMatch(/^ER-/)

    // No line items
    const lineItems = await lineItemRepo.findByInvoiceId(prisma, invoice.id)
    expect(lineItems).toHaveLength(0)
  })

  // ---------------------------------------------------------------
  // 2. Upload ZUGFeRD PDF → fields pre-filled + line items
  // ---------------------------------------------------------------
  it("creates invoice with pre-filled ZUGFeRD fields and line items", async () => {
    const pdf = loadFixture("EN16931_Einfach.pdf")

    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "zugferd-rechnung.pdf", TEST_USER_ID
    )

    expect(invoice.source).toBe("zugferd")
    expect(invoice.zugferdProfile).toBe("EN16931")
    expect(invoice.invoiceNumber).toBe("471102")
    expect(Number(invoice.totalGross)).toBeCloseTo(529.87, 2)
    expect(Number(invoice.totalNet)).toBeCloseTo(473, 2)
    expect(invoice.sellerVatId).toBe("DE123456789")
    expect(invoice.sellerName).toBe("Lieferant GmbH")

    // Line items from ZUGFeRD
    const lineItems = await lineItemRepo.findByInvoiceId(prisma, invoice.id)
    expect(lineItems.length).toBeGreaterThanOrEqual(2)
    expect(lineItems[0]!.description).toBe("Trennblätter A4")
  })

  // ---------------------------------------------------------------
  // 3. Duplicate check: same supplier + invoiceNumber → error
  // ---------------------------------------------------------------
  it("throws DuplicateError on same supplier + invoiceNumber", async () => {
    // Create a supplier that matches the ZUGFeRD VAT ID
    await prisma.crmAddress.upsert({
      where: { id: "f0000000-0000-4000-a000-000000000506" },
      update: {},
      create: {
        id: "f0000000-0000-4000-a000-000000000506",
        tenantId: TEST_TENANT_ID,
        number: "LF-INT-505",
        company: "Lieferant GmbH",
        type: "SUPPLIER",
        isActive: true,
        vatId: "DE123456789",
      },
    })

    const pdf = loadFixture("EN16931_Einfach.pdf")

    // First upload succeeds
    await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "first.pdf", TEST_USER_ID
    )

    // Second upload with same ZUGFeRD data → duplicate
    await expect(
      service.createFromUpload(
        prisma, TEST_TENANT_ID, pdf, "second.pdf", TEST_USER_ID
      )
    ).rejects.toThrow(service.InboundInvoiceDuplicateError)
  })

  // ---------------------------------------------------------------
  // 4. Update with material field change → approvalVersion increments
  // ---------------------------------------------------------------
  it("increments approvalVersion when totalGross changes", async () => {
    const pdf = await createPlainPdf()
    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "update-test.pdf", TEST_USER_ID
    )
    expect(invoice.approvalVersion).toBe(1)

    const updated = await service.update(
      prisma, TEST_TENANT_ID, invoice.id,
      { totalGross: 999.99 }
    )
    expect(updated.approvalVersion).toBe(2)
    expect(Number(updated.totalGross)).toBeCloseTo(999.99, 2)
  })

  // ---------------------------------------------------------------
  // 5. Update non-material field → approvalVersion stays
  // ---------------------------------------------------------------
  it("does not increment approvalVersion for notes change", async () => {
    const pdf = await createPlainPdf()
    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "notes-test.pdf", TEST_USER_ID
    )

    const updated = await service.update(
      prisma, TEST_TENANT_ID, invoice.id,
      { notes: "Bitte prüfen" }
    )
    expect(updated.approvalVersion).toBe(1)
    expect(updated.notes).toBe("Bitte prüfen")
  })

  // ---------------------------------------------------------------
  // 6. Line items: replace all + sum validation
  // ---------------------------------------------------------------
  it("replaces line items and validates sum against header", async () => {
    const pdf = await createPlainPdf()
    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "lineitems.pdf", TEST_USER_ID
    )

    // Set header totalNet so validation kicks in
    await service.update(prisma, TEST_TENANT_ID, invoice.id, {
      totalNet: 100,
    })

    // Matching sum → OK
    await service.updateLineItems(
      prisma, TEST_TENANT_ID, invoice.id,
      [
        { description: "Item A", totalNet: 60, quantity: 1, vatRate: 19 },
        { description: "Item B", totalNet: 40, quantity: 2, vatRate: 19 },
      ]
    )

    const items = await lineItemRepo.findByInvoiceId(prisma, invoice.id)
    expect(items).toHaveLength(2)

    // Mismatching sum → error
    await expect(
      service.updateLineItems(
        prisma, TEST_TENANT_ID, invoice.id,
        [{ description: "Wrong", totalNet: 50 }]
      )
    ).rejects.toThrow("does not match header total")
  })

  // ---------------------------------------------------------------
  // 7. Submit for approval: guards
  // ---------------------------------------------------------------
  it("rejects submission without required fields", async () => {
    const pdf = await createPlainPdf()
    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "submit-test.pdf", TEST_USER_ID
    )

    // No invoiceNumber, no supplier → should fail
    await expect(
      service.submitForApproval(prisma, TEST_TENANT_ID, invoice.id, TEST_USER_ID)
    ).rejects.toThrow(service.InboundInvoiceValidationError)
  })

  it("submits invoice with all required fields", async () => {
    const pdf = await createPlainPdf()
    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "submit-ok.pdf", TEST_USER_ID
    )

    // Create a supplier
    const supplier = await prisma.crmAddress.upsert({
      where: { id: "f0000000-0000-4000-a000-000000000507" },
      update: {},
      create: {
        id: "f0000000-0000-4000-a000-000000000507",
        tenantId: TEST_TENANT_ID,
        number: "LF-SUB-001",
        company: "Submit Test Supplier",
        type: "SUPPLIER",
        isActive: true,
      },
    })

    // Fill required fields
    await service.update(prisma, TEST_TENANT_ID, invoice.id, {
      invoiceNumber: "R-2024-999",
      invoiceDate: new Date("2024-06-01"),
      totalGross: 500,
    })
    await service.assignSupplier(prisma, TEST_TENANT_ID, invoice.id, supplier.id)

    // Submit
    const submitted = await service.submitForApproval(
      prisma, TEST_TENANT_ID, invoice.id, TEST_USER_ID
    )
    // Without approval policies, auto-approves
    expect(submitted.status).toBe("APPROVED")
    expect(submitted.submittedBy).toBe(TEST_USER_ID)
    expect(submitted.submittedAt).toBeTruthy()
  })

  // ---------------------------------------------------------------
  // 8. Assign supplier
  // ---------------------------------------------------------------
  it("assigns supplier to unknown-supplier invoice", async () => {
    const pdf = await createPlainPdf()
    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "assign-test.pdf", TEST_USER_ID
    )
    expect(invoice.supplierStatus).toBe("unknown")

    const supplier = await prisma.crmAddress.upsert({
      where: { id: "f0000000-0000-4000-a000-000000000508" },
      update: {},
      create: {
        id: "f0000000-0000-4000-a000-000000000508",
        tenantId: TEST_TENANT_ID,
        number: "LF-ASS-001",
        company: "Assigned Supplier GmbH",
        type: "SUPPLIER",
        isActive: true,
      },
    })

    const updated = await service.assignSupplier(
      prisma, TEST_TENANT_ID, invoice.id, supplier.id
    )
    expect(updated.supplierId).toBe(supplier.id)
    expect(updated.supplierStatus).toBe("matched")
  })

  // ---------------------------------------------------------------
  // 9. Remove: only DRAFT allowed
  // ---------------------------------------------------------------
  it("deletes DRAFT invoice and cleans up storage", async () => {
    const pdf = await createPlainPdf()
    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "delete-test.pdf", TEST_USER_ID
    )

    await service.remove(prisma, TEST_TENANT_ID, invoice.id)

    // Should be gone from DB
    const found = await prisma.inboundInvoice.findFirst({
      where: { id: invoice.id, tenantId: TEST_TENANT_ID },
    })
    expect(found).toBeNull()
  })

  it("rejects deletion of non-DRAFT invoice", async () => {
    const pdf = await createPlainPdf()
    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "no-delete.pdf", TEST_USER_ID
    )

    // Force status to APPROVED
    await prisma.inboundInvoice.updateMany({
      where: { id: invoice.id },
      data: { status: "APPROVED" },
    })

    await expect(
      service.remove(prisma, TEST_TENANT_ID, invoice.id)
    ).rejects.toThrow("only DRAFT")
  })

  // ---------------------------------------------------------------
  // 10. Cancel
  // ---------------------------------------------------------------
  it("cancels an invoice", async () => {
    const pdf = await createPlainPdf()
    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "cancel-test.pdf", TEST_USER_ID
    )

    await service.cancel(prisma, TEST_TENANT_ID, invoice.id)

    const found = await prisma.inboundInvoice.findFirst({
      where: { id: invoice.id },
    })
    expect(found!.status).toBe("CANCELLED")
  })

  // ---------------------------------------------------------------
  // 11. Reopen exported
  // ---------------------------------------------------------------
  it("reopens an EXPORTED invoice back to DRAFT", async () => {
    const pdf = await createPlainPdf()
    const invoice = await service.createFromUpload(
      prisma, TEST_TENANT_ID, pdf, "reopen-test.pdf", TEST_USER_ID
    )

    // Force to EXPORTED
    await prisma.inboundInvoice.updateMany({
      where: { id: invoice.id },
      data: { status: "EXPORTED", datevExportedAt: new Date(), datevExportedBy: TEST_USER_ID },
    })

    const reopened = await service.reopenExported(prisma, TEST_TENANT_ID, invoice.id)
    expect(reopened.status).toBe("DRAFT")
    expect(reopened.datevExportedAt).toBeNull()
  })

  // ---------------------------------------------------------------
  // 12. getById throws NotFoundError
  // ---------------------------------------------------------------
  it("throws NotFoundError for non-existent invoice", async () => {
    await expect(
      service.getById(prisma, TEST_TENANT_ID, "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow(service.InboundInvoiceNotFoundError)
  })

  // ---------------------------------------------------------------
  // 13. List with filters
  // ---------------------------------------------------------------
  it("lists invoices with status filter", async () => {
    const pdf = await createPlainPdf()
    await service.createFromUpload(prisma, TEST_TENANT_ID, pdf, "list1.pdf", TEST_USER_ID)
    await service.createFromUpload(prisma, TEST_TENANT_ID, pdf, "list2.pdf", TEST_USER_ID)

    const result = await service.list(prisma, TEST_TENANT_ID, { status: "DRAFT" })
    expect(result.total).toBeGreaterThanOrEqual(2)
    expect(result.items.every((i) => i.status === "DRAFT")).toBe(true)
  })
})
