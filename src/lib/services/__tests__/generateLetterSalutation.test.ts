import { describe, it, expect } from "vitest"
import { generateLetterSalutation } from "../crm-address-service"

describe("generateLetterSalutation", () => {
  it("generates for Herr with title", () => {
    expect(generateLetterSalutation("Herr", "Dr.", "Müller"))
      .toBe("Sehr geehrter Herr Dr. Müller")
  })

  it("generates for Frau without title", () => {
    expect(generateLetterSalutation("Frau", null, "Schmidt"))
      .toBe("Sehr geehrte Frau Schmidt")
  })

  it("generates for Herr with Prof. Dr. title", () => {
    expect(generateLetterSalutation("Herr", "Prof. Dr.", "Weber"))
      .toBe("Sehr geehrter Herr Prof. Dr. Weber")
  })

  it("returns empty string when salutation is missing", () => {
    expect(generateLetterSalutation(null, "Dr.", "Test")).toBe("")
  })

  it("returns empty string when lastName is missing", () => {
    expect(generateLetterSalutation("Herr", null, null)).toBe("")
  })

  it("returns empty string for Divers (no auto-generation)", () => {
    expect(generateLetterSalutation("Divers", null, "Test")).toBe("")
  })
})
