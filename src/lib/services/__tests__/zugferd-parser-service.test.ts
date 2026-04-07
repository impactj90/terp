import { describe, it, expect } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { extractZugferdXml, extractAttachments } from "../zugferd-pdf-extractor"
import { parseZugferdXml, detectProfile } from "../zugferd-xml-parser"
import { parsePdfForZugferd } from "../zugferd-parser-service"

const FIXTURES_DIR = path.join(__dirname, "fixtures", "zugferd")

function loadFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name))
}

describe("zugferd-pdf-extractor", () => {
  describe("extractAttachments", () => {
    it("extracts embedded factur-x.xml from EN16931 PDF", async () => {
      const pdf = loadFixture("EN16931_Einfach.pdf")
      const attachments = await extractAttachments(pdf)
      expect(attachments.length).toBeGreaterThanOrEqual(1)

      const xmlAtt = attachments.find((a) =>
        a.filename.toLowerCase().includes("factur-x")
      )
      expect(xmlAtt).toBeDefined()
      expect(xmlAtt!.content.toString("utf-8")).toContain("CrossIndustryInvoice")
    })
  })

  describe("extractZugferdXml", () => {
    it("extracts XML from EN16931 PDF", async () => {
      const pdf = loadFixture("EN16931_Einfach.pdf")
      const xml = await extractZugferdXml(pdf)
      expect(xml).not.toBeNull()
      expect(xml!.toString("utf-8")).toContain("CrossIndustryInvoice")
    })

    it("extracts XML from XRECHNUNG PDF", async () => {
      const pdf = loadFixture("XRECHNUNG_Einfach.pdf")
      const xml = await extractZugferdXml(pdf)
      expect(xml).not.toBeNull()
      expect(xml!.toString("utf-8")).toContain("CrossIndustryInvoice")
    })
  })
})

describe("zugferd-xml-parser", () => {
  describe("parseZugferdXml", () => {
    it("parses all mandatory BT fields from EN16931 sample", async () => {
      const pdf = loadFixture("EN16931_Einfach.pdf")
      const xml = await extractZugferdXml(pdf)
      expect(xml).not.toBeNull()

      const inv = parseZugferdXml(xml!)
      // BT-1: Invoice number
      expect(inv.invoiceNumber).toBe("471102")
      // BT-2: Issue date
      expect(inv.invoiceDate).toBe("2018-03-05")
      // BT-3: Type code
      expect(inv.invoiceTypeCode).toBe("380")
      // BT-5: Currency
      expect(inv.currency).toBe("EUR")
      // BT-27: Seller name
      expect(inv.sellerName).toBe("Lieferant GmbH")
      // BT-31: Seller VAT ID
      expect(inv.sellerVatId).toBe("DE123456789")
      // BT-32: Seller tax number
      expect(inv.sellerTaxNumber).toBe("201/113/40209")
      // BT-35: Seller street
      expect(inv.sellerStreet).toBe("Lieferantenstraße 20")
      // BT-38: Seller ZIP
      expect(inv.sellerZip).toBe("80333")
      // BT-37: Seller city
      expect(inv.sellerCity).toBe("München")
      // BT-40: Seller country
      expect(inv.sellerCountry).toBe("DE")
      // BT-44: Buyer name
      expect(inv.buyerName).toBe("Kunden AG Mitte")
      // BT-109: Total net
      expect(inv.totalNet).toBe(473)
      // BT-110: Total VAT
      expect(inv.totalVat).toBe(56.87)
      // BT-112: Total gross
      expect(inv.totalGross).toBe(529.87)
      // BT-115: Amount due
      expect(inv.amountDue).toBe(529.87)
      // Payment terms
      expect(inv.paymentTermDays).toBe(30)
    })

    it("parses line items correctly", async () => {
      const pdf = loadFixture("EN16931_Einfach.pdf")
      const xml = await extractZugferdXml(pdf)
      const inv = parseZugferdXml(xml!)

      expect(inv.lineItems).toHaveLength(2)

      const line1 = inv.lineItems[0]!
      expect(line1.lineId).toBe("1")
      expect(line1.description).toBe("Trennblätter A4")
      expect(line1.quantity).toBe(20)
      expect(line1.unit).toBe("H87")
      expect(line1.unitPriceNet).toBe(9.9)
      expect(line1.totalNet).toBe(198)
      expect(line1.vatRate).toBe(19)
      expect(line1.articleNumber).toBe("TB100A4")

      const line2 = inv.lineItems[1]!
      expect(line2.lineId).toBe("2")
      expect(line2.description).toBe("Joghurt Banane")
      expect(line2.quantity).toBe(50)
      expect(line2.unitPriceNet).toBe(5.5)
      expect(line2.totalNet).toBe(275)
      expect(line2.vatRate).toBe(7)
    })

    it("parses XRECHNUNG with Leitweg-ID", async () => {
      const pdf = loadFixture("XRECHNUNG_Einfach.pdf")
      const xml = await extractZugferdXml(pdf)
      const inv = parseZugferdXml(xml!)

      expect(inv.buyerReference).toBe("04011000-12345-34")
      expect(inv.invoiceNumber).toBe("471102")
      expect(inv.sellerName).toBe("Lieferant GmbH")
    })
  })

  describe("detectProfile", () => {
    it("detects EN16931 profile", async () => {
      const pdf = loadFixture("EN16931_Einfach.pdf")
      const xml = await extractZugferdXml(pdf)
      expect(detectProfile(xml!)).toBe("EN16931")
    })

    it("detects XRECHNUNG profile", async () => {
      const pdf = loadFixture("XRECHNUNG_Einfach.pdf")
      const xml = await extractZugferdXml(pdf)
      expect(detectProfile(xml!)).toBe("XRECHNUNG")
    })
  })
})

describe("zugferd-parser-service", () => {
  describe("parsePdfForZugferd", () => {
    it("end-to-end: PDF → ParsedInvoice with EN16931", async () => {
      const pdf = loadFixture("EN16931_Einfach.pdf")
      const result = await parsePdfForZugferd(pdf)

      expect(result.hasZugferd).toBe(true)
      expect(result.profile).toBe("EN16931")
      expect(result.parseErrors).toHaveLength(0)
      expect(result.rawXml).toContain("CrossIndustryInvoice")
      expect(result.parsedInvoice).not.toBeNull()
      expect(result.parsedInvoice!.invoiceNumber).toBe("471102")
      expect(result.parsedInvoice!.totalGross).toBe(529.87)
      expect(result.parsedInvoice!.lineItems).toHaveLength(2)
    })

    it("end-to-end: XRECHNUNG PDF", async () => {
      const pdf = loadFixture("XRECHNUNG_Einfach.pdf")
      const result = await parsePdfForZugferd(pdf)

      expect(result.hasZugferd).toBe(true)
      expect(result.profile).toBe("XRECHNUNG")
      expect(result.parsedInvoice!.buyerReference).toBe("04011000-12345-34")
    })

    it("handles multi-line-item invoices", async () => {
      const pdf = loadFixture("EN16931_Rabatte.pdf")
      const result = await parsePdfForZugferd(pdf)

      expect(result.hasZugferd).toBe(true)
      expect(result.parsedInvoice).not.toBeNull()
      expect(result.parsedInvoice!.lineItems.length).toBeGreaterThanOrEqual(1)
    })
  })
})
