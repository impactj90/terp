/**
 * ServiceObject QR Service
 *
 * QR code resolution, generation, and label PDF orchestration for
 * ServiceObjects. Payload format: `TERP:SO:{tenantId-short}:{number}`.
 *
 * Plan: 2026-04-21-serviceobjekte-stammdaten.md — Phase C.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { renderToBuffer } from "@react-pdf/renderer"
import * as storage from "@/lib/supabase/storage"
import React from "react"
import { QrLabelPdf, type LabelFormat } from "@/lib/pdf/qr-label-pdf"
import { buildQrContent, generateQrDataUrl } from "./qr-utils"

// --- Error Classes ---

export class ServiceObjectQrValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServiceObjectQrValidationError"
  }
}

export class ServiceObjectQrNotFoundError extends Error {
  constructor(message = "Service object not found") {
    super(message)
    this.name = "ServiceObjectQrNotFoundError"
  }
}

export class ServiceObjectQrForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServiceObjectQrForbiddenError"
  }
}

// --- Constants ---

const QR_CODE_REGEX = /^TERP:SO:([a-f0-9]{6}):(.+)$/
const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 300 // 5 minutes

// --- Pure Helpers ---

export function buildServiceObjectQrContent(
  tenantId: string,
  number: string
): string {
  return buildQrContent("SO", tenantId, number)
}

// --- DB-backed Functions ---

export async function resolveServiceObjectQrCode(
  prisma: PrismaClient,
  tenantId: string,
  rawCode: string
) {
  const match = rawCode.match(QR_CODE_REGEX)
  if (!match) {
    throw new ServiceObjectQrValidationError("Ungültiger QR-Code-Format")
  }

  const tenantShort = match[1]!
  const number = match[2]!

  if (!tenantId.startsWith(tenantShort)) {
    throw new ServiceObjectQrForbiddenError(
      "QR-Code gehört zu einem anderen Mandanten"
    )
  }

  const obj = await prisma.serviceObject.findFirst({
    where: { tenantId, number, isActive: true },
    select: {
      id: true,
      number: true,
      name: true,
      kind: true,
      status: true,
      customerAddress: {
        select: { id: true, company: true, number: true },
      },
    },
  })

  if (!obj) {
    throw new ServiceObjectQrNotFoundError()
  }

  return {
    serviceObjectId: obj.id,
    redirectUrl: `/serviceobjects/${obj.id}`,
    serviceObject: obj,
  }
}

export async function resolveServiceObjectByNumber(
  prisma: PrismaClient,
  tenantId: string,
  number: string
) {
  const obj = await prisma.serviceObject.findFirst({
    where: { tenantId, number, isActive: true },
    select: {
      id: true,
      number: true,
      name: true,
      kind: true,
      status: true,
      customerAddress: { select: { id: true, company: true } },
    },
  })
  if (!obj) {
    throw new ServiceObjectQrNotFoundError()
  }
  return obj
}

export async function generateServiceObjectQrDataUrl(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const obj = await prisma.serviceObject.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      number: true,
      name: true,
      kind: true,
      status: true,
      customerAddress: { select: { id: true, company: true, number: true } },
    },
  })
  if (!obj) {
    throw new ServiceObjectQrNotFoundError()
  }

  const content = buildServiceObjectQrContent(tenantId, obj.number)
  const dataUrl = await generateQrDataUrl(content)

  return { dataUrl, content, serviceObject: obj }
}

export async function generateServiceObjectLabelPdf(
  prisma: PrismaClient,
  tenantId: string,
  ids: string[],
  format: LabelFormat
) {
  const objects = await prisma.serviceObject.findMany({
    where: { tenantId, id: { in: ids }, isActive: true },
    select: {
      id: true,
      number: true,
      name: true,
      customerAddress: { select: { company: true } },
    },
    orderBy: { number: "asc" },
  })

  if (objects.length === 0) {
    throw new ServiceObjectQrNotFoundError("Keine Serviceobjekte gefunden")
  }

  const labels = await Promise.all(
    objects.map(async (obj) => {
      const content = buildServiceObjectQrContent(tenantId, obj.number)
      const qrDataUrl = await generateQrDataUrl(content)
      const truncated =
        obj.name.length > 30 ? `${obj.name.slice(0, 27)}...` : obj.name
      return {
        qrDataUrl,
        articleNumber: obj.number,
        articleName: truncated,
        unit: obj.customerAddress?.company ?? "",
      }
    })
  )

  const pdfElement = React.createElement(QrLabelPdf, { labels, format })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(pdfElement as any)

  const timestamp = Date.now()
  const storagePath = `qr-labels/so_etiketten_${timestamp}.pdf`

  try {
    await storage.upload(BUCKET, storagePath, Buffer.from(buffer), {
      contentType: "application/pdf",
      upsert: true,
    })
  } catch (err) {
    throw new ServiceObjectQrValidationError(
      `PDF upload failed: ${err instanceof Error ? err.message : "unknown"}`
    )
  }

  const signedUrl = await storage.createSignedReadUrl(
    BUCKET,
    storagePath,
    SIGNED_URL_EXPIRY_SECONDS
  )
  if (!signedUrl) {
    throw new ServiceObjectQrValidationError("Failed to create signed URL")
  }

  return {
    signedUrl,
    filename: `Serviceobjekt-Etiketten_${objects.length}.pdf`,
  }
}
