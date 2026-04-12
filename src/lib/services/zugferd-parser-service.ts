import { extractZugferdXml } from "./zugferd-pdf-extractor"
import { parseZugferdXml, detectProfile } from "./zugferd-xml-parser"
import type { ParsedInvoice } from "./zugferd-xml-parser"

export interface ZugferdParseResult {
  hasZugferd: boolean
  parsedInvoice: ParsedInvoice | null
  rawXml: string | null
  profile: string | null
  parseErrors: string[]
}

/**
 * Parse a PDF for embedded ZUGFeRD/Factur-X XML.
 * Returns parse result with extracted invoice data, or hasZugferd=false for plain PDFs.
 */
export async function parsePdfForZugferd(
  pdfBuffer: Buffer
): Promise<ZugferdParseResult> {
  const errors: string[] = []

  let xmlBuffer: Buffer | null = null
  try {
    xmlBuffer = await extractZugferdXml(pdfBuffer)
  } catch (err) {
    errors.push(
      `PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`
    )
    return { hasZugferd: false, parsedInvoice: null, rawXml: null, profile: null, parseErrors: errors }
  }

  if (!xmlBuffer) {
    return { hasZugferd: false, parsedInvoice: null, rawXml: null, profile: null, parseErrors: [] }
  }

  const rawXml = xmlBuffer.toString("utf-8")

  let profile: string | null = null
  try {
    profile = detectProfile(xmlBuffer)
  } catch (err) {
    errors.push(
      `Profile detection failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  let parsedInvoice: ParsedInvoice | null = null
  try {
    parsedInvoice = parseZugferdXml(xmlBuffer)
  } catch (err) {
    errors.push(
      `XML parsing failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return {
    hasZugferd: true,
    parsedInvoice,
    rawXml,
    profile,
    parseErrors: errors,
  }
}

/**
 * Parse a standalone XRechnung XML file (not embedded in PDF).
 */
export function parseStandaloneXml(xmlBuffer: Buffer): ZugferdParseResult {
  const errors: string[] = []
  const rawXml = xmlBuffer.toString("utf-8")

  let profile: string | null = null
  try {
    profile = detectProfile(xmlBuffer)
  } catch (err) {
    errors.push(
      `Profile detection failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  let parsedInvoice: ParsedInvoice | null = null
  try {
    parsedInvoice = parseZugferdXml(xmlBuffer)
  } catch (err) {
    errors.push(
      `XML parsing failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return {
    hasZugferd: true,
    parsedInvoice,
    rawXml,
    profile,
    parseErrors: errors,
  }
}
