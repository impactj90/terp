import { describe, it, expect } from "vitest"
import * as iconv from "iconv-lite"
import {
  renderCsvString,
  encodeCsv,
} from "../outgoing-invoice-book-csv-service"
import { buildFilename } from "../outgoing-invoice-book-pdf-service"
import type { OutgoingInvoiceBookEntry } from "../outgoing-invoice-book-repository"

function entry(
  overrides: Partial<OutgoingInvoiceBookEntry> = {}
): OutgoingInvoiceBookEntry {
  return {
    id: "id-1",
    number: "RE-1",
    type: "INVOICE",
    documentDate: new Date("2026-03-15"),
    servicePeriodFrom: new Date("2026-03-01"),
    servicePeriodTo: new Date("2026-03-31"),
    customerName: "Müller GmbH",
    customerNumber: "K-001",
    customerVatId: "DE123456789",
    vatBreakdown: [
      { vatRate: 19, net: 100, vat: 19, gross: 119 },
    ],
    subtotalNet: 100,
    totalVat: 19,
    totalGross: 119,
    ...overrides,
  }
}

describe("renderCsvString", () => {
  it("emits a header line with 12 columns", () => {
    const { csv } = renderCsvString([])
    const lines = csv.trimEnd().split("\r\n")
    expect(lines).toHaveLength(1)
    const cols = lines[0]!.split(";")
    expect(cols).toHaveLength(12)
    expect(cols[0]).toBe("Rechnungsnummer")
    expect(cols[8]).toBe("Netto")
    expect(cols[11]).toBe("Brutto")
  })

  it("emits one data row per (entry × vatBreakdown)", () => {
    const { csv, rowCount } = renderCsvString([
      entry({
        vatBreakdown: [
          { vatRate: 19, net: 100, vat: 19, gross: 119 },
          { vatRate: 7, net: 50, vat: 3.5, gross: 53.5 },
        ],
      }),
    ])
    expect(rowCount).toBe(2)
    const lines = csv.trimEnd().split("\r\n")
    expect(lines).toHaveLength(3) // header + 2 rows
  })

  it("formats dates as TT.MM.JJJJ and numbers with comma", () => {
    const { csv } = renderCsvString([entry()])
    const lines = csv.trimEnd().split("\r\n")
    const dataCols = lines[1]!.split(";")
    expect(dataCols[1]).toBe("15.03.2026") // documentDate
    expect(dataCols[6]).toBe("01.03.2026") // servicePeriodFrom
    expect(dataCols[7]).toBe("31.03.2026") // servicePeriodTo
    expect(dataCols[8]).toBe("100,00") // Netto
    expect(dataCols[9]).toBe("19,00") // USt-Satz
  })

  it("writes INVOICE / CREDIT_NOTE as German labels", () => {
    const { csv } = renderCsvString([
      entry({ type: "INVOICE", number: "RE-1" }),
      entry({ type: "CREDIT_NOTE", number: "GS-1" }),
    ])
    const lines = csv.trimEnd().split("\r\n")
    expect(lines[1]!.split(";")[2]).toBe("Rechnung")
    expect(lines[2]!.split(";")[2]).toBe("Gutschrift")
  })

  it("escapes fields containing semicolons or quotes", () => {
    const { csv } = renderCsvString([
      entry({ customerName: 'Meyer; "Söhne" GmbH' }),
    ])
    const lines = csv.trimEnd().split("\r\n")
    const dataCols = lines[1]!
    // The field is quoted and internal quotes are doubled
    expect(dataCols).toContain('"Meyer; ""Söhne"" GmbH"')
  })

  it("outputs empty numeric cells when vatBreakdown is empty", () => {
    const { csv, rowCount } = renderCsvString([
      entry({ vatBreakdown: [] }),
    ])
    expect(rowCount).toBe(1)
    const lines = csv.trimEnd().split("\r\n")
    const cols = lines[1]!.split(";")
    expect(cols[8]).toBe("") // Netto
    expect(cols[9]).toBe("") // USt-Satz
  })

  it("outputs empty service period cells when null", () => {
    const { csv } = renderCsvString([
      entry({ servicePeriodFrom: null, servicePeriodTo: null }),
    ])
    const lines = csv.trimEnd().split("\r\n")
    const cols = lines[1]!.split(";")
    expect(cols[6]).toBe("")
    expect(cols[7]).toBe("")
  })
})

describe("encodeCsv", () => {
  it("UTF-8: prepends BOM 0xEF 0xBB 0xBF", () => {
    const buf = encodeCsv("hello", "utf8")
    expect(buf[0]).toBe(0xef)
    expect(buf[1]).toBe(0xbb)
    expect(buf[2]).toBe(0xbf)
    expect(buf.slice(3).toString("utf8")).toBe("hello")
  })

  it("Win1252: no BOM, encodes umlauts to single bytes", () => {
    const buf = encodeCsv("Müßchen", "win1252")
    // not a BOM
    expect(buf[0]).not.toBe(0xef)
    const back = iconv.decode(buf, "win1252")
    expect(back).toBe("Müßchen")
    // ü = 0xFC, ß = 0xDF in Win1252
    expect(buf).toContain(0xfc)
    expect(buf).toContain(0xdf)
  })
})

describe("buildFilename", () => {
  it("returns monthly form when range spans one full calendar month", () => {
    const from = new Date(2026, 2, 1) // March 1
    const to = new Date(2026, 2, 31) // March 31
    expect(buildFilename(from, to, "pdf")).toBe(
      "Rechnungsausgangsbuch_2026-03.pdf"
    )
    expect(buildFilename(from, to, "csv")).toBe(
      "Rechnungsausgangsbuch_2026-03.csv"
    )
  })

  it("returns range form for free ranges", () => {
    const from = new Date(2026, 2, 15)
    const to = new Date(2026, 3, 15)
    expect(buildFilename(from, to, "csv")).toBe(
      "Rechnungsausgangsbuch_2026-03-15_bis_2026-04-15.csv"
    )
  })

  it("returns range form when spanning multiple months", () => {
    const from = new Date(2026, 0, 1)
    const to = new Date(2026, 2, 31)
    expect(buildFilename(from, to, "pdf")).toBe(
      "Rechnungsausgangsbuch_2026-01-01_bis_2026-03-31.pdf"
    )
  })

  it("handles February leap-year correctly", () => {
    const from = new Date(2028, 1, 1) // Feb 1 2028 (leap year)
    const to = new Date(2028, 1, 29) // Feb 29 2028
    expect(buildFilename(from, to, "csv")).toBe(
      "Rechnungsausgangsbuch_2028-02.csv"
    )
  })
})
