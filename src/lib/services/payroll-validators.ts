/**
 * German payroll-specific validators for tax IDs, social security numbers,
 * IBANs, contribution group codes, activity codes, and other payroll fields.
 */

export interface ValidationResult {
  valid: boolean
  error?: string
}

function ok(): ValidationResult {
  return { valid: true }
}

function fail(error: string): ValidationResult {
  return { valid: false, error }
}

/**
 * Validates a German IBAN (DE, 22 chars) using MOD-97 (ISO 13616).
 */
export function validateIban(iban: string): ValidationResult {
  const cleaned = iban.replace(/\s/g, "").toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) {
    return fail("IBAN must start with 2 letters, 2 check digits, then alphanumeric characters")
  }
  if (cleaned.startsWith("DE") && cleaned.length !== 22) {
    return fail("German IBAN must be exactly 22 characters")
  }
  if (cleaned.length < 15 || cleaned.length > 34) {
    return fail("IBAN must be between 15 and 34 characters")
  }
  // MOD-97 check: move first 4 chars to end, convert letters to numbers (A=10..Z=35)
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4)
  const numericStr = rearranged
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0)
      return code >= 65 && code <= 90 ? (code - 55).toString() : ch
    })
    .join("")
  // BigInt MOD 97
  let remainder = 0n
  for (const digit of numericStr) {
    remainder = (remainder * 10n + BigInt(digit)) % 97n
  }
  if (remainder !== 1n) {
    return fail("Invalid IBAN check digits")
  }
  return ok()
}

/**
 * Validates a German tax identification number (Steuer-IdNr, 11 digits).
 * Algorithm: ELSTER specification — check digit via iterative chain calculation.
 */
export function validateTaxId(taxId: string): ValidationResult {
  const cleaned = taxId.replace(/\s/g, "")
  if (!/^\d{11}$/.test(cleaned)) {
    return fail("Tax ID must be exactly 11 digits")
  }
  if (cleaned[0] === "0") {
    return fail("Tax ID must not start with 0")
  }
  // In first 10 digits: exactly one digit appears twice, exactly one digit is missing from 0-9
  const digits = cleaned.slice(0, 10).split("").map(Number)
  const freq = new Array(10).fill(0)
  for (const d of digits) freq[d]++
  const doubles = freq.filter((f) => f === 2).length
  const missing = freq.filter((f) => f === 0).length
  if (doubles !== 1 || missing !== 1) {
    return fail("Tax ID digit distribution invalid (first 10 digits must have exactly one duplicate and one missing digit)")
  }
  // Check digit (11th digit) via iterative chain calculation
  let product = 10
  for (let i = 0; i < 10; i++) {
    let summand = (digits[i]! + product) % 10
    if (summand === 0) summand = 10
    product = (summand * 2) % 11
  }
  let checkDigit = 11 - product
  if (checkDigit === 10) checkDigit = 0
  if (checkDigit !== Number(cleaned[10])) {
    return fail("Invalid tax ID check digit")
  }
  return ok()
}

/**
 * Validates a German social security number (Rentenversicherungsnummer, 12 chars).
 * Format: BBTTMMJJASSSP where BB=area, TTMMJJ=birthdate, A=initial letter, SSS=serial, P=check
 */
export function validateSocialSecurityNumber(ssn: string): ValidationResult {
  const cleaned = ssn.replace(/\s/g, "").toUpperCase()
  if (cleaned.length !== 12) {
    return fail("Social security number must be exactly 12 characters")
  }
  // Positions: 0-1 area (digits), 2-7 birthdate (digits), 8 letter, 9-10 serial (digits), 11 check (digit)
  if (!/^\d{8}[A-Z]\d{3}$/.test(cleaned)) {
    return fail("Social security number format invalid (8 digits, 1 letter, 3 digits)")
  }
  // Check digit: multiply each position by factor, sum up, mod 10
  const factors = [2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1]
  const letterValues: Record<string, number> = {}
  for (let i = 0; i < 26; i++) {
    letterValues[String.fromCharCode(65 + i)] = i + 1
  }
  let sum = 0
  for (let i = 0; i < 11; i++) {
    let value: number
    if (i === 8) {
      // Letter position
      value = letterValues[cleaned[i]!] ?? 0
    } else {
      value = parseInt(cleaned[i]!)
    }
    const product = value * factors[i]!
    // Cross-sum for two-digit products
    sum += product >= 10 ? Math.floor(product / 10) + (product % 10) : product
  }
  const checkDigit = sum % 10
  if (checkDigit !== parseInt(cleaned[11]!)) {
    return fail("Invalid social security number check digit")
  }
  return ok()
}

