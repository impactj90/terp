/**
 * Unit tests for the pure parsing / mapping / validation logic of the
 * payroll bulk import service. No database access — covers:
 *  - CSV parsing with BOM, quoted fields, varying separators
 *  - autoMapColumns header detection (German and English aliases)
 *  - validateAndMapRow for IBAN / SSN / Steuer-ID / numeric fields
 */
import { describe, it, expect } from "vitest"
import {
  parseCsv,
  autoMapColumns,
  validateAndMapRow,
  buildCsvTemplate,
  type RawRow,
} from "../payroll-bulk-import-service"

describe("parseCsv", () => {
  it("detects semicolon separator", () => {
    const csv = "personnelNumber;firstName;lastName\n001;Anna;Müller\n"
    const { columns, rows } = parseCsv(csv)
    expect(columns).toEqual(["personnelNumber", "firstName", "lastName"])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.values.personnelNumber).toBe("001")
    expect(rows[0]!.values.firstName).toBe("Anna")
  })

  it("detects comma separator", () => {
    const csv = "personnelNumber,firstName,lastName\n001,Anna,Müller\n"
    const { columns, rows } = parseCsv(csv)
    expect(columns).toEqual(["personnelNumber", "firstName", "lastName"])
    expect(rows[0]!.values.firstName).toBe("Anna")
  })

  it("strips UTF-8 BOM", () => {
    const csv = "\uFEFFpersonnelNumber;firstName\n001;Anna\n"
    const { columns } = parseCsv(csv)
    expect(columns[0]).toBe("personnelNumber")
  })

  it("handles quoted fields with embedded separator", () => {
    const csv = 'personnelNumber;lastName\n001;"Müller, Anna"\n'
    const { rows } = parseCsv(csv)
    expect(rows[0]!.values.lastName).toBe("Müller, Anna")
  })

  it("skips empty lines", () => {
    const csv = "personnelNumber;firstName\n\n001;Anna\n\n002;Bob\n"
    const { rows } = parseCsv(csv)
    expect(rows).toHaveLength(2)
  })

  it("throws on empty file", () => {
    expect(() => parseCsv("")).toThrow(/leer/i)
  })

  it("preserves line numbers for error mapping", () => {
    const csv = "personnelNumber;firstName\n001;Anna\n002;Bob\n"
    const { rows } = parseCsv(csv)
    expect(rows[0]!.lineNumber).toBe(2)
    expect(rows[1]!.lineNumber).toBe(3)
  })
})

describe("autoMapColumns", () => {
  it("maps German headers", () => {
    const m = autoMapColumns([
      "Personalnummer",
      "Vorname",
      "Nachname",
      "IBAN",
      "Steuer-ID",
      "Steuerklasse",
    ])
    expect(m).toMatchObject({
      Personalnummer: "personnelNumber",
      Vorname: "firstName",
      Nachname: "lastName",
      IBAN: "iban",
      "Steuer-ID": "taxId",
      Steuerklasse: "taxClass",
    })
  })

  it("maps English headers", () => {
    const m = autoMapColumns([
      "personnelNumber",
      "firstName",
      "lastName",
      "taxId",
      "hourlyRate",
    ])
    expect(m.personnelNumber).toBe("personnelNumber")
    expect(m.taxId).toBe("taxId")
    expect(m.hourlyRate).toBe("hourlyRate")
  })

  it("ignores unknown headers", () => {
    const m = autoMapColumns(["Personalnummer", "Unbekannt", "Foo"])
    expect(m.Personalnummer).toBe("personnelNumber")
    expect(m.Unbekannt).toBeUndefined()
    expect(m.Foo).toBeUndefined()
  })
})

describe("validateAndMapRow", () => {
  const mapping: Record<string, string> = {
    personnelNumber: "personnelNumber",
    firstName: "firstName",
    lastName: "lastName",
    iban: "iban",
    taxId: "taxId",
    taxClass: "taxClass",
    grossSalary: "grossSalary",
  }

  function row(vals: Record<string, string>, lineNumber = 2): RawRow {
    return { lineNumber, values: vals }
  }

  it("requires personnelNumber", () => {
    const r = validateAndMapRow(row({ firstName: "Anna" }), mapping)
    expect(r.errors).toContain("personnelNumber fehlt (Pflichtspalte)")
  })

  it("accepts a valid row", () => {
    const r = validateAndMapRow(
      row({
        personnelNumber: "001",
        firstName: "Anna",
        lastName: "Müller",
        grossSalary: "3500,50",
      }),
      mapping,
    )
    expect(r.errors).toEqual([])
    expect(r.personnelNumber).toBe("001")
    expect(r.changes).toMatchObject({
      firstName: "Anna",
      lastName: "Müller",
      grossSalary: 3500.5,
    })
  })

  it("rejects invalid IBAN", () => {
    const r = validateAndMapRow(
      row({ personnelNumber: "001", iban: "DE00000000000000000000" }),
      mapping,
    )
    expect(r.errors.some((e) => e.includes("IBAN"))).toBe(true)
  })

  it("accepts a valid German IBAN", () => {
    const r = validateAndMapRow(
      row({ personnelNumber: "001", iban: "DE89370400440532013000" }),
      mapping,
    )
    expect(r.errors).toEqual([])
    expect(r.changes.iban).toBe("DE89370400440532013000")
  })

  it("rejects taxClass out of range", () => {
    const r = validateAndMapRow(
      row({ personnelNumber: "001", taxClass: "9" }),
      mapping,
    )
    expect(r.errors.some((e) => e.toLowerCase().includes("steuerklasse"))).toBe(
      true,
    )
  })

  it("rejects non-numeric grossSalary", () => {
    const r = validateAndMapRow(
      row({ personnelNumber: "001", grossSalary: "abc" }),
      mapping,
    )
    expect(r.errors.some((e) => e.includes("Bruttogehalt"))).toBe(true)
  })

  it("parses German decimal format (comma)", () => {
    const r = validateAndMapRow(
      row({ personnelNumber: "001", grossSalary: "1234,56" }),
      mapping,
    )
    expect(r.changes.grossSalary).toBe(1234.56)
  })
})

describe("buildCsvTemplate", () => {
  it("contains personnelNumber as first column", () => {
    const csv = buildCsvTemplate()
    expect(csv.split("\n")[0]).toMatch(/^personnelNumber;/)
  })

  it("is semicolon-separated", () => {
    const csv = buildCsvTemplate()
    expect(csv).toContain(";")
  })
})
