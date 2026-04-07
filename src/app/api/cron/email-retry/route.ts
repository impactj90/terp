/**
 * Vercel Cron Route: /api/cron/email-retry
 *
 * Runs every 5 minutes (configured in vercel.json).
 * Retries failed/pending email sends with exponential backoff.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as sendLogRepo from "@/lib/services/email-send-log-repository"
import * as smtpConfigService from "@/lib/services/email-smtp-config-service"
import { download } from "@/lib/supabase/storage"
import { getNextRetryAt } from "@/lib/services/email-send-service"

export const runtime = "nodejs"
export const maxDuration = 300

const MAX_RETRIES = 3

export async function GET(request: Request) {
  // 1. Validate CRON_SECRET
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[email-retry] Starting cron job")

  try {
    // 2. Find retryable records
    const records = await sendLogRepo.findRetryable(prisma, 50)
    console.log(`[email-retry] Found ${records.length} retryable records`)

    let succeeded = 0
    let failed = 0
    let skipped = 0

    // 3. Process each record
    for (const record of records) {
      try {
        // Load tenant SMTP config
        const smtpConfig = await smtpConfigService.get(prisma, record.tenantId)
        if (!smtpConfig) {
          await sendLogRepo.markFailed(
            prisma,
            record.id,
            "SMTP not configured for tenant"
          )
          failed++
          continue
        }

        // Build transporter
        const transporter = smtpConfigService.createTransporter(smtpConfig)
        const from = smtpConfig.fromName
          ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`
          : smtpConfig.fromEmail

        // Build attachments — re-download PDF from storage
        const attachments: Array<{
          filename: string
          content: Buffer
          contentType: string
        }> = []

        if (record.documentId && record.documentType) {
          // Determine PDF storage path based on document type
          let pdfPath: string | null = null

          if (record.documentType === "PURCHASE_ORDER") {
            // For POs, we need to look up the order to reconstruct the path
            const order = await prisma.whPurchaseOrder.findFirst({
              where: { id: record.documentId, tenantId: record.tenantId },
              include: { supplier: { select: { company: true } } },
            })
            if (order) {
              const companyPart = order.supplier?.company
                ? `_${order.supplier.company}`
                : ""
              const raw = `${order.number}${companyPart}`
              const sanitized = raw
                .replace(
                  /[äöüßÄÖÜ]/g,
                  (ch) =>
                    ({
                      ä: "ae",
                      ö: "oe",
                      ü: "ue",
                      ß: "ss",
                      Ä: "Ae",
                      Ö: "Oe",
                      Ü: "Ue",
                    })[ch] ?? ch
                )
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-zA-Z0-9._-]+/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_|_$/g, "")
              pdfPath = `bestellung/${sanitized}.pdf`
            }
          } else {
            // Billing documents store pdfUrl directly
            const doc = await prisma.billingDocument.findFirst({
              where: { id: record.documentId, tenantId: record.tenantId },
              select: { pdfUrl: true, number: true },
            })
            pdfPath = doc?.pdfUrl ?? null
          }

          if (pdfPath) {
            const pdfBlob = await download("documents", pdfPath)
            if (pdfBlob) {
              attachments.push({
                filename: pdfPath.split("/").pop() ?? "document.pdf",
                content: Buffer.from(await pdfBlob.arrayBuffer()),
                contentType: "application/pdf",
              })
            } else {
              await sendLogRepo.markFailed(
                prisma,
                record.id,
                "PDF no longer available in storage"
              )
              failed++
              continue
            }
          }
        }

        // Send email
        await transporter.sendMail({
          from,
          to: record.toEmail,
          cc: record.ccEmails?.join(", ") || undefined,
          replyTo: smtpConfig.replyToEmail ?? undefined,
          subject: record.subject,
          html: record.bodyHtml,
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        })

        await sendLogRepo.markSent(prisma, record.id)
        succeeded++
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error"
        console.error(
          `[email-retry] Failed for record ${record.id}:`,
          errorMessage
        )

        if (record.retryCount < MAX_RETRIES) {
          await sendLogRepo.markRetrying(
            prisma,
            record.id,
            record.retryCount + 1,
            getNextRetryAt(record.retryCount)
          )
        } else {
          await sendLogRepo.markFailed(prisma, record.id, errorMessage)
        }
        failed++
      }
    }

    console.log(
      `[email-retry] Complete: ${records.length} processed, ${succeeded} succeeded, ${failed} failed, ${skipped} skipped`
    )

    return NextResponse.json({
      ok: true,
      processed: records.length,
      succeeded,
      failed,
      skipped,
    })
  } catch (err) {
    console.error("[email-retry] Fatal error:", err)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
