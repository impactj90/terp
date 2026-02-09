'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Shield, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useTenants } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TenantDataTable,
  TenantFormSheet,
  TenantDetailSheet,
  TenantDeactivateDialog,
} from '@/components/tenants'
import type { components } from '@/lib/api/types'

type Tenant = components['schemas']['Tenant']

export default function TenantsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['tenants.manage'])
  const t = useTranslations('adminTenants')

  const [search, setSearch] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Tenant | null>(null)
  const [viewItem, setViewItem] = React.useState<Tenant | null>(null)
  const [deactivateItem, setDeactivateItem] = React.useState<Tenant | null>(null)

  const { data: tenantsResponse, isLoading } = useTenants({
    enabled: !authLoading && !permLoading && canAccess,
    params: { include_inactive: showInactive },
  })

  // Handle both array and wrapped response shapes
  const tenants: Tenant[] = React.useMemo(() => {
    if (!tenantsResponse) return []
    if (Array.isArray(tenantsResponse)) return tenantsResponse
    if (tenantsResponse && typeof tenantsResponse === 'object' && 'data' in tenantsResponse) {
      return (tenantsResponse as { data: Tenant[] }).data ?? []
    }
    return []
  }, [tenantsResponse])

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return tenants
    const searchLower = search.toLowerCase()
    return tenants.filter(
      (item) =>
        item.name.toLowerCase().includes(searchLower) ||
        item.slug.toLowerCase().includes(searchLower) ||
        (item.address_city && item.address_city.toLowerCase().includes(searchLower))
    )
  }, [tenants, search])

  const handleView = (item: Tenant) => {
    setViewItem(item)
  }

  const handleEdit = (item: Tenant) => {
    setEditItem(item)
    setViewItem(null)
  }

  const handleDeactivate = (item: Tenant) => {
    setDeactivateItem(item)
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const handleDeactivateSuccess = () => {
    setDeactivateItem(null)
    setViewItem(null)
  }

  const hasFilters = Boolean(search) || showInactive

  if (authLoading || permLoading) {
    return <TenantsPageSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newTenant')}
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:w-80"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="showInactive"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="showInactive" className="text-sm">{t('showInactive')}</Label>
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setShowInactive(false)
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {/* Item count */}
      <p className="text-sm text-muted-foreground">
        {filteredItems.length === 1
          ? t('countSingular', { count: filteredItems.length })
          : t('countPlural', { count: filteredItems.length })}
      </p>

      {/* Content */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <TenantDataTable
              items={filteredItems}
              isLoading={false}
              onView={handleView}
              onEdit={handleEdit}
              onDeactivate={handleDeactivate}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <TenantFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        tenant={editItem}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <TenantDetailSheet
        tenantId={viewItem?.id ?? null}
        open={!!viewItem}
        onOpenChange={(open) => {
          if (!open) {
            setViewItem(null)
          }
        }}
        onEdit={handleEdit}
        onDeactivate={handleDeactivate}
      />

      {/* Deactivate Confirmation */}
      <TenantDeactivateDialog
        tenant={deactivateItem}
        open={!!deactivateItem}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateItem(null)
          }
        }}
        onSuccess={handleDeactivateSuccess}
      />
    </div>
  )
}

function EmptyState({
  hasFilters,
  onCreateClick,
}: {
  hasFilters: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminTenants')
  return (
    <div className="text-center py-12 px-6">
      <Shield className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters ? t('emptyFilterHint') : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addTenant')}
        </Button>
      )}
    </div>
  )
}

function TenantsPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Content */}
      <Skeleton className="h-96" />
    </div>
  )
}
