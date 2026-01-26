'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { useApiQuery } from '@/hooks'
import { tenantIdStorage } from '@/lib/api/client'
import type { components } from '@/lib/api/types'

type Tenant = components['schemas']['Tenant']

export interface TenantContextValue {
  /** Current selected tenant, null if not selected */
  tenant: Tenant | null
  /** ID of the current tenant */
  tenantId: string | null
  /** List of available tenants */
  tenants: Tenant[]
  /** Whether tenant data is being loaded */
  isLoading: boolean
  /** Whether a tenant is selected */
  hasTenant: boolean
  /** Select a tenant */
  selectTenant: (tenant: Tenant) => void
  /** Clear the current tenant */
  clearTenant: () => void
}

const TenantContext = createContext<TenantContextValue | null>(null)

interface TenantProviderProps {
  children: ReactNode
}

/**
 * Provider that manages tenant selection state.
 * Fetches available tenants and auto-selects if there's only one.
 */
export function TenantProvider({ children }: TenantProviderProps) {
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load current tenant from storage on mount
  useEffect(() => {
    const stored = tenantIdStorage.getTenantId()
    setCurrentTenantId(stored)
    setIsInitialized(true)
  }, [])

  // Fetch list of tenants
  const { data: tenantsData, isLoading: isLoadingTenants } = useApiQuery(
    '/tenants',
    {
      enabled: isInitialized,
    }
  )

  const tenants = tenantsData ?? []
  const currentTenant = tenants.find((t) => t.id === currentTenantId) ?? null

  // Auto-select if there's only one tenant and none is selected
  useEffect(() => {
    if (!isInitialized || isLoadingTenants) return
    if (currentTenantId) return // Already have a tenant
    if (tenants.length !== 1) return // Need user to select

    const onlyTenant = tenants[0]
    if (onlyTenant) {
      tenantIdStorage.setTenantId(onlyTenant.id)
      setCurrentTenantId(onlyTenant.id)
    }
  }, [isInitialized, isLoadingTenants, tenants, currentTenantId])

  const selectTenant = useCallback((tenant: Tenant) => {
    tenantIdStorage.setTenantId(tenant.id)
    setCurrentTenantId(tenant.id)
    // Reload to refresh all data with new tenant context
    window.location.reload()
  }, [])

  const clearTenant = useCallback(() => {
    tenantIdStorage.clearTenantId()
    setCurrentTenantId(null)
  }, [])

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant: currentTenant,
      tenantId: currentTenantId,
      tenants,
      isLoading: !isInitialized || isLoadingTenants,
      hasTenant: !!currentTenantId,
      selectTenant,
      clearTenant,
    }),
    [
      currentTenant,
      currentTenantId,
      tenants,
      isInitialized,
      isLoadingTenants,
      selectTenant,
      clearTenant,
    ]
  )

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  )
}

/**
 * Hook to access tenant context.
 */
export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext)

  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider')
  }

  return context
}
