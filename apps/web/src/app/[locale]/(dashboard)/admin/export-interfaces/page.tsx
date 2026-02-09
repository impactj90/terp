'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Settings2, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useExportInterfaces,
  useDeleteExportInterface,
} from '@/hooks/api/use-export-interfaces'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ExportInterfaceDataTable,
  ExportInterfaceFormSheet,
  ExportInterfaceDetailSheet,
  AccountMappingDialog,
} from '@/components/export-interfaces'
import type { components } from '@/lib/api/types'

type ExportInterface = components['schemas']['ExportInterface']

const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'allStatuses' },
  { value: 'active', labelKey: 'active' },
  { value: 'inactive', labelKey: 'inactive' },
] as const

export default function ExportInterfacesPage() {
  const router = useRouter()
  const t = useTranslations('adminExportInterfaces')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['payroll.manage'])

  // Filters
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  // Dialog/sheet state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<ExportInterface | null>(null)
  const [viewItem, setViewItem] = React.useState<ExportInterface | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<ExportInterface | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [accountMappingItem, setAccountMappingItem] = React.useState<ExportInterface | null>(null)

  // Fetch export interfaces
  const { data: interfacesData, isLoading } = useExportInterfaces({
    enabled: !authLoading && !permLoading && canAccess,
  })

  // Delete mutation
  const deleteMutation = useDeleteExportInterface()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  // Extract interfaces from wrapped response
  const interfaces = (interfacesData as { data?: ExportInterface[] })?.data ?? []

  // Client-side filtering
  const filteredInterfaces = React.useMemo(() => {
    return interfaces.filter((item) => {
      if (search) {
        const s = search.toLowerCase()
        if (
          !item.name?.toLowerCase().includes(s) &&
          !String(item.interface_number).includes(s)
        ) {
          return false
        }
      }
      if (statusFilter === 'active' && !item.is_active) return false
      if (statusFilter === 'inactive' && item.is_active) return false
      return true
    })
  }, [interfaces, search, statusFilter])

  const handleView = (item: ExportInterface) => {
    setViewItem(item)
  }

  const handleEdit = (item: ExportInterface) => {
    setEditItem(item)
    setViewItem(null)
  }

  const handleDelete = (item: ExportInterface) => {
    setDeleteItem(item)
    setDeleteError(null)
  }

  const handleManageAccounts = (item: ExportInterface) => {
    setAccountMappingItem(item)
    setViewItem(null)
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteItem.id },
      })
      setDeleteItem(null)
      setViewItem(null)
    } catch (err) {
      const apiError = err as { status?: number; detail?: string; message?: string }
      if (apiError.status === 409) {
        setDeleteError(t('deleteInUse'))
      } else {
        setDeleteError(apiError.detail ?? apiError.message ?? t('failedDelete'))
      }
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const hasFilters = Boolean(search || statusFilter !== 'all')

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
  }

  if (authLoading || permLoading) {
    return <ExportInterfacesPageSkeleton />
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
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newInterface')}
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:w-64"
        />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey as Parameters<typeof t>[0])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-2 h-4 w-4" />
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {/* Count display */}
      <div className="text-sm text-muted-foreground">
        {filteredInterfaces.length === 1
          ? t('interfaceCount', { count: filteredInterfaces.length })
          : t('interfacesCount', { count: filteredInterfaces.length })}
      </div>

      {/* Content */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : filteredInterfaces.length === 0 ? (
            <EmptyState
              hasFilters={hasFilters}
              onCreateClick={() => setCreateOpen(true)}
            />
          ) : (
            <ExportInterfaceDataTable
              items={filteredInterfaces}
              isLoading={false}
              onView={handleView}
              onEdit={handleEdit}
              onManageAccounts={handleManageAccounts}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <ExportInterfaceFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        item={editItem}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <ExportInterfaceDetailSheet
        itemId={viewItem?.id ?? null}
        open={!!viewItem}
        onOpenChange={(open) => {
          if (!open) {
            setViewItem(null)
          }
        }}
        onEdit={handleEdit}
        onManageAccounts={handleManageAccounts}
        onDelete={handleDelete}
      />

      {/* Account Mapping Dialog */}
      <AccountMappingDialog
        item={accountMappingItem}
        open={!!accountMappingItem}
        onOpenChange={(open) => {
          if (!open) {
            setAccountMappingItem(null)
          }
        }}
        onSuccess={() => {
          // Keep dialog open after success to show success message
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteItem(null)
            setDeleteError(null)
          }
        }}
        title={t('deleteTitle')}
        description={
          deleteError
            ? deleteError
            : deleteItem
              ? t('deleteDescription', {
                  name: deleteItem.name,
                  number: deleteItem.interface_number,
                })
              : ''
        }
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function EmptyState({
  hasFilters = false,
  onCreateClick,
}: {
  hasFilters?: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminExportInterfaces')
  return (
    <div className="text-center py-12 px-6">
      <Settings2 className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addInterface')}
        </Button>
      )}
    </div>
  )
}

function ExportInterfacesPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Content */}
      <Skeleton className="h-[400px]" />
    </div>
  )
}
