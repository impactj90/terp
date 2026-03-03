'use client'

import { useCallback, useMemo } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { useCurrentPermissions } from '@/hooks/api/use-current-permissions'
import { usePermissions } from '@/hooks/api/use-permissions'

type PermissionKey = string

const buildPermissionKey = (resource?: string | null, action?: string | null) => {
  if (!resource || !action) return null
  return `${resource}.${action}`
}

export function usePermissionChecker() {
  const { isAuthenticated } = useAuth()
  const permissionsQuery = usePermissions(isAuthenticated)
  const currentPermissionsQuery = useCurrentPermissions(isAuthenticated)

  // tRPC returns { permission_ids, is_admin } directly (no .data wrapper)
  const isAdmin = useMemo(() => {
    if (!isAuthenticated || !currentPermissionsQuery.data) {
      return false
    }
    return currentPermissionsQuery.data.is_admin === true
  }, [isAuthenticated, currentPermissionsQuery.data])

  // Permission catalog from tRPC (replaces Go backend openapi-fetch)
  const catalogMap = useMemo(() => {
    const map = new Map<string, string>()
    if (!permissionsQuery.data?.permissions) return map
    permissionsQuery.data.permissions.forEach((perm) => {
      const key = buildPermissionKey(perm.resource, perm.action)
      if (key && perm.id) {
        map.set(key, perm.id)
      }
    })
    return map
  }, [permissionsQuery.data])

  // tRPC returns permission_ids directly (no .data wrapper)
  const allowedSet = useMemo(() => {
    return new Set(currentPermissionsQuery.data?.permission_ids ?? [])
  }, [currentPermissionsQuery.data])

  const check = useCallback(
    (keys: PermissionKey[]) => {
      if (!isAuthenticated || !currentPermissionsQuery.data) {
        return false
      }
      if (isAdmin) return true
      return keys.some((key) => {
        const id = catalogMap.get(key)
        return id ? allowedSet.has(id) : false
      })
    },
    [isAuthenticated, currentPermissionsQuery.data, isAdmin, catalogMap, allowedSet]
  )

  return {
    check,
    isAdmin,
    isLoading: permissionsQuery.isLoading || currentPermissionsQuery.isLoading,
  }
}

export function useHasPermission(keys: PermissionKey[]) {
  const { check, isLoading } = usePermissionChecker()

  const allowed = useMemo(() => check(keys), [check, keys])

  return { allowed, isLoading }
}
