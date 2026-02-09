'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Calculator, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useCalculationRules, useDeleteCalculationRule } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CalculationRuleDataTable,
  CalculationRuleFormSheet,
  CalculationRuleDetailSheet,
} from '@/components/calculation-rules'
import type { components } from '@/lib/api/types'

type CalculationRule = components['schemas']['CalculationRule']

export default function CalculationRulesPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['absence_types.manage'])
  const t = useTranslations('adminCalculationRules')

  const [search, setSearch] = React.useState('')
  const [activeOnly, setActiveOnly] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<CalculationRule | null>(null)
  const [viewItem, setViewItem] = React.useState<CalculationRule | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<CalculationRule | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const { data: rulesData, isLoading } = useCalculationRules({ enabled: !authLoading && !permLoading && canAccess })
  const deleteMutation = useDeleteCalculationRule()
  const rules = rulesData?.data ?? []

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const filteredItems = React.useMemo(() => {
    let filtered = rules

    if (activeOnly) {
      filtered = filtered.filter((rule) => rule.is_active)
    }

    if (search.trim()) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(
        (rule) =>
          rule.code.toLowerCase().includes(searchLower) ||
          rule.name.toLowerCase().includes(searchLower)
      )
    }

    return filtered
  }, [rules, search, activeOnly])

  const handleView = (item: CalculationRule) => {
    setViewItem(item)
  }

  const handleEdit = (item: CalculationRule) => {
    setEditItem(item)
    setViewItem(null)
  }

  const handleDelete = (item: CalculationRule) => {
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

  const hasFilters = Boolean(search) || activeOnly

  if (authLoading || permLoading) {
    return <CalculationRulesPageSkeleton />
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
          {t('newRule')}
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
          ? t('ruleCount', { count: filteredItems.length })
          : t('rulesCount', { count: filteredItems.length })}
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
            <CalculationRuleDataTable
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
      <CalculationRuleFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        rule={editItem}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <CalculationRuleDetailSheet
        ruleId={viewItem?.id ?? null}
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
        title={t('deleteRule')}
        description={
          deleteError
            ? deleteError
            : deleteItem
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
  hasFilters,
  onCreateClick,
}: {
  hasFilters: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminCalculationRules')
  return (
    <div className="text-center py-12 px-6">
      <Calculator className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addRule')}
        </Button>
      )}
    </div>
  )
}

function CalculationRulesPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

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
