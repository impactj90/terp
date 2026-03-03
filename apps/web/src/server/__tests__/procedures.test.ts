import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  tenantProcedure,
  createCallerFactory,
} from "../trpc"
import type { TRPCContext } from "../trpc"

/**
 * Test router with all three procedure types.
 */
const testRouter = createTRPCRouter({
  public: publicProcedure.query(() => "public"),
  protected: protectedProcedure.query(() => "protected"),
  tenant: tenantProcedure.query(({ ctx }) => `tenant:${ctx.tenantId}`),
  validatedInput: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(({ input }) => `hello ${input.name}`),
})

const createCaller = createCallerFactory(testRouter)

function createMockContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
  return {
    prisma: {} as TRPCContext["prisma"],
    authToken: null,
    user: null,
    session: null,
    tenantId: null,
    ...overrides,
  }
}

describe("publicProcedure", () => {
  it("allows unauthenticated access", async () => {
    const caller = createCaller(createMockContext())
    const result = await caller.public()
    expect(result).toBe("public")
  })
})

describe("protectedProcedure", () => {
  it("throws UNAUTHORIZED without auth token", async () => {
    const caller = createCaller(createMockContext())
    await expect(caller.protected()).rejects.toThrow("Authentication required")
  })

  it("allows access with auth token", async () => {
    const caller = createCaller(
      createMockContext({ authToken: "test-token-123" })
    )
    const result = await caller.protected()
    expect(result).toBe("protected")
  })
})

describe("tenantProcedure", () => {
  it("throws UNAUTHORIZED without auth token", async () => {
    const caller = createCaller(createMockContext({ tenantId: "tenant-1" }))
    await expect(caller.tenant()).rejects.toThrow("Authentication required")
  })

  it("throws FORBIDDEN without tenant ID", async () => {
    const caller = createCaller(
      createMockContext({ authToken: "test-token-123" })
    )
    await expect(caller.tenant()).rejects.toThrow("Tenant ID required")
  })

  it("allows access with auth token and tenant ID", async () => {
    const caller = createCaller(
      createMockContext({
        authToken: "test-token-123",
        tenantId: "tenant-abc",
      })
    )
    const result = await caller.tenant()
    expect(result).toBe("tenant:tenant-abc")
  })
})

describe("zod validation", () => {
  it("rejects invalid input", async () => {
    const caller = createCaller(createMockContext())
    await expect(
      caller.validatedInput({ name: "" })
    ).rejects.toThrow()
  })

  it("accepts valid input", async () => {
    const caller = createCaller(createMockContext())
    const result = await caller.validatedInput({ name: "world" })
    expect(result).toBe("hello world")
  })
})
