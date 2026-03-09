/**
 * Shared test utilities for tRPC server tests.
 *
 * Provides mock factories for ContextUser, Session, TRPCContext, and UserGroup
 * to avoid duplication across test files.
 */
import type { TRPCContext, ContextUser } from "@/trpc/init"
import type { Session, User as SupabaseUser } from "@supabase/supabase-js"
import type {
  UserGroup,
  Tenant,
  UserTenant,
} from "@/generated/prisma/client"

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
  return {
    prisma: {} as TRPCContext["prisma"],
    authToken: null,
    user: null,
    session: null,
    tenantId: null,
    ...overrides,
  }
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
