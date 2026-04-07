import type { PrismaClient } from "@/generated/prisma/client"
import { distance } from "fastest-levenshtein"
import type { ParsedInvoice } from "./zugferd-xml-parser"

export interface SupplierMatchResult {
  supplierId: string | null
  matchMethod: "vat_id" | "tax_number" | "email_domain" | "fuzzy_name" | null
  confidence: number
}

/**
 * Normalized Levenshtein similarity: 1.0 = identical, 0.0 = completely different.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const aNorm = a.toLowerCase().trim()
  const bNorm = b.toLowerCase().trim()
  if (aNorm === bNorm) return 1.0
  const maxLen = Math.max(aNorm.length, bNorm.length)
  if (maxLen === 0) return 1.0
  return 1 - distance(aNorm, bNorm) / maxLen
}

/**
 * Match a parsed invoice's seller to an existing CRM supplier.
 * Matching priority: VAT ID > Tax Number > Email Domain > Fuzzy Name.
 * All queries scoped to tenantId + type IN (SUPPLIER, BOTH) + isActive.
 */
export async function matchSupplier(
  prisma: PrismaClient,
  tenantId: string,
  parsed: ParsedInvoice,
  senderEmail: string | null
): Promise<SupplierMatchResult> {
  const noMatch: SupplierMatchResult = {
    supplierId: null,
    matchMethod: null,
    confidence: 0,
  }

  const baseWhere = {
    tenantId,
    type: { in: ["SUPPLIER" as const, "BOTH" as const] },
    isActive: true,
  }

  // 1. VAT ID match (exact, case-insensitive)
  if (parsed.sellerVatId) {
    const match = await prisma.crmAddress.findFirst({
      where: {
        ...baseWhere,
        vatId: { equals: parsed.sellerVatId, mode: "insensitive" as const },
      },
      select: { id: true },
    })
    if (match) {
      return { supplierId: match.id, matchMethod: "vat_id", confidence: 1.0 }
    }
  }

  // 2. Tax number match (exact)
  if (parsed.sellerTaxNumber) {
    const match = await prisma.crmAddress.findFirst({
      where: {
        ...baseWhere,
        taxNumber: parsed.sellerTaxNumber,
      },
      select: { id: true },
    })
    if (match) {
      return { supplierId: match.id, matchMethod: "tax_number", confidence: 0.95 }
    }
  }

  // 3. Email domain match
  if (senderEmail) {
    const domain = senderEmail.split("@")[1]?.toLowerCase()
    if (domain) {
      const match = await prisma.crmAddress.findFirst({
        where: {
          ...baseWhere,
          email: { endsWith: `@${domain}`, mode: "insensitive" as const },
        },
        select: { id: true },
      })
      if (match) {
        return { supplierId: match.id, matchMethod: "email_domain", confidence: 0.8 }
      }
    }
  }

  // 4. Fuzzy name match (Levenshtein similarity > 0.85)
  if (parsed.sellerName) {
    const suppliers = await prisma.crmAddress.findMany({
      where: baseWhere,
      select: { id: true, company: true },
    })

    let bestMatch: { id: string; similarity: number } | null = null
    for (const supplier of suppliers) {
      const sim = levenshteinSimilarity(parsed.sellerName, supplier.company)
      if (sim > 0.85 && (!bestMatch || sim > bestMatch.similarity)) {
        bestMatch = { id: supplier.id, similarity: sim }
      }
    }

    if (bestMatch) {
      return {
        supplierId: bestMatch.id,
        matchMethod: "fuzzy_name",
        confidence: bestMatch.similarity,
      }
    }
  }

  return noMatch
}
