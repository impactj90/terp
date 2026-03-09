/**
 * Authorization Middleware
 *
 * tRPC middleware functions that mirror the Go authorization system:
 * - requirePermission: checks if user has any of the specified permissions
 * - requireSelfOrPermission: allows self-access or requires permission
 * - requireEmployeePermission: handles own vs all employee-scoped access
 * - applyDataScope: adds data scope filter to context for Prisma queries
 *
 * @see apps/api/internal/middleware/authorization.go
 */
import { TRPCError } from "@trpc/server"
import { createMiddleware } from "@/trpc/init"
import type { ContextUser } from "@/trpc/init"
import {
  hasPermission,
  hasAnyPermission,
  isUserAdmin,
} from "./permissions"

/**
 * Context type after protectedProcedure -- user is guaranteed non-null.
 */
type AuthenticatedContext = {
  user: ContextUser
  [key: string]: unknown
}

// --- 1. requirePermission ---

/**
 * Middleware that checks if the user has ANY of the specified permissions.
 * Mirrors Go's RequirePermission middleware.
 *
 * Usage: protectedProcedure.use(requirePermission(permId1, permId2))
 *
 * @param permissionIds - UUID strings of required permissions (OR logic)
 */
export function requirePermission(...permissionIds: string[]) {
  return createMiddleware(async ({ ctx, next }) => {
    const user = (ctx as AuthenticatedContext).user
    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      })
    }

    if (!hasAnyPermission(user, permissionIds)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      })
    }

    return next({ ctx })
  })
}

// --- 2. requireSelfOrPermission ---

/**
 * Middleware that allows access if the user is accessing their own resource
 * (matched by user ID), OR if they have the specified permission.
 * Mirrors Go's RequireSelfOrPermission middleware.
 *
 * In tRPC, we use a getter function instead of URL params.
 *
 * @param userIdGetter - Function to extract user ID from procedure input
 * @param permissionId - UUID string of the fallback permission
 */
export function requireSelfOrPermission(
  userIdGetter: (input: unknown) => string,
  permissionId: string
) {
  return createMiddleware(async ({ ctx, input, next }) => {
    const user = (ctx as AuthenticatedContext).user
    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      })
    }

    const targetUserId = userIdGetter(input)

    // Self-access: user's own ID matches target
    if (user.id === targetUserId) {
      return next({ ctx })
    }

    // Otherwise: check permission
    if (!hasPermission(user, permissionId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      })
    }

    return next({ ctx })
  })
}

// --- 3. requireEmployeePermission ---

/**
 * Middleware that handles "own vs all" employee-scoped access patterns.
 * Mirrors Go's RequireEmployeePermission middleware.
 *
 * - If the user's employeeId matches the target employee: allows if user has
 *   ownPermission OR allPermission
 * - If the target is a different employee: allows only if user has allPermission
 *
 * @param employeeIdGetter - Function to extract employee ID from procedure input
 * @param ownPermission - UUID string for "own data" permission
 * @param allPermission - UUID string for "all data" permission
 */
export function requireEmployeePermission(
  employeeIdGetter: (input: unknown) => string,
  ownPermission: string,
  allPermission: string
) {
  return createMiddleware(async ({ ctx, input, next }) => {
    const user = (ctx as AuthenticatedContext).user
    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      })
    }

    // Admin bypass (mirrors Go: admin has all permissions)
    if (isUserAdmin(user)) {
      return next({ ctx })
    }

    const targetEmployeeId = employeeIdGetter(input)

    // Own employee check
    if (user.employeeId && user.employeeId === targetEmployeeId) {
      if (
        hasPermission(user, ownPermission) ||
        hasPermission(user, allPermission)
      ) {
        return next({ ctx })
      }
    } else {
      // Different employee -- need "all" permission
      if (hasPermission(user, allPermission)) {
        return next({ ctx })
      }
    }

    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient permissions",
    })
  })
}

// --- 4. applyDataScope ---

/**
 * Data scope types matching Go's DataScopeType.
 */
export type DataScopeType = "all" | "tenant" | "department" | "employee"

/**
 * Data scope filter added to context for use in Prisma queries.
 * Mirrors Go's access.Scope struct.
 */
export type DataScope = {
  type: DataScopeType
  tenantIds: string[]
  departmentIds: string[]
  employeeIds: string[]
}

/**
 * Middleware that reads the user's data scope configuration and adds
 * a DataScope object to the context. Downstream procedures use this
 * to filter Prisma queries.
 *
 * Mirrors Go's scopeFromContext() and access.ScopeFromUser().
 */
export function applyDataScope() {
  return createMiddleware(async ({ ctx, next }) => {
    const user = (ctx as AuthenticatedContext).user

    const scope: DataScope = {
      type: (user?.dataScopeType as DataScopeType) || "all",
      tenantIds: user?.dataScopeTenantIds ?? [],
      departmentIds: user?.dataScopeDepartmentIds ?? [],
      employeeIds: user?.dataScopeEmployeeIds ?? [],
    }

    return next({
      ctx: { ...ctx, dataScope: scope },
    })
  })
}
