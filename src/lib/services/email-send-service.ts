import type { PrismaClient } from "@/generated/prisma/client"
import * as smtpConfigService from "./email-smtp-config-service"
import { SmtpNotConfiguredError } from "./email-smtp-config-service"
import * as emailTemplateService from "./email-template-service"
import * as sendLogRepo from "./email-send-log-repository"
import * as defaultAttachmentRepo from "./email-default-attachment-repository"
import * as auditLog from "./audit-logs-service"
import {
  buildBillingDocumentEmailData,
  buildPurchaseOrderEmailData,
  type DocumentEmailData,
} from "./email-document-context"
import { resolvePlaceholders, type PlaceholderContext } from "./email-placeholder-resolver"
import { renderBaseEmail } from "@/lib/email/templates/base-document-email"
import { download } from "@/lib/supabase/storage"

// --- Error Classes ---

export class DocumentPdfNotFoundError extends Error {
  constructor(message = "Document PDF not found") {
    super(message)
    this.name = "DocumentPdfNotFoundError"
  }
}

// --- Retry Backoff ---

const RETRY_DELAYS = [60_000, 300_000, 900_000] // 1min, 5min, 15min
const MAX_RETRIES = 3

export function getNextRetryAt(retryCount: number): Date {
  const delay = RETRY_DELAYS[retryCount] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]!
  return new Date(Date.now() + delay)
}

// --- Helper: Build document email data ---

async function getDocumentData(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  documentType: string
): Promise<DocumentEmailData> {
  if (documentType === "PURCHASE_ORDER") {
    return buildPurchaseOrderEmailData(prisma, tenantId, documentId)
  }
  return buildBillingDocumentEmailData(prisma, tenantId, documentId)
}

function buildPlaceholderContext(
  data: DocumentEmailData
): PlaceholderContext {
  return {
    kundenname: data.recipientName ?? undefined,
    anrede: data.salutation ?? undefined,
    dokumentennummer: data.documentNumber,
    betrag: data.grossAmount ?? undefined,
    faelligkeitsdatum: data.dueDate ?? undefined,
    firmenname: data.tenantCompanyName,
    projektname: data.projectName ?? undefined,
  }
}

// --- Service Functions ---

export interface SendInput {
  documentId: string
  documentType: string
  to: string
  cc?: string[]
  templateId?: string
  subject: string
  bodyHtml: string
  attachDefaults?: boolean
}

