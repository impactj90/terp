'use client'

import { Building2, Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTenant } from '@/providers/tenant-provider'
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

interface TenantSelectorProps {
  className?: string
}

/**
 * Tenant/company selector dropdown.
 * Allows users to switch between organizations.
 */
export function TenantSelector({ className }: TenantSelectorProps) {
  const { tenant, tenantId, tenants, isLoading, selectTenant } = useTenant()

  if (isLoading) {
    return <Skeleton className="h-9 w-[180px]" />
  }

  // Don't show selector if only one tenant
  if (tenants.length <= 1) {
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
              {tenant?.name ?? 'Select org...'}
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
        {tenants.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => selectTenant(t)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t.name}</span>
            </div>
            {t.id === tenantId && (
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
