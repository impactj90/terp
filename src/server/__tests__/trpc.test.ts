import { describe, it, expect } from "vitest"
import { createCaller } from "../root"
import type { TRPCContext } from "@/trpc/init"

function createMockContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
  return {
    prisma: {} as TRPCContext["prisma"], // Mock for non-DB tests
    authToken: null,
    user: null,
    session: null,
    tenantId: null,
    ...overrides,
  }
}

describe("health router", () => {
  it("health.check returns ok status", async () => {
    const mockPrisma = {
      $queryRaw: async () => [{ "?column?": 1 }],
    } as unknown as TRPCContext["prisma"]

    const caller = createCaller({
      ...createMockContext(),
      prisma: mockPrisma,
    })

    const result = await caller.health.check()

    expect(result.status).toBe("ok")
    expect(result.database).toBe("connected")
    expect(result.timestamp).toBeDefined()
  })

  it("health.check reports database error gracefully", async () => {
    const mockPrisma = {
      $queryRaw: async () => {
        throw new Error("Connection refused")
      },
    } as unknown as TRPCContext["prisma"]

    const caller = createCaller({
      ...createMockContext(),
      prisma: mockPrisma,
    })

    const result = await caller.health.check()

    expect(result.status).toBe("ok")
    expect(result.database).toBe("error")
  })
})
