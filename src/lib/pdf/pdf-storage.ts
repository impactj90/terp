import type { BillingDocumentType } from "@/generated/prisma/client"

const DOCUMENT_TYPE_PATHS: Record<BillingDocumentType, string> = {
  OFFER: "angebot",
  ORDER_CONFIRMATION: "auftragsbestaetigung",
  DELIVERY_NOTE: "lieferschein",
  SERVICE_NOTE: "serviceschein",
  RETURN_DELIVERY: "ruecklieferschein",
  INVOICE: "rechnung",
  CREDIT_NOTE: "gutschrift",
}

const UMLAUT_MAP: Record<string, string> = {
  "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
  "Ä": "Ae", "Ö": "Oe", "Ü": "Ue",
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[äöüßÄÖÜ]/g, (ch) => UMLAUT_MAP[ch] ?? ch)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip remaining accents
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

export function getStoragePath(doc: {
  type: BillingDocumentType
  tenantId: string
  id: string
  number?: string
  company?: string | null
}): string {
  const parts = [doc.number ?? doc.id, doc.company].filter(Boolean) as string[]
  return `${DOCUMENT_TYPE_PATHS[doc.type]}/${sanitizeFilename(parts.join("_"))}.pdf`
}

export function getXmlStoragePath(doc: {
  type: BillingDocumentType
  tenantId: string
  id: string
  number?: string
  company?: string | null
}): string {
  const parts = [doc.number ?? doc.id, doc.company].filter(Boolean) as string[]
  return `${DOCUMENT_TYPE_PATHS[doc.type]}/${sanitizeFilename(parts.join("_"))}.xml`
}
