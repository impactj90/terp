'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, FileText, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useMonthlyEvaluations,
  useDeleteMonthlyEvaluation,
  useSetDefaultMonthlyEvaluation,
} from '@/hooks/api/use-monthly-evaluations'
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
  MonthlyEvaluationDataTable,
  MonthlyEvaluationFormSheet,
  MonthlyEvaluationDetailSheet,
} from '@/components/monthly-evaluations'
import type { components } from '@/lib/api/types'

type MonthlyEvaluation = components['schemas']['MonthlyEvaluation']

const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'allStatuses' },
  { value: 'active', labelKey: 'active' },
  { value: 'inactive', labelKey: 'inactive' },
] as const

export default function MonthlyEvaluationsPage() {
  const router = useRouter()
  const t = useTranslations('adminMonthlyEvaluations')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['monthly_evaluations.manage'])

  // Filters
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  // Dialog/sheet state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<MonthlyEvaluation | null>(null)
  const [viewItem, setViewItem] = React.useState<MonthlyEvaluation | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<MonthlyEvaluation | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [setDefaultItem, setSetDefaultItem] = React.useState<MonthlyEvaluation | null>(null)
  const [setDefaultError, setSetDefaultError] = React.useState<string | null>(null)

  // Fetch monthly evaluation templates
  const { data: templatesData, isLoading } = useMonthlyEvaluations({
    enabled: !authLoading && !permLoading && canAccess,
  })

  // Mutations
  const deleteMutation = useDeleteMonthlyEvaluation()
  const setDefaultMutation = useSetDefaultMonthlyEvaluation()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  // Extract templates from wrapped response
  const templates = (templatesData as { items?: MonthlyEvaluation[] })?.items ?? []

  // Client-side filtering and sorting
  const filteredTemplates = React.useMemo(() => {
    const filtered = templates.filter((item) => {
      if (search) {
        const s = search.toLowerCase()
        if (
          !item.name?.toLowerCase().includes(s) &&
          !item.description?.toLowerCase().includes(s)
        ) {
          return false
        }
      }
      if (statusFilter === 'active' && !item.is_active) return false
      if (statusFilter === 'inactive' && item.is_active) return false
      return true
    })

    // Sort: default template first, then alphabetical by name
    filtered.sort((a, b) => {
      if (a.is_default && !b.is_default) return -1
      if (!a.is_default && b.is_default) return 1
      return (a.name || '').localeCompare(b.name || '')
    })

    return filtered
  }, [templates, search, statusFilter])

  const handleView = (item: MonthlyEvaluation) => {
    setViewItem(item)
  }

  const handleEdit = (item: MonthlyEvaluation) => {
    setEditItem(item)
    setViewItem(null)
  }

  const handleDelete = (item: MonthlyEvaluation) => {
    setDeleteItem(item)
    setDeleteError(null)
  }

  const handleSetDefault = (item: MonthlyEvaluation) => {
    setSetDefaultItem(item)
    setSetDefaultError(null)
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
        setDeleteError(t('deleteDefaultError'))
      } else {
        setDeleteError(apiError.detail ?? apiError.message ?? t('failedDelete'))
      }
    }
  }

  const handleConfirmSetDefault = async () => {
    if (!setDefaultItem) return
    setSetDefaultError(null)
    try {
      await setDefaultMutation.mutateAsync({
        path: { id: setDefaultItem.id },
      })
      setSetDefaultItem(null)
      setViewItem(null)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setSetDefaultError(apiError.detail ?? apiError.message ?? t('failedSetDefault'))
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
    return <MonthlyEvaluationsPageSkeleton />
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
          {t('newTemplate')}
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
        {filteredTemplates.length === 1
          ? t('templateCount', { count: filteredTemplates.length })
          : t('templatesCount', { count: filteredTemplates.length })}
      </div>

      {/* Content */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <EmptyState
              hasFilters={hasFilters}
              onCreateClick={() => setCreateOpen(true)}
            />
          ) : (
            <MonthlyEvaluationDataTable
              items={filteredTemplates}
              isLoading={false}
              onView={handleView}
              onEdit={handleEdit}
              onSetDefault={handleSetDefault}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <MonthlyEvaluationFormSheet
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
      <MonthlyEvaluationDetailSheet
        itemId={viewItem?.id ?? null}
        open={!!viewItem}
        onOpenChange={(open) => {
          if (!open) {
            setViewItem(null)
          }
        }}
        onEdit={handleEdit}
        onSetDefault={handleSetDefault}
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
        title={t('deleteTitle')}
        description={
          deleteError
            ? deleteError
            : deleteItem
              ? t('deleteDescription', { name: deleteItem.name })
              : ''
        }
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />

      {/* Set Default Confirmation */}
      <ConfirmDialog
        open={!!setDefaultItem}
        onOpenChange={(open) => {
          if (!open) {
            setSetDefaultItem(null)
            setSetDefaultError(null)
          }
        }}
        title={t('setDefaultTitle')}
        description={
          setDefaultError
            ? setDefaultError
            : setDefaultItem
              ? t('setDefaultDescription', { name: setDefaultItem.name })
              : ''
        }
        confirmLabel={t('setDefault')}
        variant="default"
        isLoading={setDefaultMutation.isPending}
        onConfirm={handleConfirmSetDefault}
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
  const t = useTranslations('adminMonthlyEvaluations')
  return (
    <div className="text-center py-12 px-6">
      <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addTemplate')}
        </Button>
      )}
    </div>
  )
}

function MonthlyEvaluationsPageSkeleton() {
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
