'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, CalendarOff, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useAbsenceTypes, useDeleteAbsenceType } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AbsenceTypeDataTable,
  AbsenceTypeFormSheet,
  AbsenceTypeDetailSheet,
} from '@/components/absence-types'
import type { components } from '@/lib/api/types'

type AbsenceType = components['schemas']['AbsenceType']

const CATEGORY_OPTIONS = [
  { value: 'all', labelKey: 'allCategories' },
  { value: 'vacation', labelKey: 'categoryVacation' },
  { value: 'sick', labelKey: 'categorySick' },
  { value: 'personal', labelKey: 'categoryPersonal' },
  { value: 'unpaid', labelKey: 'categoryUnpaid' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'allStatuses' },
  { value: 'active', labelKey: 'active' },
  { value: 'inactive', labelKey: 'inactive' },
] as const

export default function AbsenceTypesPage() {
  const router = useRouter()
  const t = useTranslations('adminAbsenceTypes')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters
  const [search, setSearch] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [showSystem, setShowSystem] = React.useState(true)

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<AbsenceType | null>(null)
  const [viewItem, setViewItem] = React.useState<AbsenceType | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<AbsenceType | null>(null)

  // Fetch absence types
  const { data: absenceTypesData, isLoading } = useAbsenceTypes(!authLoading && isAdmin)

  // Delete mutation
  const deleteMutation = useDeleteAbsenceType()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const absenceTypes = absenceTypesData?.data ?? []

  // Filter client-side
  const filteredTypes = React.useMemo(() => {
    return absenceTypes.filter((t) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        if (
          !t.code?.toLowerCase().includes(searchLower) &&
          !t.name?.toLowerCase().includes(searchLower)
        ) {
          return false
        }
      }
      // Category filter
      if (categoryFilter !== 'all' && t.category !== categoryFilter) {
        return false
      }
      // Status filter
      if (statusFilter === 'active' && !t.is_active) return false
      if (statusFilter === 'inactive' && t.is_active) return false
      // System filter
      if (!showSystem && t.is_system) return false
      return true
    })
  }, [absenceTypes, search, categoryFilter, statusFilter, showSystem])

  const handleView = (type: AbsenceType) => {
    setViewItem(type)
  }

  const handleEdit = (type: AbsenceType) => {
    setEditItem(type)
    setViewItem(null)
  }

  const handleDelete = (type: AbsenceType) => {
    setDeleteItem(type)
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteItem.id },
      })
      setDeleteItem(null)
      setViewItem(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const hasFilters = Boolean(search || categoryFilter !== 'all' || statusFilter !== 'all' || !showSystem)

  const clearFilters = () => {
    setSearch('')
    setCategoryFilter('all')
    setStatusFilter('all')
    setShowSystem(true)
  }

  if (authLoading) {
    return <AbsenceTypesPageSkeleton />
  }

  if (!isAdmin) {
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
          {t('newAbsenceType')}
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

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey as Parameters<typeof t>[0])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
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

        <div className="flex items-center space-x-2">
          <Switch
            id="show-system"
            checked={showSystem}
            onCheckedChange={setShowSystem}
          />
          <Label htmlFor="show-system" className="text-sm">
            {t('showSystemTypes')}
          </Label>
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-2 h-4 w-4" />
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {/* Count display */}
      <div className="text-sm text-muted-foreground">
        {filteredTypes.length === 1
          ? t('absenceTypeCount', { count: filteredTypes.length })
          : t('absenceTypesCount', { count: filteredTypes.length })}
      </div>

      {/* Content */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : filteredTypes.length === 0 ? (
            <EmptyState
              hasFilters={hasFilters}
              onCreateClick={() => setCreateOpen(true)}
            />
          ) : (
            <AbsenceTypeDataTable
              absenceTypes={filteredTypes}
              isLoading={false}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <AbsenceTypeFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        absenceType={editItem}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <AbsenceTypeDetailSheet
        absenceTypeId={viewItem?.id ?? null}
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
        title={t('deleteAbsenceType')}
        description={
          deleteItem
            ? t('deleteDescription', { name: deleteItem.name, code: deleteItem.code })
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
  const t = useTranslations('adminAbsenceTypes')
  return (
    <div className="text-center py-12 px-6">
      <CalendarOff className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addAbsenceType')}
        </Button>
      )}
    </div>
  )
}

function AbsenceTypesPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Content */}
      <Skeleton className="h-[400px]" />
    </div>
  )
}
