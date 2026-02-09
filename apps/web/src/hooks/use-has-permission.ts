'use client'

import { useCallback, useMemo } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { useCurrentPermissions, usePermissions } from '@/hooks/api'

type PermissionKey = string

const buildPermissionKey = (resource?: string | null, action?: string | null) => {
  if (!resource || !action) return null
  return `${resource}.${action}`
}

export function usePermissionChecker() {
  const { isAuthenticated } = useAuth()
  const permissionsQuery = usePermissions(isAuthenticated)
  const currentPermissionsQuery = useCurrentPermissions(isAuthenticated)

  const isAdmin = useMemo(() => {
    if (!isAuthenticated || !currentPermissionsQuery.data?.data) {
      return false
    }
    return currentPermissionsQuery.data.data.is_admin === true
  }, [isAuthenticated, currentPermissionsQuery.data])

  const catalogMap = useMemo(() => {
    const map = new Map<string, string>()
    if (!permissionsQuery.data?.data) return map
    permissionsQuery.data.data.forEach((perm) => {
      const key = buildPermissionKey(perm.resource, perm.action)
      if (key && perm.id) {
        map.set(key, perm.id)
      }
    })
    return map
  }, [permissionsQuery.data])

  const allowedSet = useMemo(() => {
    return new Set(currentPermissionsQuery.data?.data?.permission_ids ?? [])
  }, [currentPermissionsQuery.data])

  const check = useCallback(
    (keys: PermissionKey[]) => {
      if (!isAuthenticated || !currentPermissionsQuery.data?.data) {
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
