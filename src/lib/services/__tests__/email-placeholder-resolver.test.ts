import { describe, it, expect } from "vitest"
import { resolvePlaceholders, type PlaceholderContext } from "../email-placeholder-resolver"

describe("email-placeholder-resolver", () => {
  describe("resolvePlaceholders", () => {
    const fullContext: PlaceholderContext = {
      kundenname: "Muster GmbH",
      anrede: "Herr Müller",
      dokumentennummer: "RE-2026-001",
      betrag: "6.241,31 €",
      faelligkeitsdatum: "15.05.2026",
      firmenname: "TERP Software GmbH",
      projektname: "Projekt Alpha",
    }

    it("replaces all 7 placeholders when all values provided", () => {
      const text = "{Kundenname} {Anrede} {Dokumentennummer} {Betrag} {Fälligkeitsdatum} {Firmenname} {Projektname}"
      const result = resolvePlaceholders(text, fullContext)
      expect(result).toBe(
        "Muster GmbH Herr Müller RE-2026-001 6.241,31 € 15.05.2026 TERP Software GmbH Projekt Alpha"
      )
    })

    it("replaces {Kundenname} with company name", () => {
      expect(
        resolvePlaceholders("Lieber {Kundenname}", { kundenname: "Test AG" })
      ).toBe("Lieber Test AG")
    })

    it("replaces {Anrede} with salutation", () => {
      expect(
        resolvePlaceholders("{Anrede},", { anrede: "Frau Schmidt" })
      ).toBe("Frau Schmidt,")
    })

    it("replaces {Dokumentennummer} with document number", () => {
      expect(
        resolvePlaceholders("Rechnung {Dokumentennummer}", {
          dokumentennummer: "RE-123",
        })
      ).toBe("Rechnung RE-123")
    })

    it("replaces {Betrag} with formatted amount", () => {
      expect(
        resolvePlaceholders("Betrag: {Betrag}", { betrag: "1.234,56 €" })
      ).toBe("Betrag: 1.234,56 €")
    })

    it("replaces {Fälligkeitsdatum} with due date", () => {
      expect(
        resolvePlaceholders("Fällig am {Fälligkeitsdatum}", {
          faelligkeitsdatum: "31.12.2026",
        })
      ).toBe("Fällig am 31.12.2026")
    })

    it("replaces {Firmenname} with tenant company name", () => {
      expect(
        resolvePlaceholders("{Firmenname}", { firmenname: "Firma XYZ" })
      ).toBe("Firma XYZ")
    })

    it("replaces {Projektname} with project name", () => {
      expect(
        resolvePlaceholders("Projekt: {Projektname}", {
          projektname: "Umbau",
        })
      ).toBe("Projekt: Umbau")
    })

    it("replaces missing placeholders with empty string", () => {
      const result = resolvePlaceholders(
        "Hallo {Kundenname}, Ihr Projekt: {Projektname}",
        {}
      )
      expect(result).toBe("Hallo , Ihr Projekt: ")
    })

    it("handles text with no placeholders (passthrough)", () => {
      expect(resolvePlaceholders("Hello world", fullContext)).toBe(
        "Hello world"
      )
    })

    it("handles multiple occurrences of same placeholder", () => {
      expect(
        resolvePlaceholders("{Kundenname} und {Kundenname}", {
          kundenname: "ABC",
        })
      ).toBe("ABC und ABC")
    })

    it("handles special characters in values (HTML entities, umlauts)", () => {
      expect(
        resolvePlaceholders("{Kundenname}", {
          kundenname: 'Müller & Söhne "GmbH"',
        })
      ).toBe('Müller & Söhne "GmbH"')
    })

    it("handles empty string input", () => {
      expect(resolvePlaceholders("", fullContext)).toBe("")
    })
  })
})
