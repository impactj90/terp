/**
 * Integration tests for the IMAP Poll Cron route.
 *
 * Requires GreenMail running (`pnpm docker:dev`).
 * Tests run sequentially — IMAP state (uid_next) changes between tests.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import * as net from "net"
import * as nodemailer from "nodemailer"
import * as fs from "fs"
import * as path from "path"
import { ImapFlow } from "imapflow"
import { PDFDocument } from "pdf-lib"

// Mock Supabase storage — not available in integration test environment
vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "mocked" }),
  remove: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "@/lib/db/prisma"
import { GET } from "../route"

// --- Constants ---

const TEST_TENANT_ID = "f0000000-0000-4000-a000-000000000404"
const TEST_TENANT_SLUG = "imap-poll-integration"
const GREENMAIL_HOST = "127.0.0.1"
const GREENMAIL_SMTP_PORT = 3025
const GREENMAIL_IMAP_PORT = 3143
const IMAP_USER = "test"
const IMAP_PASS = "test"
const CRON_SECRET = "integration-test-cron-secret"

const FIXTURES_DIR = path.resolve(
  __dirname,
  "../../../../../lib/services/__tests__/fixtures/zugferd"
)

// --- Helpers ---

async function isGreenMailAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(GREENMAIL_IMAP_PORT, GREENMAIL_HOST)
    socket.setTimeout(2000)
    socket.on("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.on("timeout", () => {
      socket.destroy()
      resolve(false)
    })
    socket.on("error", () => {
      socket.destroy()
      resolve(false)
    })
  })
}

function createImapClient(): ImapFlow {
  return new ImapFlow({
    host: GREENMAIL_HOST,
    port: GREENMAIL_IMAP_PORT,
    secure: false,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    tls: { rejectUnauthorized: false },
    logger: false,
  })
}

async function sendTestMail(opts: {
  from?: string
  subject?: string
  text?: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType?: string
  }>
  messageId?: string
}) {
  const transport = nodemailer.createTransport({
    host: GREENMAIL_HOST,
    port: GREENMAIL_SMTP_PORT,
    secure: false,
    tls: { rejectUnauthorized: false },
  })

  await transport.sendMail({
    from: opts.from ?? "supplier@example.com",
    to: `${IMAP_USER}@test.local`,
    subject: opts.subject ?? "Invoice",
    text: opts.text ?? "See attached invoice.",
    messageId: opts.messageId,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType ?? "application/pdf",
    })),
  })
}

async function triggerCron(): Promise<Response> {
  const request = new Request("http://localhost/api/cron/email-imap-poll", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
  return GET(request)
}

async function clearMailbox(): Promise<void> {
  const client = createImapClient()
  await client.connect()
  const lock = await client.getMailboxLock("INBOX")
  try {
    if (client.mailbox && client.mailbox.exists > 0) {
      await client.messageDelete({ all: true })
    }
  } finally {
    lock.release()
  }
  await client.logout()
}

async function createPlainPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage()
  page.drawText("Test Invoice - No ZUGFeRD Data", { x: 50, y: 500 })
  const bytes = await doc.save()
  return Buffer.from(bytes)
}

function loadFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name))
}

async function cleanupTestData(): Promise<void> {
  await prisma.inboundInvoiceLineItem
    .deleteMany({ where: { invoice: { tenantId: TEST_TENANT_ID } } })
    .catch(() => {})
  await prisma.inboundInvoice
    .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
    .catch(() => {})
  await prisma.inboundEmailLog
    .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
    .catch(() => {})
}

async function resetImapPollState(): Promise<void> {
  await prisma.tenantImapConfig.update({
    where: { tenantId: TEST_TENANT_ID },
    data: {
      uidValidity: null,
      uidNext: null,
      lastPollAt: null,
      lastPollError: null,
      lastPollErrorAt: null,
      consecutiveFailures: 0,
    },
  })
}

// --- GreenMail availability check ---

const greenMailAvailable = await isGreenMailAvailable()

if (!greenMailAvailable) {
  console.warn(
    "⚠ GreenMail nicht erreichbar auf 127.0.0.1:3143 — " +
      "Integration-Tests übersprungen. Siehe Docker-Setup: pnpm docker:dev"
  )
}

// --- Tests ---

describe.skipIf(!greenMailAvailable).sequential(
  "IMAP Poll Cron Integration (GreenMail)",
  () => {
    let originalCronSecret: string | undefined

    beforeAll(async () => {
      originalCronSecret = process.env.CRON_SECRET
      process.env.CRON_SECRET = CRON_SECRET

      // Create test tenant
      await prisma.tenant.upsert({
        where: { id: TEST_TENANT_ID },
        update: {},
        create: {
          id: TEST_TENANT_ID,
          name: "IMAP Poll Integration Test",
          slug: TEST_TENANT_SLUG,
          isActive: true,
        },
      })

      // Create IMAP config pointing at GreenMail
      await prisma.tenantImapConfig.upsert({
        where: { tenantId: TEST_TENANT_ID },
        update: {
          host: GREENMAIL_HOST,
          port: GREENMAIL_IMAP_PORT,
          username: IMAP_USER,
          password: IMAP_PASS,
          encryption: "NONE",
          mailbox: "INBOX",
          isVerified: true,
          isActive: true,
        },
        create: {
          tenantId: TEST_TENANT_ID,
          host: GREENMAIL_HOST,
          port: GREENMAIL_IMAP_PORT,
          username: IMAP_USER,
          password: IMAP_PASS,
          encryption: "NONE",
          mailbox: "INBOX",
          isVerified: true,
          isActive: true,
        },
      })
    })

    afterAll(async () => {
      if (originalCronSecret === undefined) {
        delete process.env.CRON_SECRET
      } else {
        process.env.CRON_SECRET = originalCronSecret
      }

      // DB cleanup in dependency order
      await cleanupTestData()
      await prisma.tenantImapConfig
        .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
        .catch(() => {})
      await prisma.numberSequence
        .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
        .catch(() => {})
      await prisma.crmAddress
        .deleteMany({ where: { tenantId: TEST_TENANT_ID } })
        .catch(() => {})
      await prisma.tenant
        .deleteMany({ where: { id: TEST_TENANT_ID } })
        .catch(() => {})
    })

    beforeEach(async () => {
      await clearMailbox()
      await cleanupTestData()
      await resetImapPollState()
    })

    // ---------------------------------------------------------------
    // Test 1: Plain PDF without ZUGFeRD
    // ---------------------------------------------------------------
    it("processes plain PDF without ZUGFeRD", async () => {
      const plainPdf = await createPlainPdf()
      await sendTestMail({
        subject: "Invoice from Supplier A",
        attachments: [{ filename: "invoice.pdf", content: plainPdf }],
      })

      const response = await triggerCron()
      const body = await response.json()
      expect(body.ok).toBe(true)
      expect(body.processed).toBeGreaterThanOrEqual(1)

      // Email log: at least 1 entry for our test tenant, status processed
      const logs = await prisma.inboundEmailLog.findMany({
        where: { tenantId: TEST_TENANT_ID },
      })
      expect(logs.length).toBeGreaterThanOrEqual(1)
      expect(logs[0]!.status).toBe("processed")

      // Invoice: source = imap, no ZUGFeRD, PDF path set
      const invoices = await prisma.inboundInvoice.findMany({
        where: { tenantId: TEST_TENANT_ID },
      })
      expect(invoices).toHaveLength(1)
      expect(invoices[0]!.source).toBe("imap")
      expect(invoices[0]!.zugferdProfile).toBeNull()
      expect(invoices[0]!.pdfStoragePath).toBeTruthy()

      // No line items for plain PDF
      const lineItems = await prisma.inboundInvoiceLineItem.findMany({
        where: { invoiceId: invoices[0]!.id },
      })
      expect(lineItems).toHaveLength(0)
    }, 30_000)

    // ---------------------------------------------------------------
    // Test 2: ZUGFeRD EN16931 PDF → fields pre-filled + line items
    // ---------------------------------------------------------------
    it("parses ZUGFeRD EN16931 PDF and pre-fills fields", async () => {
      const zugferdPdf = loadFixture("EN16931_Einfach.pdf")
      await sendTestMail({
        subject: "ZUGFeRD Rechnung",
        attachments: [{ filename: "rechnung.pdf", content: zugferdPdf }],
      })

      const response = await triggerCron()
      const body = await response.json()
      expect(body.ok).toBe(true)
      expect(body.processed).toBe(1)

      const invoices = await prisma.inboundInvoice.findMany({
        where: { tenantId: TEST_TENANT_ID },
      })
      expect(invoices).toHaveLength(1)

      const inv = invoices[0]!
      expect(inv.source).toBe("zugferd")
      expect(inv.zugferdProfile).toBe("EN16931")
      expect(inv.invoiceNumber).toBe("471102")
      expect(Number(inv.totalGross)).toBeCloseTo(529.87, 2)
      expect(inv.sellerVatId).toBe("DE123456789")
      expect(inv.sellerName).toBe("Lieferant GmbH")

      // Line items created from ZUGFeRD XML
      const lineItems = await prisma.inboundInvoiceLineItem.findMany({
        where: { invoiceId: inv.id },
        orderBy: { position: "asc" },
      })
      expect(lineItems.length).toBeGreaterThanOrEqual(1)
    }, 30_000)

    // ---------------------------------------------------------------
    // Test 3: Plain-text email without attachments → skipped
    // ---------------------------------------------------------------
    it("skips plain-text email without attachments", async () => {
      await sendTestMail({
        subject: "Just a question",
        text: "Hi, do you have the invoice?",
      })

      const response = await triggerCron()
      const body = await response.json()
      expect(body.ok).toBe(true)
      expect(body.skipped).toBe(1)

      // Email log: skipped_no_attachment
      const logs = await prisma.inboundEmailLog.findMany({
        where: { tenantId: TEST_TENANT_ID },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0]!.status).toBe("skipped_no_attachment")

      // No invoice created
      const invoices = await prisma.inboundInvoice.count({
        where: { tenantId: TEST_TENANT_ID },
      })
      expect(invoices).toBe(0)
    }, 30_000)

    // ---------------------------------------------------------------
    // Test 4: Dedup via Message-ID
    // ---------------------------------------------------------------
    it("deduplicates by Message-ID across polls", async () => {
      const zugferdPdf = loadFixture("EN16931_Einfach.pdf")
      const fixedMessageId = "<dedup-test-001@example.com>"

      // First send + poll → 1 invoice created
      await sendTestMail({
        subject: "Rechnung #1",
        messageId: fixedMessageId,
        attachments: [{ filename: "rechnung.pdf", content: zugferdPdf }],
      })
      await triggerCron()

      const countAfterFirst = await prisma.inboundInvoice.count({
        where: { tenantId: TEST_TENANT_ID },
      })
      expect(countAfterFirst).toBe(1)

      // Second send with same Message-ID + poll → skipped
      await sendTestMail({
        subject: "Rechnung #1 (resend)",
        messageId: fixedMessageId,
        attachments: [{ filename: "rechnung.pdf", content: zugferdPdf }],
      })
      await triggerCron()

      // Invoice count unchanged
      const countAfterSecond = await prisma.inboundInvoice.count({
        where: { tenantId: TEST_TENANT_ID },
      })
      expect(countAfterSecond).toBe(1)
    }, 60_000)

    // ---------------------------------------------------------------
    // Test 5: Attachment too large (> 20 MB)
    // ---------------------------------------------------------------
    it("rejects attachment larger than 20 MB", async () => {
      // 21 MB dummy with PDF header — enough to trigger the size guard
      const oversized = Buffer.alloc(21 * 1024 * 1024, 0)
      oversized.write("%PDF-1.4", 0)

      await sendTestMail({
        subject: "Huge invoice",
        attachments: [{ filename: "huge.pdf", content: oversized }],
      })

      const response = await triggerCron()
      const body = await response.json()
      expect(body.ok).toBe(true)

      // Email log: failed with size error
      const logs = await prisma.inboundEmailLog.findMany({
        where: { tenantId: TEST_TENANT_ID },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0]!.status).toBe("failed")
      expect(logs[0]!.errorMessage).toContain("too_large")

      // No invoice created
      const invoices = await prisma.inboundInvoice.count({
        where: { tenantId: TEST_TENANT_ID },
      })
      expect(invoices).toBe(0)
    }, 120_000)

    // ---------------------------------------------------------------
    // Test 6: Supplier matched by VAT ID
    // ---------------------------------------------------------------
    it("matches supplier by VAT ID from ZUGFeRD data", async () => {
      // Create CRM supplier with the VAT ID from EN16931_Einfach.pdf
      await prisma.crmAddress.create({
        data: {
          tenantId: TEST_TENANT_ID,
          number: "LF-INT-001",
          company: "Test Lieferant GmbH",
          type: "SUPPLIER",
          isActive: true,
          vatId: "DE123456789", // matches EN16931_Einfach.pdf sellerVatId
        },
      })

      const zugferdPdf = loadFixture("EN16931_Einfach.pdf")
      await sendTestMail({
        subject: "Rechnung mit Lieferant-Match",
        attachments: [{ filename: "rechnung.pdf", content: zugferdPdf }],
      })

      const response = await triggerCron()
      const body = await response.json()
      expect(body.ok).toBe(true)
      expect(body.processed).toBe(1)

      const invoices = await prisma.inboundInvoice.findMany({
        where: { tenantId: TEST_TENANT_ID },
      })
      expect(invoices).toHaveLength(1)
      expect(invoices[0]!.supplierId).not.toBeNull()
      expect(invoices[0]!.supplierStatus).toBe("matched")
    }, 30_000)
  }
)
