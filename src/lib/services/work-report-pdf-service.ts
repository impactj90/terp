/**
 * WorkReport PDF Service
 *
 * Rendering and storage pipeline for Arbeitsschein-PDFs.
 *
 * Three access patterns:
 *   - DRAFT records: every download re-renders fresh (work is still in
 *     flight, so there's no archive to reference).
 *   - SIGNED records: one-time render-and-persist at sign time (Phase 6)
 *     stores the legally-binding PDF. Downloads return a signed URL onto
 *     that archived blob. Fresh fallback exists in case the sign-time
 *     render failed (best-effort) but gets logged loudly.
 *   - VOID records: fresh render with the diagonal "STORNIERT" overlay
 *     on top of the preserved signed signature (Phase 7).
 *
 * Storage convention: `arbeitsscheine/{tenantId}/{workReportId}.pdf`
 * inside the shared `documents` bucket, analogous to
 * `reminders/{tenantId}/{reminderId}.pdf`.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 5)
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"

import { WorkReportPdf, type WorkReportPdfProps } from "@/lib/pdf/work-report-pdf"
import * as storage from "@/lib/supabase/storage"
import * as workReportRepo from "./work-report-repository"
import { WorkReportNotFoundError } from "./work-report-service"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"

// --- Error Classes ---

export class WorkReportPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkReportPdfError"
  }
}

// --- Constants ---

const BUCKET = "documents"
const SIGNATURE_BUCKET = "workreport-signatures"
const SIGNED_URL_EXPIRY_SECONDS = 300 // 5 minutes
const VOIDED_URL_EXPIRY_SECONDS = 60 // shorter — always re-rendered

// --- Path Helpers ---

export function storagePathFor(tenantId: string, workReportId: string): string {
  return `arbeitsscheine/${tenantId}/${workReportId}.pdf`
}

function voidedStoragePathFor(tenantId: string, workReportId: string): string {
  return `arbeitsscheine/${tenantId}/${workReportId}.voided.pdf`
}

function filenameFor(code: string): string {
  return `${code.replace(/[/\\]/g, "_")}.pdf`
}

// --- Internal: Prop assembly + rendering ---

/**
 * Downloads a signature PNG from the private signature bucket and
 * returns it as a base64 data URL suitable for `<Image src=...>` inside
 * `@react-pdf/renderer`.
 *
 * Returns null when the WorkReport has no signature path or the blob
 * cannot be retrieved. A missing signature must not crash the PDF render
 * because SIGNED/VOID records with a best-effort upload failure still
 * need a downloadable artifact (showing the signature block empty is
 * preferable to a 500 on download).
 */
async function loadSignatureDataUrl(
  signaturePath: string | null,
): Promise<string | null> {
  if (!signaturePath) return null

  const blob = await storage.download(SIGNATURE_BUCKET, signaturePath)
  if (!blob) return null

  const arrayBuffer = await blob.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString("base64")
  return `data:image/png;base64,${base64}`
}

/**
 * Loads the WorkReport with standard includes plus the BillingTenantConfig
 * for letterhead, and optionally the signature PNG (for SIGNED/VOID).
 * Returns the full props passed to `<WorkReportPdf>`.
 */
async function buildPdfProps(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
  options?: { forceVoidOverlay?: boolean },
): Promise<WorkReportPdfProps> {
  const report = await workReportRepo.findById(prisma, tenantId, workReportId)
  if (!report) {
    throw new WorkReportNotFoundError()
  }

  const tenantConfig = await billingTenantConfigRepo.findByTenantId(
    prisma,
    tenantId,
  )

  // Signature PNG is only visually relevant when the document is SIGNED
  // or when we render a VOID overlay on top of a previously-signed one.
  const signatureDataUrl =
    report.status === "SIGNED" || report.status === "VOID"
      ? await loadSignatureDataUrl(report.signaturePath)
      : null

  const status = options?.forceVoidOverlay ? "VOID" : report.status

  return {
    report: {
      code: report.code,
      visitDate: report.visitDate,
      travelMinutes: report.travelMinutes,
      workDescription: report.workDescription,
      status,
      signedAt: report.signedAt,
      signerName: report.signerName,
      signerRole: report.signerRole,
      signerIpHash: report.signerIpHash,
      voidedAt: report.voidedAt,
      voidReason: report.voidReason,
    },
    order: report.order
      ? {
          code: report.order.code,
          name: report.order.name,
          customer: report.order.customer ?? null,
        }
      : null,
    serviceObject: report.serviceObject
      ? {
          number: report.serviceObject.number,
          name: report.serviceObject.name,
          kind: report.serviceObject.kind,
        }
      : null,
    assignments: (report.assignments ?? []).map((a) => ({
      firstName: a.employee.firstName,
      lastName: a.employee.lastName,
      personnelNumber: a.employee.personnelNumber ?? null,
      role: a.role ?? null,
    })),
    signatureDataUrl,
    tenantConfig,
  }
}

