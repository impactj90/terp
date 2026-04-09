/**
 * TOTP utilities for the platform admin MFA flow.
 *
 * Uses `otpauth` (RFC 6238 compliant) for generate/validate, the existing
 * AES-256-GCM `field-encryption` module for at-rest storage of the secret,
 * and argon2id for hashing single-use recovery codes.
 *
 * Recovery codes are shown ONCE at enrollment and never retrievable again;
 * the DB only stores their argon2 hashes. Consuming a code means finding
 * the matching hash, dropping it from the array, and persisting the
 * reduced array.
 */
import argon2 from "argon2"
import { randomBytes } from "node:crypto"
import { TOTP, Secret } from "otpauth"
import { decryptField, encryptField } from "@/lib/services/field-encryption"

const ISSUER = "terp-admin"

// --- Secret generation & URI ---

/** Generate a fresh base32 TOTP secret (160 bits per RFC 4226 §4). */
export function generateSecret(): string {
  return new Secret({ size: 20 }).base32
}

/** Store the plaintext base32 secret as AES-256-GCM ciphertext. */
export function encryptSecret(plainBase32: string): string {
  return encryptField(plainBase32)
}

/** Recover the plaintext base32 secret from ciphertext. */
export function decryptSecret(ciphertext: string): string {
  return decryptField(ciphertext)
}

/** Build the otpauth:// URI that authenticator apps scan as a QR code. */
export function buildUri(email: string, secretBase32: string): string {
  const t = new TOTP({
    issuer: ISSUER,
    label: email,
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  })
  return t.toString()
}

// --- Verification ---

/**
 * Validate a 6-digit TOTP token against a base32 secret.
 * window=1 → accepts the current step ±1 (30 s tolerance either side),
 * which matches Google Authenticator's own clock-drift behaviour.
 */
export function verifyToken(secretBase32: string, token: string): boolean {
  const t = new TOTP({
    issuer: ISSUER,
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  })
  return t.validate({ token, window: 1 }) !== null
}

// --- Recovery codes ---

/**
 * Generate N recovery codes of the shape `AB12C-D34EF` (11 chars including
 * the dash). 10 bytes of entropy → 20 hex chars → 80 bits per code, well
 * above the bar for a single-use backup mechanism.
 */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const hex = randomBytes(5).toString("hex").toUpperCase()
    // Split into 5-char groups joined by dash for readability.
    return hex.match(/.{1,5}/g)!.join("-")
  })
}

/** Hash recovery codes with argon2id for at-rest storage. */
export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(
    codes.map((code) => argon2.hash(code, { type: argon2.argon2id }))
  )
}

/**
 * Try to consume a recovery code against a list of stored argon2 hashes.
 * Returns the updated list (with the matched hash removed) on success, or
 * the original list unchanged on miss. Callers must persist `remaining`
 * atomically with the rest of the login transaction so a matched code
 * cannot be replayed.
 */
export async function consumeRecoveryCode(
  storedHashes: string[],
  candidate: string
): Promise<{ matched: boolean; remaining: string[] }> {
  for (let i = 0; i < storedHashes.length; i++) {
    if (await argon2.verify(storedHashes[i]!, candidate)) {
      const remaining = [...storedHashes]
      remaining.splice(i, 1)
      return { matched: true, remaining }
    }
  }
  return { matched: false, remaining: storedHashes }
}
