import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  PDFHexString,
  PDFString,
  decodePDFRawStream,
} from "pdf-lib"

export interface PdfAttachment {
  filename: string
  content: Buffer
  contentType: string
}

const ZUGFERD_FILENAMES = [
  "factur-x.xml",
  "zugferd-invoice.xml",
  "xrechnung.xml",
  "order-x.xml",
]

/**
 * Extract all embedded file attachments from a PDF.
 * Uses the PDF Names/EmbeddedFiles name tree.
 */
export async function extractAttachments(
  pdfBuffer: Buffer
): Promise<PdfAttachment[]> {
  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
  const catalog = doc.catalog

  const namesDict = catalog.lookup(PDFName.of("Names"), PDFDict)
  if (!namesDict) return []

  const efDict = namesDict.lookup(PDFName.of("EmbeddedFiles"), PDFDict)
  if (!efDict) return []

  const namesArr = efDict.lookup(PDFName.of("Names"), PDFArray)
  if (!namesArr) return []

  const attachments: PdfAttachment[] = []

  for (let i = 0; i < namesArr.size(); i += 2) {
    const nameObj = namesArr.lookup(i)
    let filename = ""
    if (nameObj instanceof PDFHexString) filename = nameObj.decodeText()
    else if (nameObj instanceof PDFString) filename = nameObj.decodeText()
    else continue

    const fileSpec = namesArr.lookup(i + 1, PDFDict)
    if (!fileSpec) continue

    const ef = fileSpec.lookup(PDFName.of("EF"), PDFDict)
    if (!ef) continue

    const streamRef = ef.get(PDFName.of("F"))
    if (!streamRef) continue

    const streamObj = doc.context.lookup(streamRef)
    if (!(streamObj instanceof PDFRawStream)) continue

    const decoded = decodePDFRawStream(streamObj)
    const content = Buffer.from(decoded.decode())

    const contentType = filename.endsWith(".xml")
      ? "text/xml"
      : "application/octet-stream"

    attachments.push({ filename, content, contentType })
  }

  return attachments
}

/**
 * Extract the ZUGFeRD/Factur-X XML from a PDF, if embedded.
 * Looks for known filenames: factur-x.xml, zugferd-invoice.xml, xrechnung.xml.
 * Returns the XML buffer or null if not found.
 */
export async function extractZugferdXml(
  pdfBuffer: Buffer
): Promise<Buffer | null> {
  const attachments = await extractAttachments(pdfBuffer)

  for (const att of attachments) {
    const lower = att.filename.toLowerCase()
    if (ZUGFERD_FILENAMES.includes(lower)) {
      return att.content
    }
  }

  return null
}
