'use client'

import { useState, useEffect } from 'react'
import { Building2, Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApiQuery } from '@/hooks'
import { tenantIdStorage } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type Tenant = components['schemas']['Tenant']

interface TenantSelectorProps {
  className?: string
}

/**
 * Tenant/company selector dropdown.
 * Allows users to switch between organizations.
 */
export function TenantSelector({ className }: TenantSelectorProps) {
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null)

  // Load current tenant from storage on mount
  useEffect(() => {
    const stored = tenantIdStorage.getTenantId()
    setCurrentTenantId(stored)
  }, [])

  // Fetch list of tenants
  const { data: tenantsData, isLoading } = useApiQuery('/tenants', {
    enabled: true,
  })

  const tenants = tenantsData ?? []
  const currentTenant = tenants.find((t) => t.id === currentTenantId)

  const handleSelectTenant = (tenant: Tenant) => {
    tenantIdStorage.setTenantId(tenant.id)
    setCurrentTenantId(tenant.id)
    // Reload the page to refresh all data with new tenant context
    window.location.reload()
  }

  if (isLoading) {
    return <Skeleton className="h-9 w-[180px]" />
  }

  // Don't show selector if only one tenant
  if (tenants.length <= 1) {
    const onlyTenant = tenants[0]
    if (onlyTenant && !currentTenantId) {
      // Auto-select the only tenant
      handleSelectTenant(onlyTenant)
    }
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn('w-[180px] justify-between', className)}
          aria-label="Select organization"
        >
          <div className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {currentTenant?.name ?? 'Select org...'}
            </span>
          </div>
          <ChevronsUpDown
            className="ml-2 h-4 w-4 shrink-0 opacity-50"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() => handleSelectTenant(tenant)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{tenant.name}</span>
            </div>
            {tenant.id === currentTenantId && (
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
