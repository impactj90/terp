import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import {
  checkLoginRateLimit,
  recordAttempt,
  RATE_LIMIT_CONSTANTS,
} from "../rate-limit"

type CountCall = { email?: string; ipAddress?: string }

function makeMockPrisma(opts: {
  emailFails: number
  ipFails: number
}): { prisma: PrismaClient; calls: CountCall[] } {
  const calls: CountCall[] = []
  const count = vi.fn(async ({ where }: { where: CountCall }) => {
    calls.push(where)
    if (where.email !== undefined) return opts.emailFails
    if (where.ipAddress !== undefined) return opts.ipFails
    return 0
  })
  const create = vi.fn(async () => ({}))
  const prisma = {
    platformLoginAttempt: { count, create },
  } as unknown as PrismaClient
  return { prisma, calls }
}

const EMAIL = "tolga@terp.de"
const IP = "10.0.0.1"

describe("checkLoginRateLimit", () => {
  it("allows when both counters are below thresholds", async () => {
    const { prisma } = makeMockPrisma({ emailFails: 2, ipFails: 5 })
    const result = await checkLoginRateLimit(prisma, EMAIL, IP)
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it("locks the email after 5 failures in the window", async () => {
    const { prisma } = makeMockPrisma({ emailFails: 5, ipFails: 1 })
    const result = await checkLoginRateLimit(prisma, EMAIL, IP)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe("email_locked")
    expect(result.retryAfterMs).toBe(RATE_LIMIT_CONSTANTS.WINDOW_MS)
  })

  it("locks the IP after 20 failures in the window", async () => {
    const { prisma } = makeMockPrisma({ emailFails: 1, ipFails: 20 })
    const result = await checkLoginRateLimit(prisma, EMAIL, IP)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe("ip_locked")
  })

  it("prefers email_locked over ip_locked when both thresholds trip", async () => {
    const { prisma } = makeMockPrisma({ emailFails: 5, ipFails: 20 })
    const result = await checkLoginRateLimit(prisma, EMAIL, IP)
    expect(result.reason).toBe("email_locked")
  })

  it("queries only failures within the 15-minute window", async () => {
    const { prisma, calls } = makeMockPrisma({ emailFails: 0, ipFails: 0 })
    const before = Date.now()
    await checkLoginRateLimit(prisma, EMAIL, IP)
    // Both calls must include attemptedAt >= (now - 15 min).
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      const where = call as unknown as {
        attemptedAt: { gte: Date }
        success: boolean
      }
      expect(where.success).toBe(false)
      expect(where.attemptedAt.gte.getTime()).toBeGreaterThanOrEqual(
        before - RATE_LIMIT_CONSTANTS.WINDOW_MS - 100
      )
      expect(where.attemptedAt.gte.getTime()).toBeLessThanOrEqual(
        Date.now() - RATE_LIMIT_CONSTANTS.WINDOW_MS + 100
      )
    }
  })
})

describe("recordAttempt", () => {
  it("writes a row with the failReason", async () => {
    const create = vi.fn(async () => ({}))
    const prisma = {
      platformLoginAttempt: { create },
    } as unknown as PrismaClient

    await recordAttempt(prisma, {
      email: EMAIL,
      ipAddress: IP,
      success: false,
      failReason: "bad_password",
    })

    expect(create).toHaveBeenCalledWith({
      data: {
        email: EMAIL,
        ipAddress: IP,
        success: false,
        failReason: "bad_password",
      },
    })
  })

  it("writes success=true with failReason=null when not provided", async () => {
    const create = vi.fn(async () => ({}))
    const prisma = {
      platformLoginAttempt: { create },
    } as unknown as PrismaClient

    await recordAttempt(prisma, {
      email: EMAIL,
      ipAddress: IP,
      success: true,
    })

    expect(create).toHaveBeenCalledWith({
      data: {
        email: EMAIL,
        ipAddress: IP,
        success: true,
        failReason: null,
      },
    })
  })
})

describe("rate-limit window math", () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it("WINDOW_MS equals 15 minutes", () => {
    expect(RATE_LIMIT_CONSTANTS.WINDOW_MS).toBe(15 * 60 * 1000)
  })
  it("threshold constants match the plan", () => {
    expect(RATE_LIMIT_CONSTANTS.MAX_PER_EMAIL).toBe(5)
    expect(RATE_LIMIT_CONSTANTS.MAX_PER_IP).toBe(20)
  })
})
