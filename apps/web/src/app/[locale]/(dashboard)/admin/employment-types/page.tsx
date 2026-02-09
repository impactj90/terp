'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Briefcase, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useEmploymentTypes, useDeleteEmploymentType } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmploymentTypeDataTable, EmploymentTypeFormSheet, EmploymentTypeDetailSheet } from '@/components/employment-types'
import type { components } from '@/lib/api/types'

type EmploymentType = components['schemas']['EmploymentType']

export default function EmploymentTypesPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['employees.view'])
  const t = useTranslations('adminEmploymentTypes')

  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<EmploymentType | null>(null)
  const [viewItem, setViewItem] = React.useState<EmploymentType | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<EmploymentType | null>(null)

  const { data: employmentTypesData, isLoading } = useEmploymentTypes({ enabled: !authLoading && !permLoading && canAccess })
  const deleteMutation = useDeleteEmploymentType()
  const employmentTypes = employmentTypesData?.data ?? []

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return employmentTypes
    const searchLower = search.toLowerCase()
    return employmentTypes.filter(
      (et) =>
        et.code.toLowerCase().includes(searchLower) ||
        et.name.toLowerCase().includes(searchLower)
    )
  }, [employmentTypes, search])

  const handleView = (item: EmploymentType) => {
    setViewItem(item)
  }

  const handleEdit = (item: EmploymentType) => {
    setEditItem(item)
    setViewItem(null)
  }

  const handleDelete = (item: EmploymentType) => {
    setDeleteItem(item)
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
      setDeleteItem(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const hasFilters = Boolean(search)

  if (authLoading || permLoading) {
    return <EmploymentTypesPageSkeleton />
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
          {t('newEmploymentType')}
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

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
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
            <EmploymentTypeDataTable
              items={filteredItems}
              isLoading={false}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <EmploymentTypeFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        employmentType={editItem}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <EmploymentTypeDetailSheet
        employmentTypeId={viewItem?.id ?? null}
        open={!!viewItem}
        onOpenChange={(open) => {
          if (!open) {
            setViewItem(null)
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteItem(null)
          }
        }}
        title={t('deleteEmploymentType')}
        description={
          deleteItem
            ? t('deleteDescription', { name: deleteItem.name })
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
  hasFilters,
  onCreateClick,
}: {
  hasFilters: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminEmploymentTypes')
  return (
    <div className="text-center py-12 px-6">
      <Briefcase className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addEmploymentType')}
        </Button>
      )}
    </div>
  )
}

function EmploymentTypesPageSkeleton() {
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
      </div>

      {/* Content */}
      <Skeleton className="h-96" />
    </div>
  )
}
