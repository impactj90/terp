/**
 * DB-counter rate limit for platform-admin login attempts.
 *
 * Windows and thresholds (intentionally aggressive for an admin surface
 * that has very few legitimate actors):
 *   - 5 failed attempts per email  / 15 min → 15 min email lockout
 *   - 20 failed attempts per IP    / 15 min → 15 min IP lockout
 *
 * Every failure branch in `login-service.ts` (`bad_password`, `bad_totp`,
 * `bad_recovery_code`) records an attempt row, so a brute-force loop on
 * recovery codes trips the same lockout as a brute-force loop on passwords.
 *
 * This intentionally uses the DB rather than Redis: we already have the
 * `platform_login_attempts` table for audit purposes, the write volume is
 * trivial (< 1/s even under attack), and it keeps the deploy footprint
 * minimal. The cleanup cron (Phase 8) prunes rows older than 30 days.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_EMAIL = 5
const MAX_PER_IP = 20

export type RateLimitReason = "email_locked" | "ip_locked"

export interface RateLimitResult {
  allowed: boolean
  reason?: RateLimitReason
  retryAfterMs?: number
}

export async function checkLoginRateLimit(
  prisma: PrismaClient,
  email: string,
  ipAddress: string
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS)

  const [emailFails, ipFails] = await Promise.all([
    prisma.platformLoginAttempt.count({
      where: { email, success: false, attemptedAt: { gte: since } },
    }),
    prisma.platformLoginAttempt.count({
      where: { ipAddress, success: false, attemptedAt: { gte: since } },
    }),
  ])

  if (emailFails >= MAX_PER_EMAIL) {
    return { allowed: false, reason: "email_locked", retryAfterMs: WINDOW_MS }
  }
  if (ipFails >= MAX_PER_IP) {
    return { allowed: false, reason: "ip_locked", retryAfterMs: WINDOW_MS }
  }
  return { allowed: true }
}

export interface AttemptRecord {
  email: string
  ipAddress: string
  success: boolean
  failReason?: string
}

export async function recordAttempt(
  prisma: PrismaClient,
  data: AttemptRecord
): Promise<void> {
  await prisma.platformLoginAttempt.create({
    data: {
      email: data.email,
      ipAddress: data.ipAddress,
      success: data.success,
      failReason: data.failReason ?? null,
    },
  })
}

export const RATE_LIMIT_CONSTANTS = {
  WINDOW_MS,
  MAX_PER_EMAIL,
  MAX_PER_IP,
} as const
