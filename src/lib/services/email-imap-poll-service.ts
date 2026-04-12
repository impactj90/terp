import type { PrismaClient } from "@/generated/prisma/client"
import type { TenantImapConfig } from "@/generated/prisma/client"
import type { FetchMessageObject } from "imapflow"
import { simpleParser } from "mailparser"
import type { Attachment } from "mailparser"
import { createImapClient } from "./email-imap-config-service"
import * as imapConfigRepo from "./email-imap-config-repository"
import * as emailLogRepo from "./inbound-email-log-repository"
import * as numberSequenceService from "./number-sequence-service"
import { parsePdfForZugferd } from "./zugferd-parser-service"
import { matchSupplier } from "./inbound-invoice-supplier-matcher"
import { upload } from "@/lib/supabase/storage"
import type { ParsedInvoice } from "./zugferd-xml-parser"

export interface PollResult {
  processed: number
  skipped: number
  failed: number
  errors: string[]
}

const MAX_MESSAGES_PER_POLL = 50
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024 // 20 MB

/**
 * Poll a single tenant's IMAP inbox for new messages.
 * Extracts PDF/XML attachments, parses ZUGFeRD, matches suppliers,
 * creates draft InboundInvoice records.
 */
export async function pollInbox(
  prisma: PrismaClient,
  config: TenantImapConfig
): Promise<PollResult> {
  const result: PollResult = { processed: 0, skipped: 0, failed: 0, errors: [] }
  const client = createImapClient(config)

  try {
    await client.connect()
    const lock = await client.getMailboxLock(config.mailbox)

    try {
      const mb = client.mailbox
      if (!mb || typeof mb !== "object") {
        result.errors.push("Could not open mailbox")
        return result
      }

      // Check uidValidity — reset state if changed
      const currentUidValidity = mb.uidValidity ? BigInt(mb.uidValidity) : null
      if (config.uidValidity && currentUidValidity && currentUidValidity !== config.uidValidity) {
        // UID validity changed — IMAP mailbox was reconstructed, reset state
        await imapConfigRepo.updatePollState(prisma, config.id, {
          uidValidity: currentUidValidity,
          uidNext: null,
        })
      }

      // Determine fetch range
      const fetchFrom = config.uidNext ? `${config.uidNext}:*` : "1:*"
      let messageCount = 0

      for await (const message of client.fetch(fetchFrom, {
        uid: true,
        envelope: true,
        source: true,
      })) {
        if (messageCount >= MAX_MESSAGES_PER_POLL) break
        messageCount++

        try {
          await processMessage(prisma, config.tenantId, message, result)
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          result.errors.push(`Message UID ${message.uid}: ${errMsg}`)
          result.failed++
        }
      }

      // Update poll state
      const newUidNext = mb.uidNext
      await imapConfigRepo.updatePollState(prisma, config.id, {
        uidValidity: currentUidValidity,
        uidNext: newUidNext,
        lastPollAt: new Date(),
        lastPollError: null,
        lastPollErrorAt: null,
        consecutiveFailures: 0,
      })
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    result.errors.push(errMsg)

    // Update failure state
    await imapConfigRepo.updatePollState(prisma, config.id, {
      lastPollError: errMsg,
      lastPollErrorAt: new Date(),
      consecutiveFailures: config.consecutiveFailures + 1,
    })

    throw err
  }

  return result
}

async function processMessage(
  prisma: PrismaClient,
  tenantId: string,
  message: FetchMessageObject,
  result: PollResult
) {
  const messageId = message.envelope?.messageId ?? null
  const fromEmail = message.envelope?.from?.[0]?.address ?? null
  const subject = message.envelope?.subject ?? null

  // Dedup check
  if (messageId) {
    const existing = await emailLogRepo.findByMessageId(prisma, tenantId, messageId)
    if (existing) {
      result.skipped++
      return
    }
  }

  // Create email log entry
  const logEntry = await emailLogRepo.create(prisma, tenantId, {
    messageId,
    fromEmail,
    subject,
    uid: message.uid,
  })

  // Parse email
  if (!message.source) {
    await emailLogRepo.markFailed(prisma, logEntry.id, "No message source available")
    result.failed++
    return
  }
  const parsed = await simpleParser(message.source as Buffer)
  const attachments = parsed.attachments ?? []

  // Update attachment count
  await prisma.inboundEmailLog.update({
    where: { id: logEntry.id },
    data: { attachmentCount: attachments.length },
  })

  // Filter for PDF attachments
  const pdfAttachments = attachments.filter(
    (a: Attachment) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf")
  )
  const xmlAttachments = attachments.filter(
    (a: Attachment) => a.contentType === "text/xml" || a.contentType === "application/xml" || a.filename?.toLowerCase().endsWith(".xml")
  )

  if (pdfAttachments.length === 0 && xmlAttachments.length === 0) {
    const skipStatus = attachments.length === 0 ? "skipped_no_attachment" : "skipped_no_pdf"
    await emailLogRepo.markSkipped(prisma, logEntry.id, skipStatus as "skipped_no_attachment" | "skipped_no_pdf")
    result.skipped++
    return
  }

  // Process each PDF attachment (typically one per email)
  for (const pdfAtt of pdfAttachments) {
    // Size check
    if (pdfAtt.size && pdfAtt.size > MAX_ATTACHMENT_SIZE) {
      await emailLogRepo.markFailed(prisma, logEntry.id, "attachment_too_large")
      result.failed++
      return
    }

    const pdfBuffer = pdfAtt.content

    // Parse for ZUGFeRD
    const zugferdResult = await parsePdfForZugferd(pdfBuffer)
    const parsedInvoice = zugferdResult.parsedInvoice

    // Match supplier
    const supplierMatch = await matchSupplier(
      prisma,
      tenantId,
      parsedInvoice ?? ({} as ParsedInvoice),
      fromEmail
    )

    // Generate invoice number
    const invoiceNumber = await numberSequenceService.getNextNumber(prisma, tenantId, "inbound_invoice")

    // Create InboundInvoice
    const invoiceId = crypto.randomUUID()

    // Upload PDF to storage
    const storagePath = `${tenantId}/${invoiceId}/${pdfAtt.filename ?? "invoice.pdf"}`
    await upload("inbound-invoices", storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

    // Create invoice record
    const invoice = await prisma.inboundInvoice.create({
      data: {
        id: invoiceId,
        tenantId,
        number: invoiceNumber,
        source: zugferdResult.hasZugferd ? "zugferd" : "imap",
        sourceEmailLogId: logEntry.id,
        sourceMessageId: messageId,
        supplierId: supplierMatch.supplierId,
        supplierStatus: supplierMatch.supplierId ? "matched" : "unknown",
        invoiceNumber: parsedInvoice?.invoiceNumber ?? null,
        invoiceDate: parsedInvoice?.invoiceDate ? new Date(parsedInvoice.invoiceDate) : null,
        dueDate: parsedInvoice?.dueDate ? new Date(parsedInvoice.dueDate) : null,
        totalNet: parsedInvoice?.totalNet ?? null,
        totalVat: parsedInvoice?.totalVat ?? null,
        totalGross: parsedInvoice?.totalGross ?? null,
        currency: parsedInvoice?.currency ?? "EUR",
        paymentTermDays: parsedInvoice?.paymentTermDays ?? null,
        sellerName: parsedInvoice?.sellerName ?? null,
        sellerVatId: parsedInvoice?.sellerVatId ?? null,
        sellerTaxNumber: parsedInvoice?.sellerTaxNumber ?? null,
        sellerStreet: parsedInvoice?.sellerStreet ?? null,
        sellerZip: parsedInvoice?.sellerZip ?? null,
        sellerCity: parsedInvoice?.sellerCity ?? null,
        sellerCountry: parsedInvoice?.sellerCountry ?? null,
        sellerIban: parsedInvoice?.sellerIban ?? null,
        sellerBic: parsedInvoice?.sellerBic ?? null,
        buyerName: parsedInvoice?.buyerName ?? null,
        buyerVatId: parsedInvoice?.buyerVatId ?? null,
        buyerReference: parsedInvoice?.buyerReference ?? null,
        zugferdProfile: zugferdResult.profile ?? null,
        zugferdRawXml: zugferdResult.rawXml ?? null,
        pdfStoragePath: storagePath,
        pdfOriginalFilename: pdfAtt.filename ?? null,
        status: "DRAFT",
      },
    })

    // Create line items if ZUGFeRD
    if (parsedInvoice?.lineItems && parsedInvoice.lineItems.length > 0) {
      await prisma.inboundInvoiceLineItem.createMany({
        data: parsedInvoice.lineItems.map((li, idx) => ({
          invoiceId: invoice.id,
          position: idx + 1,
          articleNumber: li.articleNumber ?? null,
          description: li.description ?? null,
          quantity: li.quantity ?? null,
          unit: li.unit ?? null,
          unitPriceNet: li.unitPriceNet ?? null,
          totalNet: li.totalNet ?? null,
          vatRate: li.vatRate ?? null,
          vatAmount: li.vatAmount ?? null,
          totalGross: null,
          sortOrder: idx + 1,
        })),
      })
    }

    await emailLogRepo.markProcessed(prisma, logEntry.id, invoice.id)
    result.processed++
  }
}