async function render(props: WorkReportPdfProps): Promise<Buffer> {
  const element = React.createElement(WorkReportPdf, props)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any)
  return Buffer.from(buffer)
}

// --- Public API ---

/**
 * Renders the PDF fresh and returns a short-lived signed URL. Used for
 * DRAFT previews and as a fallback for SIGNED records whose sign-time
 * render failed (best-effort). The rendered buffer is uploaded to the
 * canonical storage path (upsert) so a subsequent signed-URL lookup
 * finds it.
 */
export async function generateAndGetDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
): Promise<{ signedUrl: string; filename: string }> {
  const props = await buildPdfProps(prisma, tenantId, workReportId)
  const buffer = await render(props)

  const path = storagePathFor(tenantId, workReportId)

  try {
    await storage.upload(BUCKET, path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    })
  } catch (err) {
    throw new WorkReportPdfError(
      `PDF upload failed: ${err instanceof Error ? err.message : "unknown"}`,
    )
  }

  const signedUrl = await storage.createSignedReadUrl(
    BUCKET,
    path,
    SIGNED_URL_EXPIRY_SECONDS,
  )
  if (!signedUrl) {
    throw new WorkReportPdfError("Failed to create signed URL")
  }

  return {
    signedUrl,
    filename: filenameFor(props.report.code),
  }
}

/**
 * Returns a short-lived signed URL pointing at the persisted PDF
 * archive. Null when the PDF has not been generated yet (e.g. SIGNED
 * record where the best-effort PDF write at sign-time failed).
 *
 * Callers (like `downloadPdf`) fall back to `generateAndGetDownloadUrl`
 * in that case so the operator always gets a working link.
 */
export async function getPersistedDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
): Promise<{ signedUrl: string; filename: string } | null> {
  const report = await workReportRepo.findByIdSimple(prisma, tenantId, workReportId)
  if (!report) {
    throw new WorkReportNotFoundError()
  }

  const path = storagePathFor(tenantId, workReportId)
  const signedUrl = await storage.createSignedReadUrl(
    BUCKET,
    path,
    SIGNED_URL_EXPIRY_SECONDS,
  )
  if (!signedUrl) return null

  return {
    signedUrl,
    filename: filenameFor(report.code),
  }
}

/**
 * Renders the signed PDF once at sign-time and persists it under the
 * canonical storage path. Returns the storage path so the caller can
 * write it back to `WorkReport.pdfUrl`.
 *
 * Phase 6 wires this into the `sign()` lifecycle. Until then, the
 * function is exported for use by backfill tooling or ad-hoc tests.
 */
export async function generateSignedAndStore(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
): Promise<{ storagePath: string }> {
  const props = await buildPdfProps(prisma, tenantId, workReportId)
  const buffer = await render(props)

  const path = storagePathFor(tenantId, workReportId)

  try {
    await storage.upload(BUCKET, path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    })
  } catch (err) {
    throw new WorkReportPdfError(
      `Signed PDF upload failed: ${err instanceof Error ? err.message : "unknown"}`,
    )
  }

  return { storagePath: path }
}

/**
 * Renders a fresh PDF with the VOID diagonal overlay on top of the
 * preserved signed content. The archived SIGNED-PDF stays untouched at
 * the canonical path; the overlay is written to a side-channel path
 * (`.voided.pdf`) so the two remain distinguishable.
 *
 * Phase 7 wires this into the VOID lifecycle.
 */
export async function generateVoidedOverlay(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
): Promise<{ signedUrl: string; filename: string }> {
  const props = await buildPdfProps(prisma, tenantId, workReportId, {
    forceVoidOverlay: true,
  })
  const buffer = await render(props)

  const path = voidedStoragePathFor(tenantId, workReportId)

  try {
    await storage.upload(BUCKET, path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    })
  } catch (err) {
    throw new WorkReportPdfError(
      `VOID overlay PDF upload failed: ${err instanceof Error ? err.message : "unknown"}`,
    )
  }

  const signedUrl = await storage.createSignedReadUrl(
    BUCKET,
    path,
    VOIDED_URL_EXPIRY_SECONDS,
  )
  if (!signedUrl) {
    throw new WorkReportPdfError("Failed to create signed URL for VOID overlay")
  }

  return {
    signedUrl,
    filename: filenameFor(`${props.report.code}_STORNIERT`),
  }
}
