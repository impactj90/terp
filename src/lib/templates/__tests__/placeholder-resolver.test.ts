import { describe, it, expect } from "vitest"
import {
  resolvePlaceholders,
  buildContactPlaceholders,
} from "../placeholder-resolver"

describe("resolvePlaceholders", () => {
  it("returns empty string for unknown placeholder", () => {
    expect(resolvePlaceholders("Hello {{unknown}}!", {})).toBe("Hello !")
  })

  it("substitutes a known placeholder", () => {
    expect(resolvePlaceholders("Hello {{name}}!", { name: "World" })).toBe(
      "Hello World!"
    )
  })

  it("stringifies numeric values", () => {
    expect(resolvePlaceholders("Total {{amount}}", { amount: 42 })).toBe(
      "Total 42"
    )
  })

  it("renders null and undefined as empty string", () => {
    expect(resolvePlaceholders("a={{a}} b={{b}}", { a: null, b: undefined })).toBe(
      "a= b="
    )
  })

  it("matches case-insensitively (Pascal vs lowercase)", () => {
    const ctx = { kundenname: "Müller GmbH" }
    expect(resolvePlaceholders("{{KundenName}}", ctx)).toBe("Müller GmbH")
    expect(resolvePlaceholders("{{kundenname}}", ctx)).toBe("Müller GmbH")
  })

  it("replaces multiple occurrences in one pass", () => {
    expect(
      resolvePlaceholders("{{x}} and {{x}} again, {{y}}", { x: "A", y: "B" })
    ).toBe("A and A again, B")
  })

  it("leaves text without placeholders unchanged", () => {
    expect(resolvePlaceholders("plain text", { x: "y" })).toBe("plain text")
  })
})

describe("buildContactPlaceholders", () => {
  it("uses the contact's letterSalutation as briefanrede when set", () => {
    const ctx = buildContactPlaceholders(
      { company: "Acme" },
      {
        firstName: "Max",
        lastName: "Müller",
        letterSalutation: "Sehr geehrter Herr Müller",
      }
    )
    expect(ctx.briefanrede).toBe("Sehr geehrter Herr Müller")
    expect(ctx.firma).toBe("Acme")
    expect(ctx.vorname).toBe("Max")
    expect(ctx.nachname).toBe("Müller")
  })

  it("falls back to a default German salutation when contact lacks one", () => {
    const ctx = buildContactPlaceholders({ company: "Acme" }, null)
    expect(ctx.briefanrede).toBe("Sehr geehrte Damen und Herren,")
    expect(ctx.lettersalutation).toBe("Dear Sir or Madam,")
  })

  it("renders empty strings for missing fields", () => {
    const ctx = buildContactPlaceholders(null, null)
    expect(ctx.firma).toBe("")
    expect(ctx.vorname).toBe("")
    expect(ctx.anrede).toBe("")
  })
})
