/**
 * Platform password hashing utilities.
 *
 * argon2id with tuned parameters per OWASP ASVS L2 recommendations. Used by
 * the platform admin domain (`PlatformUser.passwordHash`) — NOT by tenant
 * users, who authenticate through Supabase Auth.
 */
import argon2 from "argon2"

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 12) {
    throw new Error("Platform password must be at least 12 characters")
  }
  return argon2.hash(plain, ARGON2_OPTS)
}

export async function verifyPassword(
  hash: string,
  plain: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}
