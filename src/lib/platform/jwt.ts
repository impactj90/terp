/**
 * Platform-admin JWT signing, verification, and refresh.
 *
 * HS256 via `jose` because the platform auth server is the only signer and
 * the only verifier — asymmetric keys would add rotation cost without any
 * benefit. Tokens encode both an absolute session start (`sessionStartedAt`)
 * and a sliding last-activity timestamp (`lastActivity`), so verification
 * can enforce both a 4 h absolute lifetime and a 30 min idle cutoff without
 * touching the DB on the hot path.
 *
 * All timestamps are stored as *seconds since epoch* to match JWT `iat`/`exp`
 * conventions and avoid ms/sec confusion.
 */
import { SignJWT, jwtVerify } from "jose"
import { serverEnv } from "@/lib/config"

const SESSION_IDLE_MS = 30 * 60 * 1000 // 30 min sliding window
const SESSION_MAX_MS = 4 * 60 * 60 * 1000 // 4 h absolute cap

const ISSUER = "terp-platform"
const AUDIENCE = "terp-platform-admin"

/** Short-lived audience used for the enrollment-token returned from passwordStep. */
export const MFA_ENROLLMENT_AUDIENCE = "terp-platform-mfa-enrollment"
/** Short-lived audience used for the challenge-token returned from passwordStep. */
export const MFA_CHALLENGE_AUDIENCE = "terp-platform-mfa-challenge"

export interface PlatformJwtClaims {
  sub: string // platformUser.id
  email: string
  displayName: string
  iat: number // seconds
  lastActivity: number // seconds — refreshed on each response
  sessionStartedAt: number // seconds — anchor for the absolute-max check
  mfaVerified: boolean
}

function secretKey(): Uint8Array {
  if (!serverEnv.platformJwtSecret) {
    throw new Error("PLATFORM_JWT_SECRET not configured")
  }
  return new TextEncoder().encode(serverEnv.platformJwtSecret)
}

// --- Primary session token ---

export async function sign(
  claims: Omit<PlatformJwtClaims, "iat">
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  return new SignJWT({
    sub: claims.sub,
    email: claims.email,
    displayName: claims.displayName,
    lastActivity: claims.lastActivity,
    sessionStartedAt: claims.sessionStartedAt,
    mfaVerified: claims.mfaVerified,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(claims.sessionStartedAt + Math.floor(SESSION_MAX_MS / 1000))
    .sign(secretKey())
}

export type VerifyResult =
  | { ok: true; claims: PlatformJwtClaims }
  | { ok: false; reason: "invalid" | "expired" | "idle_timeout" }

export async function verify(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    })
    const claims = payload as unknown as PlatformJwtClaims
    const nowSec = Math.floor(Date.now() / 1000)

    if (nowSec - claims.lastActivity > Math.floor(SESSION_IDLE_MS / 1000)) {
      return { ok: false, reason: "idle_timeout" }
    }
    if (
      nowSec - claims.sessionStartedAt >
      Math.floor(SESSION_MAX_MS / 1000)
    ) {
      return { ok: false, reason: "expired" }
    }
    return { ok: true, claims }
  } catch {
    return { ok: false, reason: "invalid" }
  }
}

/** Re-sign with an updated `lastActivity` timestamp. Called per-request. */
export async function refresh(claims: PlatformJwtClaims): Promise<string> {
  return sign({
    sub: claims.sub,
    email: claims.email,
    displayName: claims.displayName,
    lastActivity: Math.floor(Date.now() / 1000),
    sessionStartedAt: claims.sessionStartedAt,
    mfaVerified: claims.mfaVerified,
  })
}

// --- Short-lived enrollment / challenge tokens ---

export interface MfaEnrollmentClaims {
  sub: string // platformUser.id
  email: string
  displayName: string
  /** The proposed (not-yet-persisted) TOTP secret in base32. Encrypted only
   *  by virtue of the JWT HMAC — the enrollment window is 5 min. */
  secretBase32: string
}

export interface MfaChallengeClaims {
  sub: string
  email: string
  displayName: string
}

const MFA_TOKEN_MAX_MS = 5 * 60 * 1000 // 5 min

export async function signMfaEnrollmentToken(
  claims: MfaEnrollmentClaims
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(MFA_ENROLLMENT_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + Math.floor(MFA_TOKEN_MAX_MS / 1000))
    .sign(secretKey())
}

export async function verifyMfaEnrollmentToken(
  token: string
): Promise<MfaEnrollmentClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: MFA_ENROLLMENT_AUDIENCE,
    })
    return payload as unknown as MfaEnrollmentClaims
  } catch {
    return null
  }
}

export async function signMfaChallengeToken(
  claims: MfaChallengeClaims
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(MFA_CHALLENGE_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + Math.floor(MFA_TOKEN_MAX_MS / 1000))
    .sign(secretKey())
}

export async function verifyMfaChallengeToken(
  token: string
): Promise<MfaChallengeClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: MFA_CHALLENGE_AUDIENCE,
    })
    return payload as unknown as MfaChallengeClaims
  } catch {
    return null
  }
}

export const SESSION_CONSTANTS = {
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  MFA_TOKEN_MAX_MS,
} as const