export async function send(
  prisma: PrismaClient,
  tenantId: string,
  input: SendInput,
  sentBy: string
): Promise<{ success: boolean; logId: string }> {
  // 1. Load SMTP config
  const smtpConfig = await smtpConfigService.get(prisma, tenantId)
  if (!smtpConfig) throw new SmtpNotConfiguredError()

  // 2. Get document data for PDF
  const docData = await getDocumentData(
    prisma,
    tenantId,
    input.documentId,
    input.documentType
  )

  // 3. Fetch document PDF from storage
  if (!docData.pdfStoragePath) {
    throw new DocumentPdfNotFoundError("Document has no PDF")
  }
  const pdfBlob = await download("documents", docData.pdfStoragePath)
  if (!pdfBlob) {
    throw new DocumentPdfNotFoundError("PDF file not found in storage")
  }
  const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer())
  const pdfFileName = `${docData.documentNumber.replace(/[/\\]/g, "_")}.pdf`

  // 4. Render HTML with base email wrapper
  const renderedHtml = renderBaseEmail({
    bodyHtml: input.bodyHtml,
    companyName: docData.tenantCompanyName,
  })

  // 5. Build attachments
  const attachments: Array<{
    filename: string
    content: Buffer
    contentType: string
  }> = [{ filename: pdfFileName, content: pdfBuffer, contentType: "application/pdf" }]

  // Fetch default attachments
  if (input.attachDefaults !== false) {
    const defaults = await defaultAttachmentRepo.findMany(
      prisma,
      tenantId,
      input.documentType
    )
    for (const att of defaults) {
      const blob = await download(att.storageBucket, att.filePath)
      if (blob) {
        attachments.push({
          filename: att.fileName,
          content: Buffer.from(await blob.arrayBuffer()),
          contentType: "application/pdf",
        })
      }
    }
  }

  // 6. Create send log entry
  const logEntry = await sendLogRepo.create(prisma, tenantId, {
    documentId: input.documentId,
    documentType: input.documentType,
    toEmail: input.to,
    ccEmails: input.cc,
    subject: input.subject,
    bodyHtml: input.bodyHtml,
    templateId: input.templateId,
    status: "pending",
    sentBy,
  })

  // 7. Create transport and send
  const transporter = smtpConfigService.createTransporter(smtpConfig)
  const from = smtpConfig.fromName
    ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`
    : smtpConfig.fromEmail

  try {
    await transporter.sendMail({
      from,
      to: input.to,
      cc: input.cc?.join(", "),
      replyTo: smtpConfig.replyToEmail ?? undefined,
      subject: input.subject,
      html: renderedHtml,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    })

    await sendLogRepo.markSent(prisma, logEntry.id)

    await auditLog.log(prisma, {
      tenantId,
      userId: sentBy,
      action: "email_sent",
      entityType: input.documentType === "PURCHASE_ORDER" ? "purchase_order" : "billing_document",
      entityId: input.documentId,
      metadata: {
        to: input.to,
        cc: input.cc ?? [],
        subject: input.subject,
        logId: logEntry.id,
      },
    })

    return { success: true, logId: logEntry.id }
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown SMTP error"

    if (logEntry.retryCount < MAX_RETRIES) {
      await sendLogRepo.markRetrying(
        prisma,
        logEntry.id,
        logEntry.retryCount + 1,
        getNextRetryAt(logEntry.retryCount)
      )
    } else {
      await sendLogRepo.markFailed(prisma, logEntry.id, errorMessage)
    }

    await auditLog.log(prisma, {
      tenantId,
      userId: sentBy,
      action: "email_failed",
      entityType: input.documentType === "PURCHASE_ORDER" ? "purchase_order" : "billing_document",
      entityId: input.documentId,
      metadata: {
        to: input.to,
        error: errorMessage,
        logId: logEntry.id,
      },
    })

    return { success: false, logId: logEntry.id }
  }
}

export async function getDocumentEmailContext(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  documentType: string
) {
  // Check SMTP
  const smtpConfig = await smtpConfigService.get(prisma, tenantId)

  // Get document data
  const docData = await getDocumentData(
    prisma,
    tenantId,
    documentId,
    documentType
  )

  // Get default template
  const template = await emailTemplateService.getDefault(
    prisma,
    tenantId,
    documentType
  )

  // Resolve placeholders
  const ctx = buildPlaceholderContext(docData)
  const subject = template
    ? resolvePlaceholders(template.subject, ctx)
    : ""
  const bodyHtml = template
    ? resolvePlaceholders(template.bodyHtml, ctx)
    : ""

  // Get default attachments
  const defaultAttachments = await defaultAttachmentRepo.findMany(
    prisma,
    tenantId,
    documentType
  )

  const pdfFileName = docData.pdfStoragePath
    ? `${docData.documentNumber.replace(/[/\\]/g, "_")}.pdf`
    : null

  return {
    recipient: docData.recipientEmail,
    recipientName: docData.recipientName,
    subject,
    bodyHtml,
    pdfFileName,
    templateId: template?.id ?? null,
    defaultAttachments: defaultAttachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      documentType: a.documentType,
    })),
    canSend: !!smtpConfig && !!docData.pdfStoragePath,
    smtpConfigured: !!smtpConfig,
  }
}

export async function getSendLog(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  pagination?: { page: number; pageSize: number }
) {
  return sendLogRepo.findByDocumentId(prisma, tenantId, documentId, pagination)
}
