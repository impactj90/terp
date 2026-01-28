'use client'

import { useMemo } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { useCurrentPermissions, usePermissions } from '@/hooks/api'

type PermissionKey = string

const buildPermissionKey = (resource?: string | null, action?: string | null) => {
  if (!resource || !action) return null
  return `${resource}.${action}`
}

export function useHasPermission(keys: PermissionKey[]) {
  const { isAuthenticated } = useAuth()
  const permissionsQuery = usePermissions(isAuthenticated)
  const currentPermissionsQuery = useCurrentPermissions(isAuthenticated)

  const allowed = useMemo(() => {
    if (!isAuthenticated || !currentPermissionsQuery.data?.data) {
      return false
    }

    if (currentPermissionsQuery.data.data.is_admin) {
      return true
    }

    const allowedSet = new Set(currentPermissionsQuery.data.data.permission_ids ?? [])
    if (!permissionsQuery.data?.data) {
      return false
    }

    const catalogMap = new Map<string, string>()
    permissionsQuery.data.data.forEach((perm) => {
      const key = buildPermissionKey(perm.resource, perm.action)
      if (key && perm.id) {
        catalogMap.set(key, perm.id)
      }
    })

    return keys.some((key) => {
      const id = catalogMap.get(key)
      return id ? allowedSet.has(id) : false
    })
  }, [isAuthenticated, permissionsQuery.data, currentPermissionsQuery.data, keys])

  return {
    allowed,
    isLoading: permissionsQuery.isLoading || currentPermissionsQuery.isLoading,
  }
}
