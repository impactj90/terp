import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  sign,
  verify,
  refresh,
  signMfaEnrollmentToken,
  verifyMfaEnrollmentToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  SESSION_CONSTANTS,
  type PlatformJwtClaims,
} from "../jwt"

const USER = {
  sub: "00000000-0000-4000-a000-000000000001",
  email: "tolga@terp.de",
  displayName: "Tolga",
}

function freshClaims(): Omit<PlatformJwtClaims, "iat"> {
  const nowSec = Math.floor(Date.now() / 1000)
  return {
    ...USER,
    lastActivity: nowSec,
    sessionStartedAt: nowSec,
    mfaVerified: true,
  }
}

describe("platform jwt — session tokens", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("round-trips a valid session token", async () => {
    const token = await sign(freshClaims())
    const result = await verify(token)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.claims.sub).toBe(USER.sub)
      expect(result.claims.email).toBe(USER.email)
      expect(result.claims.mfaVerified).toBe(true)
    }
  })

  it("rejects a tampered token", async () => {
    const token = await sign(freshClaims())
    // Flip a character in the signature.
    const tampered = token.slice(0, -3) + "aaa"
    const result = await verify(tampered)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("invalid")
    }
  })

  it("rejects a token past the absolute max (4 h)", async () => {
    const token = await sign(freshClaims())
    // Advance past the 4 h cap.
    vi.advanceTimersByTime(SESSION_CONSTANTS.SESSION_MAX_MS + 60_000)
    const result = await verify(token)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      // jose sees `exp` past → "invalid" is an acceptable reason here,
      // but our explicit check returns "expired" if we somehow beat jose.
      expect(["expired", "invalid"]).toContain(result.reason)
    }
  })

  it("rejects a token past the sliding idle window (30 min)", async () => {
    const token = await sign(freshClaims())
    vi.advanceTimersByTime(SESSION_CONSTANTS.SESSION_IDLE_MS + 60_000)
    const result = await verify(token)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("idle_timeout")
    }
  })

  it("refresh() produces a new token whose idle window resets", async () => {
    const original = await sign(freshClaims())
    // Wait 20 min — still inside the 30-min idle window.
    vi.advanceTimersByTime(20 * 60 * 1000)
    const v1 = await verify(original)
    expect(v1.ok).toBe(true)
    if (!v1.ok) return

    const refreshed = await refresh(v1.claims)
    // Wait another 20 min. The old token is now 40 min stale (would fail),
    // the refreshed token is only 20 min stale (should pass).
    vi.advanceTimersByTime(20 * 60 * 1000)

    const oldResult = await verify(original)
    const newResult = await verify(refreshed)

    expect(oldResult.ok).toBe(false)
    expect(newResult.ok).toBe(true)
  })
})

describe("platform jwt — MFA enrollment token", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("carries the proposed secretBase32 through the round-trip", async () => {
    const token = await signMfaEnrollmentToken({
      ...USER,
      secretBase32: "JBSWY3DPEHPK3PXP",
    })
    const claims = await verifyMfaEnrollmentToken(token)
    expect(claims).not.toBeNull()
    expect(claims?.secretBase32).toBe("JBSWY3DPEHPK3PXP")
  })

  it("rejects an enrollment token as a session token (wrong audience)", async () => {
    const token = await signMfaEnrollmentToken({
      ...USER,
      secretBase32: "JBSWY3DPEHPK3PXP",
    })
    const asSession = await verify(token)
    expect(asSession.ok).toBe(false)
  })

  it("expires after 5 min", async () => {
    const token = await signMfaEnrollmentToken({
      ...USER,
      secretBase32: "JBSWY3DPEHPK3PXP",
    })
    vi.advanceTimersByTime(SESSION_CONSTANTS.MFA_TOKEN_MAX_MS + 1000)
    const claims = await verifyMfaEnrollmentToken(token)
    expect(claims).toBeNull()
  })
})

describe("platform jwt — MFA challenge token", () => {
  it("round-trips", async () => {
    const token = await signMfaChallengeToken(USER)
    const claims = await verifyMfaChallengeToken(token)
    expect(claims?.sub).toBe(USER.sub)
  })

  it("rejects an enrollment token as a challenge (audience mismatch)", async () => {
    const token = await signMfaEnrollmentToken({
      ...USER,
      secretBase32: "JBSWY3DPEHPK3PXP",
    })
    const claims = await verifyMfaChallengeToken(token)
    expect(claims).toBeNull()
  })
})
