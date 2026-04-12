import { describe, it, expect, vi, afterEach } from "vitest"
import { TOTP, Secret } from "otpauth"
import {
  buildUri,
  consumeRecoveryCode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCodes,
  verifyToken,
} from "../totp"

afterEach(() => {
  vi.useRealTimers()
})

describe("TOTP secret generation", () => {
  it("produces a base32-looking 20-byte secret", () => {
    const s = generateSecret()
    // otpauth's base32 uses RFC 4648 chars (A-Z, 2-7); 20 bytes → 32 chars.
    expect(s).toMatch(/^[A-Z2-7]+$/)
    expect(s.length).toBeGreaterThanOrEqual(32)
  })

  it("buildUri produces an otpauth:// URI that contains the issuer and email", () => {
    const secret = generateSecret()
    const uri = buildUri("tolga@terp.de", secret)
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    expect(uri).toContain("terp-admin")
    expect(decodeURIComponent(uri)).toContain("tolga@terp.de")
  })
})

describe("TOTP token verification", () => {
  it("accepts the token for the current step", () => {
    const secret = generateSecret()
    const totp = new TOTP({
      secret: Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    })
    const now = totp.generate()
    expect(verifyToken(secret, now)).toBe(true)
  })

  it("rejects a token from far in the past", () => {
    vi.useFakeTimers()
    const secret = generateSecret()
    const totp = new TOTP({
      secret: Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    })
    // Generate a code "now", then jump 2 min forward. Window=1 only
    // forgives ±30s, so the token should fail.
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"))
    const oldToken = totp.generate()
    vi.setSystemTime(new Date("2026-04-09T12:02:00Z"))
    expect(verifyToken(secret, oldToken)).toBe(false)
  })

  it("accepts a token from 20 s ago (within ±30s tolerance)", () => {
    vi.useFakeTimers()
    const secret = generateSecret()
    const totp = new TOTP({
      secret: Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    })
    // Pick a moment halfway into a 30s period so ±20s stays within one step.
    vi.setSystemTime(new Date("2026-04-09T12:00:15Z"))
    const token = totp.generate()
    vi.setSystemTime(new Date("2026-04-09T12:00:35Z")) // 20 s later, same step
    expect(verifyToken(secret, token)).toBe(true)
  })

  it("rejects a completely wrong token", () => {
    const secret = generateSecret()
    expect(verifyToken(secret, "000000")).toBe(false)
  })
})

describe("secret at-rest encryption", () => {
  it("round-trips a base32 secret via encrypt/decrypt", () => {
    const plain = generateSecret()
    const cipher = encryptSecret(plain)
    expect(cipher).not.toBe(plain)
    expect(cipher).toMatch(/^v\d+:/)
    expect(decryptSecret(cipher)).toBe(plain)
  })

  it("produces different ciphertext for the same input (fresh IV)", () => {
    const plain = generateSecret()
    const c1 = encryptSecret(plain)
    const c2 = encryptSecret(plain)
    expect(c1).not.toBe(c2)
    expect(decryptSecret(c1)).toBe(plain)
    expect(decryptSecret(c2)).toBe(plain)
  })
})

describe("recovery codes", () => {
  it("generates 10 codes by default in the correct format", () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    for (const c of codes) {
      expect(c).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/)
    }
  })

  it("generates distinct codes", () => {
    const codes = generateRecoveryCodes(20)
    expect(new Set(codes).size).toBe(20)
  })

  it("hashRecoveryCodes + consumeRecoveryCode match the plaintext", async () => {
    const plain = generateRecoveryCodes()
    const hashed = await hashRecoveryCodes(plain)
    expect(hashed).toHaveLength(plain.length)

    const result = await consumeRecoveryCode(hashed, plain[0]!)
    expect(result.matched).toBe(true)
    expect(result.remaining).toHaveLength(hashed.length - 1)
  })

  it("returns matched=false on a wrong code without mutating the list", async () => {
    const plain = generateRecoveryCodes()
    const hashed = await hashRecoveryCodes(plain)
    const before = [...hashed]
    const result = await consumeRecoveryCode(hashed, "ABCDE-FGHIJ")
    expect(result.matched).toBe(false)
    expect(result.remaining).toEqual(before)
  })

  it("consumed code can only be used once", async () => {
    const plain = generateRecoveryCodes()
    const hashed = await hashRecoveryCodes(plain)

    const first = await consumeRecoveryCode(hashed, plain[0]!)
    expect(first.matched).toBe(true)

    const second = await consumeRecoveryCode(first.remaining, plain[0]!)
    expect(second.matched).toBe(false)
  })
})
