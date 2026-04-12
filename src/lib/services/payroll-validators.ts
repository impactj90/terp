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
    return fail("IBAN muss mit 2 Buchstaben, 2 Prüfziffern und dann alphanumerischen Zeichen beginnen")
  }
  if (cleaned.startsWith("DE") && cleaned.length !== 22) {
    return fail("Deutsche IBAN muss genau 22 Zeichen lang sein")
  }
  if (cleaned.length < 15 || cleaned.length > 34) {
    return fail("IBAN muss zwischen 15 und 34 Zeichen lang sein")
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
    return fail("Ungültige IBAN-Prüfziffern")
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
    return fail("Steuer-ID muss genau 11 Ziffern enthalten")
  }
  if (cleaned[0] === "0") {
    return fail("Steuer-ID darf nicht mit 0 beginnen")
  }
  // In first 10 digits: exactly one digit appears twice, exactly one digit is missing from 0-9
  const digits = cleaned.slice(0, 10).split("").map(Number)
  const freq = new Array(10).fill(0)
  for (const d of digits) freq[d]++
  const doubles = freq.filter((f) => f === 2).length
  const missing = freq.filter((f) => f === 0).length
  if (doubles !== 1 || missing !== 1) {
    return fail("Ungültige Steuer-ID (in den ersten 10 Ziffern muss genau eine Ziffer doppelt und eine fehlen)")
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
    return fail("Ungültige Steuer-ID-Prüfziffer")
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
    return fail("Sozialversicherungsnummer muss genau 12 Zeichen lang sein")
  }
  // Positions: 0-1 area (digits), 2-7 birthdate (digits), 8 letter, 9-10 serial (digits), 11 check (digit)
  if (!/^\d{8}[A-Z]\d{3}$/.test(cleaned)) {
    return fail("Ungültiges Format der Sozialversicherungsnummer (8 Ziffern, 1 Buchstabe, 3 Ziffern)")
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
    return fail("Ungültige Prüfziffer der Sozialversicherungsnummer")
  }
  return ok()
}

/**
 * Validates a 4-digit Beitragsgruppenschlüssel (contribution group code).
 * Pos.1 (KV): 0,1,3,4,5,6,9  Pos.2 (RV): 0,1,3,5  Pos.3 (AV): 0,1,2  Pos.4 (PV): 0,1,2
 */
export function validateContributionGroupCode(code: string): ValidationResult {
  if (!/^\d{4}$/.test(code)) {
    return fail("Beitragsgruppenschlüssel muss genau 4 Ziffern enthalten")
  }
  const validKV = ["0", "1", "3", "4", "5", "6", "9"]
  const validRV = ["0", "1", "3", "5"]
  const validAV = ["0", "1", "2"]
  const validPV = ["0", "1", "2"]
  if (!validKV.includes(code[0]!)) return fail(`KV-Stelle (1. Ziffer) muss einer von folgenden Werten sein: ${validKV.join(",")}`)
  if (!validRV.includes(code[1]!)) return fail(`RV-Stelle (2. Ziffer) muss einer von folgenden Werten sein: ${validRV.join(",")}`)
  if (!validAV.includes(code[2]!)) return fail(`AV-Stelle (3. Ziffer) muss einer von folgenden Werten sein: ${validAV.join(",")}`)
  if (!validPV.includes(code[3]!)) return fail(`PV-Stelle (4. Ziffer) muss einer von folgenden Werten sein: ${validPV.join(",")}`)
  return ok()
}

/**
 * Validates a 9-digit Tätigkeitsschlüssel (activity code).
 * Pos.1-5: KldB code, Pos.6: Schulbildung, Pos.7: Berufsbildung, Pos.8: Leiharbeit, Pos.9: Vertragsform
 */
export function validateActivityCode(code: string): ValidationResult {
  if (!/^\d{9}$/.test(code)) {
    return fail("Tätigkeitsschlüssel muss genau 9 Ziffern enthalten")
  }
  const schulbildung = code[5]!
  if (!["1", "2", "3", "4", "9"].includes(schulbildung)) {
    return fail("Stelle 6 (Schulbildung) muss 1-4 oder 9 sein")
  }
  const berufsbildung = code[6]!
  if (!["1", "2", "3", "4", "5", "6", "9"].includes(berufsbildung)) {
    return fail("Stelle 7 (Berufsbildung) muss 1-6 oder 9 sein")
  }
  const leiharbeit = code[7]!
  if (!["1", "2"].includes(leiharbeit)) {
    return fail("Stelle 8 (Leiharbeit) muss 1 oder 2 sein")
  }
  const vertragsform = code[8]!
  if (!["1", "2", "3", "4"].includes(vertragsform)) {
    return fail("Stelle 9 (Vertragsform) muss 1-4 sein")
  }
  return ok()
}

/**
 * Validates a tax class (1-6).
 */
export function validateTaxClass(taxClass: number): ValidationResult {
  if (!Number.isInteger(taxClass) || taxClass < 1 || taxClass > 6) {
    return fail("Steuerklasse muss eine Ganzzahl zwischen 1 und 6 sein")
  }
  return ok()
}

/**
 * Validates that a birth date is plausible.
 */
export function validateBirthDate(birthDate: Date): ValidationResult {
  const now = new Date()
  if (birthDate > now) {
    return fail("Geburtsdatum darf nicht in der Zukunft liegen")
  }
  const ageMs = now.getTime() - birthDate.getTime()
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000)
  if (ageYears > 120) {
    return fail("Geburtsdatum liegt mehr als 120 Jahre zurück")
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
    return fail("Mitarbeiter muss am Eintrittsdatum mindestens 15 Jahre alt sein")
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
    return fail(`Unbekannter Personengruppenschlüssel: ${code}`)
  }
  return ok()
}

/**
 * Validates a health insurance institution code (IK-Nummer, 9 digits).
 */
export function validateHealthInsuranceCode(code: string): ValidationResult {
  if (!/^\d{9}$/.test(code)) {
    return fail("Krankenkassen-Institutionskennzeichen muss genau 9 Ziffern enthalten")
  }
  return ok()
}
