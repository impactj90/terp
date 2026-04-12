import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  tenantProcedure,
  createCallerFactory,
} from "@/trpc/init"
import type { TRPCContext, ContextUser } from "@/trpc/init"
import type { Session, User as SupabaseUser } from "@supabase/supabase-js"

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

/**
 * Creates a mock ContextUser for tests.
 */
function createMockUser(overrides: Partial<ContextUser> = {}): ContextUser {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "test@example.com",
    displayName: "Test User",
    avatarUrl: null,
    role: "user",
    tenantId: null,
    userGroupId: null,
    employeeId: null,
    username: null,
    isActive: true,
    isLocked: false,
    passwordHash: null,
    ssoId: null,
    dataScopeType: "all",
    dataScopeTenantIds: [],
    dataScopeDepartmentIds: [],
    dataScopeEmployeeIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    userGroup: null,
    userTenants: [],
    ...overrides,
  } as ContextUser
}

/**
 * Creates a mock Session for tests.
 */
function createMockSession(): Session {
  return {
    access_token: "test-token-123",
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "test@example.com",
    } as SupabaseUser,
  } as Session
}

function createMockContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
  return {
    prisma: {} as TRPCContext["prisma"],
    authToken: null,
    user: null,
    session: null,
    tenantId: null,
    ipAddress: null,
    userAgent: null,
    impersonation: null,
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
  it("throws UNAUTHORIZED without user session", async () => {
    const caller = createCaller(createMockContext())
    await expect(caller.protected()).rejects.toThrow("Authentication required")
  })

  it("throws UNAUTHORIZED with auth token but no resolved user", async () => {
    const caller = createCaller(
      createMockContext({ authToken: "test-token-123" })
    )
    await expect(caller.protected()).rejects.toThrow("Authentication required")
  })

  it("allows access with valid user and session", async () => {
    const caller = createCaller(
      createMockContext({
        authToken: "test-token-123",
        user: createMockUser(),
        session: createMockSession(),
      })
    )
    const result = await caller.protected()
    expect(result).toBe("protected")
  })
})

describe("tenantProcedure", () => {
  it("throws UNAUTHORIZED without user session", async () => {
    const caller = createCaller(createMockContext({ tenantId: "tenant-1" }))
    await expect(caller.tenant()).rejects.toThrow("Authentication required")
  })

  it("throws FORBIDDEN without tenant ID", async () => {
    const caller = createCaller(
      createMockContext({
        authToken: "test-token-123",
        user: createMockUser(),
        session: createMockSession(),
      })
    )
    await expect(caller.tenant()).rejects.toThrow("Tenant ID required")
  })

  it("allows access with user session and tenant ID", async () => {
    const tenantId = "tenant-abc"
    const caller = createCaller(
      createMockContext({
        authToken: "test-token-123",
        user: createMockUser({
          userTenants: [
            {
              userId: "00000000-0000-0000-0000-000000000001",
              tenantId,
              role: "member",
              createdAt: new Date(),
              tenant: {
                id: tenantId,
                name: "Test Tenant",
                slug: "test-tenant",
                settings: null,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                addressStreet: null,
                addressZip: null,
                addressCity: null,
                addressCountry: null,
                phone: null,
                email: null,
                payrollExportBasePath: null,
                notes: null,
                vacationBasis: "calendar_year",
              },
            } as ContextUser["userTenants"][number],
          ],
        }),
        session: createMockSession(),
        tenantId,
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
