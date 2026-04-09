import { describe, it, expect } from "vitest"
import {
  validateIban,
  validateTaxId,
  validateSocialSecurityNumber,
  validateContributionGroupCode,
  validateActivityCode,
  validateTaxClass,
  validateBirthDate,
  validateEntryVsBirthDate,
  validatePersonnelGroupCode,
  validateHealthInsuranceCode,
} from "../payroll-validators"

describe("payroll-validators", () => {
  describe("validateIban", () => {
    it("accepts valid German IBAN", () => {
      expect(validateIban("DE89370400440532013000").valid).toBe(true)
    })

    it("accepts IBAN with spaces", () => {
      expect(validateIban("DE89 3704 0044 0532 0130 00").valid).toBe(true)
    })

    it("accepts lowercase", () => {
      expect(validateIban("de89370400440532013000").valid).toBe(true)
    })

    it("rejects wrong length for DE", () => {
      expect(validateIban("DE8937040044053201300").valid).toBe(false)
    })

    it("rejects invalid check digits", () => {
      expect(validateIban("DE00370400440532013000").valid).toBe(false)
    })

    it("rejects non-alphanumeric", () => {
      expect(validateIban("DE89-3704-0044").valid).toBe(false)
    })
  })

  describe("validateTaxId", () => {
    // Test IDs that satisfy the algorithm (synthetic)
    it("accepts valid tax ID (86095273488)", () => {
      expect(validateTaxId("86095273488").valid).toBe(true)
    })

    it("rejects non-11-digit", () => {
      expect(validateTaxId("1234567890").valid).toBe(false)
    })

    it("rejects leading zero", () => {
      expect(validateTaxId("01234567890").valid).toBe(false)
    })

    it("rejects non-numeric", () => {
      expect(validateTaxId("1234567890A").valid).toBe(false)
    })

    it("rejects invalid check digit", () => {
      // Valid is 86095273488, change last digit
      const result = validateTaxId("86095273480")
      expect(result.valid).toBe(false)
    })

    it("rejects invalid digit distribution (all same digit)", () => {
      expect(validateTaxId("11111111118").valid).toBe(false)
    })
  })

  describe("validateSocialSecurityNumber", () => {
    it("accepts valid format (12 chars with letter at pos 9)", () => {
      // 65 180175 M 001 — area 65, born 18.01.75, M, serial 001
      // We need to compute the actual check digit
      const ssn = "65180175M00"
      const factors = [2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1]
      const letterValues: Record<string, number> = {}
      for (let i = 0; i < 26; i++) letterValues[String.fromCharCode(65 + i)] = i + 1
      let sum = 0
      for (let i = 0; i < 11; i++) {
        let value: number
        if (i === 8) value = letterValues[ssn[i]!]!
        else value = parseInt(ssn[i]!)
        const product = value * factors[i]!
        sum += product >= 10 ? Math.floor(product / 10) + (product % 10) : product
      }
      const checkDigit = sum % 10
      const validSsn = ssn + checkDigit.toString()
      expect(validateSocialSecurityNumber(validSsn).valid).toBe(true)
    })

    it("rejects wrong length", () => {
      expect(validateSocialSecurityNumber("6518017M001").valid).toBe(false)
    })

    it("rejects no letter", () => {
      expect(validateSocialSecurityNumber("651801750010").valid).toBe(false)
    })

    it("rejects invalid check digit", () => {
      expect(validateSocialSecurityNumber("65180175M009").valid).toBe(false)
    })
  })

  describe("validateContributionGroupCode", () => {
    it("accepts 1111 (standard)", () => {
      expect(validateContributionGroupCode("1111").valid).toBe(true)
    })

    it("accepts 6500 (Minijob)", () => {
      expect(validateContributionGroupCode("6500").valid).toBe(true)
    })

    it("accepts 0000 (all exempt)", () => {
      expect(validateContributionGroupCode("0000").valid).toBe(true)
    })

    it("rejects non-4-digit", () => {
      expect(validateContributionGroupCode("111").valid).toBe(false)
    })

    it("rejects invalid KV digit (2)", () => {
      expect(validateContributionGroupCode("2111").valid).toBe(false)
    })

    it("rejects invalid RV digit (2)", () => {
      expect(validateContributionGroupCode("1211").valid).toBe(false)
    })

    it("rejects invalid AV digit (3)", () => {
      expect(validateContributionGroupCode("1131").valid).toBe(false)
    })

    it("rejects invalid PV digit (3)", () => {
      expect(validateContributionGroupCode("1113").valid).toBe(false)
    })
  })

  describe("validateActivityCode", () => {
    it("accepts valid 9-digit code", () => {
      expect(validateActivityCode("432124311").valid).toBe(true)
    })

    it("rejects non-9-digit", () => {
      expect(validateActivityCode("43212431").valid).toBe(false)
    })

    it("rejects invalid Schulbildung (0)", () => {
      expect(validateActivityCode("432120311").valid).toBe(false)
    })

    it("rejects invalid Leiharbeit (3)", () => {
      expect(validateActivityCode("432124331").valid).toBe(false)
    })

    it("rejects invalid Vertragsform (5)", () => {
      expect(validateActivityCode("432124315").valid).toBe(false)
    })
  })

  describe("validateTaxClass", () => {
    it.each([1, 2, 3, 4, 5, 6])("accepts tax class %i", (tc) => {
      expect(validateTaxClass(tc).valid).toBe(true)
    })

    it("rejects 0", () => {
      expect(validateTaxClass(0).valid).toBe(false)
    })

    it("rejects 7", () => {
      expect(validateTaxClass(7).valid).toBe(false)
    })

    it("rejects non-integer", () => {
      expect(validateTaxClass(1.5).valid).toBe(false)
    })
  })

  describe("validateBirthDate", () => {
    it("accepts normal date", () => {
      expect(validateBirthDate(new Date("1990-01-01")).valid).toBe(true)
    })

    it("rejects future date", () => {
      const future = new Date()
      future.setFullYear(future.getFullYear() + 1)
      expect(validateBirthDate(future).valid).toBe(false)
    })

    it("rejects > 120 years ago", () => {
      expect(validateBirthDate(new Date("1880-01-01")).valid).toBe(false)
    })
  })

  describe("validateEntryVsBirthDate", () => {
    it("accepts 15+ year difference", () => {
      expect(validateEntryVsBirthDate(new Date("2010-09-01"), new Date("1990-01-01")).valid).toBe(true)
    })

    it("rejects < 15 year difference", () => {
      expect(validateEntryVsBirthDate(new Date("2004-01-01"), new Date("1990-01-01")).valid).toBe(false)
    })
  })

  describe("validatePersonnelGroupCode", () => {
    it("accepts 101", () => {
      expect(validatePersonnelGroupCode("101").valid).toBe(true)
    })

    it("accepts 109", () => {
      expect(validatePersonnelGroupCode("109").valid).toBe(true)
    })

    it("rejects 115", () => {
      expect(validatePersonnelGroupCode("115").valid).toBe(false)
    })
  })

  describe("validateHealthInsuranceCode", () => {
    it("accepts 9-digit code", () => {
      expect(validateHealthInsuranceCode("108018007").valid).toBe(true)
    })

    it("rejects non-9-digit", () => {
      expect(validateHealthInsuranceCode("12345678").valid).toBe(false)
    })

    it("rejects non-numeric", () => {
      expect(validateHealthInsuranceCode("10801800A").valid).toBe(false)
    })
  })
})