/**
 * Validates a 4-digit Beitragsgruppenschlüssel (contribution group code).
 * Pos.1 (KV): 0,1,3,4,5,6,9  Pos.2 (RV): 0,1,3,5  Pos.3 (AV): 0,1,2  Pos.4 (PV): 0,1,2
 */
export function validateContributionGroupCode(code: string): ValidationResult {
  if (!/^\d{4}$/.test(code)) {
    return fail("Contribution group code must be exactly 4 digits")
  }
  const validKV = ["0", "1", "3", "4", "5", "6", "9"]
  const validRV = ["0", "1", "3", "5"]
  const validAV = ["0", "1", "2"]
  const validPV = ["0", "1", "2"]
  if (!validKV.includes(code[0]!)) return fail(`KV position (1st digit) must be one of: ${validKV.join(",")}`)
  if (!validRV.includes(code[1]!)) return fail(`RV position (2nd digit) must be one of: ${validRV.join(",")}`)
  if (!validAV.includes(code[2]!)) return fail(`AV position (3rd digit) must be one of: ${validAV.join(",")}`)
  if (!validPV.includes(code[3]!)) return fail(`PV position (4th digit) must be one of: ${validPV.join(",")}`)
  return ok()
}

/**
 * Validates a 9-digit Tätigkeitsschlüssel (activity code).
 * Pos.1-5: KldB code, Pos.6: Schulbildung, Pos.7: Berufsbildung, Pos.8: Leiharbeit, Pos.9: Vertragsform
 */
export function validateActivityCode(code: string): ValidationResult {
  if (!/^\d{9}$/.test(code)) {
    return fail("Activity code must be exactly 9 digits")
  }
  const schulbildung = code[5]!
  if (!["1", "2", "3", "4", "9"].includes(schulbildung)) {
    return fail("Pos.6 (Schulbildung) must be 1-4 or 9")
  }
  const berufsbildung = code[6]!
  if (!["1", "2", "3", "4", "5", "6", "9"].includes(berufsbildung)) {
    return fail("Pos.7 (Berufsbildung) must be 1-6 or 9")
  }
  const leiharbeit = code[7]!
  if (!["1", "2"].includes(leiharbeit)) {
    return fail("Pos.8 (Leiharbeit) must be 1 or 2")
  }
  const vertragsform = code[8]!
  if (!["1", "2", "3", "4"].includes(vertragsform)) {
    return fail("Pos.9 (Vertragsform) must be 1-4")
  }
  return ok()
}

/**
 * Validates a tax class (1-6).
 */
export function validateTaxClass(taxClass: number): ValidationResult {
  if (!Number.isInteger(taxClass) || taxClass < 1 || taxClass > 6) {
    return fail("Tax class must be an integer between 1 and 6")
  }
  return ok()
}

/**
 * Validates that a birth date is plausible.
 */
export function validateBirthDate(birthDate: Date): ValidationResult {
  const now = new Date()
  if (birthDate > now) {
    return fail("Birth date cannot be in the future")
  }
  const ageMs = now.getTime() - birthDate.getTime()
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000)
  if (ageYears > 120) {
    return fail("Birth date implies age over 120 years")
  }
  return ok()
}

/**
 * Validates that entry date is at least 15 years after birth date.
 */
export function validateEntryVsBirthDate(entryDate: Date, birthDate: Date): ValidationResult {
  const diffMs = entryDate.getTime() - birthDate.getTime()
  const diffYears = diffMs / (365.25 * 24 * 60 * 60 * 1000)
  if (diffYears < 15) {
    return fail("Employee must be at least 15 years old at entry date")
  }
  return ok()
}

/**
 * Validates a personnel group code against known values (101-190).
 */
export function validatePersonnelGroupCode(code: string): ValidationResult {
  const validCodes = ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110",
    "111", "112", "113", "114", "116", "117", "118", "119", "120", "190"]
  if (!validCodes.includes(code)) {
    return fail(`Unknown personnel group code: ${code}`)
  }
  return ok()
}

/**
 * Validates a health insurance institution code (IK-Nummer, 9 digits).
 */
export function validateHealthInsuranceCode(code: string): ValidationResult {
  if (!/^\d{9}$/.test(code)) {
    return fail("Health insurance institution code must be exactly 9 digits")
  }
  return ok()
}
