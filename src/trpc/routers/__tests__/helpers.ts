/**
 * Shared test utilities for tRPC server tests.
 *
 * Provides mock factories for ContextUser, Session, TRPCContext, and UserGroup
 * to avoid duplication across test files.
 */
import { vi } from "vitest"
import type { TRPCContext, ContextUser } from "@/trpc/init"
import type { Session, User as SupabaseUser } from "@supabase/supabase-js"
import type {
  UserGroup,
  Tenant,
  UserTenant,
} from "@/generated/prisma/client"

/**
 * Wraps a partial Prisma mock so that any undefined model or method
 * automatically returns a vi.fn() stub. This prevents "X is not a function"
 * errors when repository code calls methods not explicitly mocked in a test.
 *
 * Default return values:
 *  - updateMany / deleteMany → { count: 1 }
 *  - findMany → []
 *  - count → 0
 *  - Everything else → null
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function autoMockPrisma(partial: Record<string, any>): Record<string, any> {
  function createModelProxy(model: Record<string, unknown>) {
    return new Proxy(model, {
      get(mTarget, methodName: string) {
        if (methodName in mTarget) return mTarget[methodName]
        // Auto-stub missing methods with sensible defaults
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

  const proxy: Record<string, unknown> = new Proxy(partial, {
    get(target, prop: string) {
      // Handle $transaction: wrap tx objects with auto-mocking
      if (prop === "$transaction") {
        if (prop in target) {
          const originalTx = target[prop]
          // If user defined their own $transaction, wrap the tx object it passes
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return vi.fn().mockImplementation(async (fnOrArray: any) => {
            if (typeof fnOrArray === "function") {
              // Wrap the original implementation to auto-mock the tx object
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return originalTx.getMockImplementation()!((tx: any) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return fnOrArray(autoMockPrisma(tx as Record<string, any>))
              })
            }
            return Promise.all(fnOrArray)
          })
        }
        target[prop] = vi.fn().mockImplementation(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (fnOrArray: ((tx: any) => Promise<any>) | any[]) => {
            if (typeof fnOrArray === "function") {
              return fnOrArray(proxy)
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
      // Model doesn't exist at all — create a fully auto-stubbed model
      target[prop] = {}
      return createModelProxy(target[prop] as Record<string, unknown>)
    },
  })
  return proxy
}

/**
 * Creates a mock ContextUser for tests.
 */
export function createMockUser(
  overrides: Partial<ContextUser> = {}
): ContextUser {
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
export function createMockSession(): Session {
  return {
    access_token: "test-token-123",
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "test@example.com",
    } as SupabaseUser,
  } as Session
}

/**
 * Creates a mock TRPCContext for tests.
 */
export function createMockContext(
  overrides: Partial<TRPCContext> = {}
): TRPCContext {
  const ctx = {
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
  // Auto-wrap prisma mock so undefined methods get auto-stubbed
  if (ctx.prisma) {
    ctx.prisma = autoMockPrisma(ctx.prisma as unknown as Record<string, unknown>) as unknown as TRPCContext["prisma"]
  }
  return ctx
}

/**
 * Creates a mock UserGroup for tests.
 */
export function createMockUserGroup(
  overrides: Partial<UserGroup> = {}
): UserGroup {
  return {
    id: "00000000-0000-0000-0000-000000000010",
    tenantId: null,
    name: "Test Group",
    code: "test-group",
    description: null,
    permissions: [] as UserGroup["permissions"],
    isAdmin: false,
    isSystem: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserGroup
}

/**
 * Creates a mock admin user (UserGroup with isAdmin: true).
 */
export function createAdminUser(
  overrides: Partial<ContextUser> = {}
): ContextUser {
  return createMockUser({
    userGroup: createMockUserGroup({ isAdmin: true, isActive: true }),
    ...overrides,
  })
}

/**
 * Creates a mock user with specific permissions in their UserGroup.
 */
export function createUserWithPermissions(
  permissionIds: string[],
  overrides: Partial<ContextUser> = {}
): ContextUser {
  return createMockUser({
    userGroup: createMockUserGroup({
      permissions: permissionIds as UserGroup["permissions"],
      isAdmin: false,
      isActive: true,
    }),
    ...overrides,
  })
}

/**
 * Creates a mock Tenant for tests.
 */
export function createMockTenant(
  overrides: Partial<Tenant> = {}
): Tenant {
  return {
    id: "00000000-0000-0000-0000-000000000100",
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
    ...overrides,
  } as Tenant
}

/**
 * Creates a mock UserTenant (with included tenant) for tests.
 */
export function createMockUserTenant(
  userId: string,
  tenantId: string,
  tenant?: Partial<Tenant>
): UserTenant & { tenant: Tenant } {
  return {
    userId,
    tenantId,
    role: "member",
    createdAt: new Date(),
    tenant: createMockTenant({ id: tenantId, ...tenant }),
  } as UserTenant & { tenant: Tenant }
}
