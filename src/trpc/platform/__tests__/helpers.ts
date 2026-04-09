/**
 * Shared test utilities for the platform tRPC router tests.
 *
 * Mirrors the tenant-side `src/trpc/routers/__tests__/helpers.ts` pattern:
 * factory functions that build a `PlatformTRPCContext` plus an auto-
 * mocking Prisma proxy so tests don't need to stub every delegate.
 */
import { vi } from "vitest"
import type {
  PlatformContextUser,
  PlatformTRPCContext,
} from "@/trpc/platform/init"
import type { PlatformJwtClaims } from "@/lib/platform/jwt"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function autoMockPrisma(partial: Record<string, any>): Record<string, any> {
  function createModelProxy(model: Record<string, unknown>) {
    return new Proxy(model, {
      get(mTarget, methodName: string) {
        if (methodName in mTarget) return mTarget[methodName]
        if (methodName === "updateMany" || methodName === "deleteMany") {
          mTarget[methodName] = vi.fn().mockResolvedValue({ count: 1 })
        } else if (methodName === "findMany") {
          mTarget[methodName] = vi.fn().mockResolvedValue([])
        } else if (methodName === "count") {
          mTarget[methodName] = vi.fn().mockResolvedValue(0)
        } else if (methodName === "createMany") {
          mTarget[methodName] = vi.fn().mockResolvedValue({ count: 0 })
        } else {
          mTarget[methodName] = vi.fn().mockResolvedValue(null)
        }
        return mTarget[methodName]
      },
    })
  }

  return new Proxy(partial, {
    get(target, prop: string) {
      if (prop === "$transaction") {
        if (prop in target) return target[prop]
        target[prop] = vi.fn().mockImplementation(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (fnOrArray: ((tx: any) => Promise<any>) | any[]) => {
            if (typeof fnOrArray === "function") {
              return fnOrArray(target)
            }
            return Promise.all(fnOrArray)
          }
        )
        return target[prop]
      }
      if (prop in target) {
        const model = target[prop]
        if (typeof model !== "object" || model === null) return model
        return createModelProxy(model as Record<string, unknown>)
      }
      target[prop] = {}
      return createModelProxy(target[prop] as Record<string, unknown>)
    },
  })
}

export function createMockPlatformUser(
  overrides: Partial<PlatformContextUser> = {}
): PlatformContextUser {
  return {
    id: "00000000-0000-4000-a000-000000000001",
    email: "tolga@terp.de",
    displayName: "Tolga",
    isActive: true,
    mfaEnrolledAt: new Date("2026-04-01T00:00:00Z"),
    lastLoginAt: new Date("2026-04-09T12:00:00Z"),
    lastLoginIp: "10.0.0.1",
    createdAt: new Date("2026-03-01T00:00:00Z"),
    createdBy: null,
    ...overrides,
  } as PlatformContextUser
}

export function createMockClaims(
  overrides: Partial<PlatformJwtClaims> = {}
): PlatformJwtClaims {
  const nowSec = Math.floor(Date.now() / 1000)
  return {
    sub: "00000000-0000-4000-a000-000000000001",
    email: "tolga@terp.de",
    displayName: "Tolga",
    iat: nowSec,
    lastActivity: nowSec,
    sessionStartedAt: nowSec,
    mfaVerified: true,
    ...overrides,
  }
}

export type PlatformContextOverrides = Partial<
  Omit<PlatformTRPCContext, "prisma">
> & {
  // Relaxed prisma type so tests can pass partial mocks like
  // `{ supportSession: { findUnique: vi.fn() } }` without satisfying the
  // full PrismaClient signature. The helper wraps it with autoMockPrisma
  // so undefined methods auto-stub.
  prisma?: Record<string, unknown>
}

export function createMockPlatformContext(
  overrides: PlatformContextOverrides = {}
): PlatformTRPCContext {
  const { prisma: prismaOverride, ...rest } = overrides
  const ctx: PlatformTRPCContext = {
    prisma: {} as PlatformTRPCContext["prisma"],
    platformUser: createMockPlatformUser(),
    claims: createMockClaims(),
    activeSupportSessionId: null,
    ipAddress: "10.0.0.1",
    userAgent: "vitest",
    responseHeaders: new Headers(),
    ...rest,
  }
  ctx.prisma = autoMockPrisma(
    (prismaOverride ?? {}) as Record<string, unknown>
  ) as unknown as PlatformTRPCContext["prisma"]
  return ctx
}
