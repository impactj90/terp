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
import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/trpc'
import { tenantIdStorage } from '@/lib/storage'

interface Tenant {
  id: string
  name: string
  [key: string]: unknown
}

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
  const trpc = useTRPC()
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load current tenant from storage on mount
  useEffect(() => {
    const stored = tenantIdStorage.getTenantId()
    setCurrentTenantId(stored)
    setIsInitialized(true)
  }, [])

  // Fetch list of tenants via tRPC
  const { data: tenantsData, isLoading: isLoadingTenants } = useQuery(
    trpc.tenants.list.queryOptions(
      {},
      { enabled: isInitialized }
    )
  )

  const tenants = (tenantsData ?? []) as Tenant[]
  const currentTenant = tenants.find((t) => t.id === currentTenantId) ?? null

  // Clear stale tenant ID if it's not in the available tenants list.
  //
  // The `tenants.length === 0` guard is load-bearing for the platform
  // impersonation flow (see thoughts/shared/plans/2026-04-10-platform-impersonation-ui-bridge.md):
  // during the brief window before `tenants.list` responds, the empty
  // array must not wipe tenantIdStorage — otherwise the tenant the
  // operator just seeded from "Tenant öffnen" would be cleared and the
  // dashboard would have no tenant selected. Do NOT remove this guard.
  useEffect(() => {
    if (!isInitialized || isLoadingTenants) return
    if (!currentTenantId || tenants.length === 0) return
    const isValid = tenants.some((t) => t.id === currentTenantId)
    if (!isValid) {
      tenantIdStorage.clearTenantId()
      setCurrentTenantId(null)
    }
  }, [isInitialized, isLoadingTenants, tenants, currentTenantId])

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
