/**
 * Shared QR code helpers.
 *
 * Payload format: `TERP:<TYPE>:<first 6 chars of tenantId>:<entity number>`
 * Types currently in use: `ART` (warehouse articles), `SO` (service objects).
 *
 * Plan: 2026-04-21-serviceobjekte-stammdaten.md — Phase C extraction.
 */
import QRCode from "qrcode"

export type QrEntityType = "ART" | "SO"

export function buildQrContent(
  entityType: QrEntityType,
  tenantId: string,
  number: string
): string {
  return `TERP:${entityType}:${tenantId.substring(0, 6)}:${number}`
}

export async function generateQrDataUrl(
  content: string,
  size?: number
): Promise<string> {
  return QRCode.toDataURL(content, { width: size ?? 150, margin: 1 })
}
