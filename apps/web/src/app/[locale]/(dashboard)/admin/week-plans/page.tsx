'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, CalendarDays, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useWeekPlans, useDeleteWeekPlan } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { WeekPlanDataTable } from '@/components/week-plans/week-plan-data-table'
import { WeekPlanFormSheet } from '@/components/week-plans/week-plan-form-sheet'
import { WeekPlanDetailSheet } from '@/components/week-plans/week-plan-detail-sheet'
import { CopyWeekPlanDialog } from '@/components/week-plans/copy-week-plan-dialog'
import type { components } from '@/lib/api/types'

type WeekPlan = components['schemas']['WeekPlan']

export default function WeekPlansPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['week_plans.manage'])
  const t = useTranslations('adminWeekPlans')

  // Filters
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editWeekPlan, setEditWeekPlan] = React.useState<WeekPlan | null>(null)
  const [viewWeekPlan, setViewWeekPlan] = React.useState<WeekPlan | null>(null)
  const [deleteWeekPlan, setDeleteWeekPlan] = React.useState<WeekPlan | null>(null)
  const [copyWeekPlan, setCopyWeekPlan] = React.useState<WeekPlan | null>(null)

  // Fetch week plans
  const { data, isLoading, isFetching } = useWeekPlans({
    active: activeFilter,
    enabled: !authLoading && !permLoading && canAccess,
  })

  // Delete mutation
  const deleteMutation = useDeleteWeekPlan()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const weekPlans = React.useMemo(() => {
    let plans = data?.data ?? []
    if (search) {
      const searchLower = search.toLowerCase()
      plans = plans.filter(
        (p) =>
          p.code.toLowerCase().includes(searchLower) ||
          p.name.toLowerCase().includes(searchLower)
      )
    }
    return plans
  }, [data?.data, search])

  const handleView = (weekPlan: WeekPlan) => {
    setViewWeekPlan(weekPlan)
  }

  const handleEdit = (weekPlan: WeekPlan) => {
    setEditWeekPlan(weekPlan)
    setViewWeekPlan(null)
  }

  const handleDelete = (weekPlan: WeekPlan) => {
    setDeleteWeekPlan(weekPlan)
  }

  const handleCopy = (weekPlan: WeekPlan) => {
    setCopyWeekPlan(weekPlan)
  }

  const handleConfirmDelete = async () => {
    if (!deleteWeekPlan) return
    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteWeekPlan.id },
      })
      setDeleteWeekPlan(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditWeekPlan(null)
  }

  const hasFilters = Boolean(search) || activeFilter !== undefined

  if (authLoading || permLoading) {
    return <WeekPlansPageSkeleton />
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
          {t('newWeekPlan')}
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:w-64"
          disabled={isFetching}
        />

        <Select
          value={activeFilter === undefined ? 'all' : activeFilter ? 'active' : 'inactive'}
          onValueChange={(value) => {
            if (value === 'all') setActiveFilter(undefined)
            else setActiveFilter(value === 'active')
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatus')}</SelectItem>
            <SelectItem value="active">{t('active')}</SelectItem>
            <SelectItem value="inactive">{t('inactive')}</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setActiveFilter(undefined)
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : weekPlans.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <WeekPlanDataTable
              weekPlans={weekPlans}
              isLoading={isLoading}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCopy={handleCopy}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <WeekPlanFormSheet
        open={createOpen || !!editWeekPlan}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditWeekPlan(null)
          }
        }}
        weekPlan={editWeekPlan}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <WeekPlanDetailSheet
        weekPlanId={viewWeekPlan?.id ?? null}
        open={!!viewWeekPlan}
        onOpenChange={(open) => {
          if (!open) setViewWeekPlan(null)
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCopy={handleCopy}
      />

      {/* Copy Dialog */}
      <CopyWeekPlanDialog
        weekPlan={copyWeekPlan}
        open={!!copyWeekPlan}
        onOpenChange={(open) => {
          if (!open) setCopyWeekPlan(null)
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteWeekPlan}
        onOpenChange={(open) => {
          if (!open) setDeleteWeekPlan(null)
        }}
        title={t('deleteWeekPlan')}
        description={
          deleteWeekPlan
            ? t('deleteDescription', { name: deleteWeekPlan.name, code: deleteWeekPlan.code })
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
  const t = useTranslations('adminWeekPlans')
  return (
    <div className="text-center py-12 px-6">
      <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('createWeekPlan')}
        </Button>
      )}
    </div>
  )
}

function WeekPlansPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
