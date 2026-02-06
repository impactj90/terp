'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Layers, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useShifts, useDeleteShift } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ShiftDataTable,
  ShiftFormSheet,
  ShiftDetailSheet,
  ShiftPlanningBoard,
} from '@/components/shift-planning'
import type { components } from '@/lib/api/types'

type Shift = components['schemas']['Shift']
type ShiftPlanningTab = 'shifts' | 'planning-board'

export default function ShiftPlanningPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])
  const t = useTranslations('shiftPlanning')

  const [activeTab, setActiveTab] = React.useState<ShiftPlanningTab>('shifts')

  // Shifts tab state
  const [search, setSearch] = React.useState('')
  const [activeOnly, setActiveOnly] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Shift | null>(null)
  const [viewItem, setViewItem] = React.useState<Shift | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<Shift | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const { data: shiftsData, isLoading } = useShifts({ enabled: !authLoading && isAdmin })
  const deleteMutation = useDeleteShift()
  const shifts = shiftsData?.data ?? []

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const filteredItems = React.useMemo(() => {
    let filtered = shifts

    if (activeOnly) {
      filtered = filtered.filter((shift) => shift.is_active)
    }

    if (search.trim()) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(
        (shift) =>
          shift.code.toLowerCase().includes(searchLower) ||
          shift.name.toLowerCase().includes(searchLower)
      )
    }

    return filtered
  }, [shifts, search, activeOnly])

  const handleView = (item: Shift) => {
    setViewItem(item)
  }

  const handleEdit = (item: Shift) => {
    setEditItem(item)
    setViewItem(null)
  }

  const handleDelete = (item: Shift) => {
    setDeleteItem(item)
    setDeleteError(null)
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
      setDeleteItem(null)
    } catch (err) {
      const apiError = err as { status?: number; detail?: string; message?: string }
      if (apiError.status === 409) {
        setDeleteError(t('deleteShiftInUse'))
      } else {
        setDeleteError(apiError.detail ?? apiError.message ?? t('failedDelete'))
      }
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const hasFilters = Boolean(search) || activeOnly

  if (authLoading) {
    return <ShiftPlanningPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ShiftPlanningTab)}>
        <TabsList>
          <TabsTrigger value="shifts">{t('tabShifts')}</TabsTrigger>
          <TabsTrigger value="planning-board">{t('tabPlanningBoard')}</TabsTrigger>
        </TabsList>

        {/* Shifts Tab */}
        <TabsContent value="shifts" className="space-y-6">
          {/* Shifts toolbar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('newShift')}
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
                id="activeOnly"
                checked={activeOnly}
                onCheckedChange={setActiveOnly}
              />
              <Label htmlFor="activeOnly" className="text-sm cursor-pointer">
                {t('showActiveOnly')}
              </Label>
            </div>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setActiveOnly(false)
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
              ? t('shiftCount', { count: filteredItems.length })
              : t('shiftsCount', { count: filteredItems.length })}
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
                <ShiftDataTable
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
          <ShiftFormSheet
            open={createOpen || !!editItem}
            onOpenChange={(open) => {
              if (!open) {
                setCreateOpen(false)
                setEditItem(null)
              }
            }}
            shift={editItem}
            onSuccess={handleFormSuccess}
          />

          {/* Detail View */}
          <ShiftDetailSheet
            shiftId={viewItem?.id ?? null}
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
                setDeleteError(null)
              }
            }}
            title={t('deleteShift')}
            description={
              deleteError
                ? deleteError
                : deleteItem
                  ? t('deleteShiftDescription', { name: deleteItem.name, code: deleteItem.code })
                  : ''
            }
            confirmLabel={t('delete')}
            variant="destructive"
            isLoading={deleteMutation.isPending}
            onConfirm={handleConfirmDelete}
          />
        </TabsContent>

        {/* Planning Board Tab */}
        <TabsContent value="planning-board" className="space-y-6">
          <ShiftPlanningBoard enabled={activeTab === 'planning-board'} />
        </TabsContent>
      </Tabs>
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
  const t = useTranslations('shiftPlanning')
  return (
    <div className="text-center py-12 px-6">
      <Layers className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addShift')}
        </Button>
      )}
    </div>
  )
}

function ShiftPlanningPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Tabs */}
      <Skeleton className="h-10 w-64" />

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Content */}
      <Skeleton className="h-96" />
    </div>
  )
}
