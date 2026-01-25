'use client'

import { useMemo } from 'react'
import { useAuth } from '@/providers/auth-provider'
import type { components } from '@/lib/api/types'

/**
 * User role type from the API schema
 */
export type UserRole = components['schemas']['User']['role']

/**
 * All available roles for easy reference
 */
export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
} as const satisfies Record<string, UserRole>

/**
 * Role hierarchy - higher index means higher privileges
 */
const ROLE_HIERARCHY: UserRole[] = ['user', 'admin']

/**
 * Hook to check if the current user has any of the specified roles.
 *
 * @param roles - Array of roles to check against
 * @returns true if user has any of the specified roles
 *
 * @example
 * ```tsx
 * const isAdmin = useHasRole(['admin'])
 * const canManage = useHasRole(['admin', 'manager'])
 * ```
 */
export function useHasRole(roles: UserRole[]): boolean {
  const { user, isAuthenticated } = useAuth()

  return useMemo(() => {
    if (!isAuthenticated || !user) {
      return false
    }

    return roles.includes(user.role)
  }, [user, isAuthenticated, roles])
}

/**
 * Hook to check if the current user has at least the specified role level.
 * Uses role hierarchy for comparison.
 *
 * @param minRole - Minimum required role
 * @returns true if user's role is equal to or higher than minRole
 *
 * @example
 * ```tsx
 * const canAccess = useHasMinRole('user')  // true for user or admin
 * const isAdmin = useHasMinRole('admin')   // true only for admin
 * ```
 */
export function useHasMinRole(minRole: UserRole): boolean {
  const { user, isAuthenticated } = useAuth()

  return useMemo(() => {
    if (!isAuthenticated || !user) {
      return false
    }

    const userRoleIndex = ROLE_HIERARCHY.indexOf(user.role)
    const minRoleIndex = ROLE_HIERARCHY.indexOf(minRole)

    return userRoleIndex >= minRoleIndex
  }, [user, isAuthenticated, minRole])
}

/**
 * Hook to get the current user's role.
 *
 * @returns Current user's role or null if not authenticated
 *
 * @example
 * ```tsx
 * const role = useUserRole()
 * if (role === 'admin') { ... }
 * ```
 */
export function useUserRole(): UserRole | null {
  const { user, isAuthenticated } = useAuth()

  return useMemo(() => {
    if (!isAuthenticated || !user) {
      return null
    }

    return user.role
  }, [user, isAuthenticated])
}
