/**
 * Tests that the `impersonationBoundary` middleware installed on the
 * tRPC foundation correctly wires `impersonationStorage` for every
 * downstream procedure when `ctx.impersonation` is populated, and leaves
 * `getImpersonation()` null otherwise.
 *
 * Plan: thoughts/shared/plans/2026-04-09-platform-admin-system.md (Phase 7.4)
 */
import { describe, it, expect } from "vitest"
import {
  createCallerFactory,
  createTRPCRouter,
  publicProcedure,
} from "@/trpc/init"
import { getImpersonation } from "@/lib/platform/impersonation-context"
import type { TRPCContext } from "@/trpc/init"

const testRouter = createTRPCRouter({
  readImpersonation: publicProcedure.query(() => {
    // Read from the ambient AsyncLocalStorage — if the middleware is
    // wired correctly, this sees whatever `ctx.impersonation` was set to.
    return getImpersonation()
  }),
})

function makeCtx(
  impersonation: TRPCContext["impersonation"]
): TRPCContext {
  return {
    prisma: {} as TRPCContext["prisma"],
    authToken: null,
    user: null,
    session: null,
    tenantId: null,
    ipAddress: null,
    userAgent: null,
    impersonation,
  }
}

describe("impersonationBoundary middleware — AsyncLocalStorage propagation", () => {
  const createCaller = createCallerFactory(testRouter)

  it("propagates ctx.impersonation into getImpersonation() inside a procedure", async () => {
    const caller = createCaller(
      makeCtx({
        platformUserId: "00000000-0000-4000-a000-000000000001",
        supportSessionId: "00000000-0000-4000-a000-0000000000cc",
      })
    )
    const observed = await caller.readImpersonation()
    expect(observed).toEqual({
      platformUserId: "00000000-0000-4000-a000-000000000001",
      supportSessionId: "00000000-0000-4000-a000-0000000000cc",
    })
  })

  it("returns null inside a procedure when ctx.impersonation is absent", async () => {
    const caller = createCaller(makeCtx(null))
    const observed = await caller.readImpersonation()
    expect(observed).toBeNull()
  })
})
