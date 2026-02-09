'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Calendar, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useDayPlans, useDeleteDayPlan } from '@/hooks/api'
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
import { DayPlanDataTable } from '@/components/day-plans/day-plan-data-table'
import { DayPlanFormSheet } from '@/components/day-plans/day-plan-form-sheet'
import { DayPlanDetailSheet } from '@/components/day-plans/day-plan-detail-sheet'
import { CopyDayPlanDialog } from '@/components/day-plans/copy-day-plan-dialog'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']

export default function DayPlansPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['day_plans.manage'])
  const t = useTranslations('adminDayPlans')

  // Filters
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)
  const [typeFilter, setTypeFilter] = React.useState<'fixed' | 'flextime' | undefined>(undefined)

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editDayPlan, setEditDayPlan] = React.useState<DayPlan | null>(null)
  const [viewDayPlan, setViewDayPlan] = React.useState<DayPlan | null>(null)
  const [deleteDayPlan, setDeleteDayPlan] = React.useState<DayPlan | null>(null)
  const [copyDayPlan, setCopyDayPlan] = React.useState<DayPlan | null>(null)

  // Fetch day plans
  const { data, isLoading, isFetching } = useDayPlans({
    active: activeFilter,
    planType: typeFilter,
    enabled: !authLoading && !permLoading && canAccess,
  })

  // Delete mutation
  const deleteMutation = useDeleteDayPlan()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const dayPlans = React.useMemo(() => {
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

  const handleView = (dayPlan: DayPlan) => {
    setViewDayPlan(dayPlan)
  }

  const handleEdit = (dayPlan: DayPlan) => {
    setEditDayPlan(dayPlan)
    setViewDayPlan(null)
  }

  const handleDelete = (dayPlan: DayPlan) => {
    setDeleteDayPlan(dayPlan)
  }

  const handleCopy = (dayPlan: DayPlan) => {
    setCopyDayPlan(dayPlan)
  }

  const handleConfirmDelete = async () => {
    if (!deleteDayPlan) return
    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteDayPlan.id },
      })
      setDeleteDayPlan(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditDayPlan(null)
  }

  const hasFilters = Boolean(search) || activeFilter !== undefined || typeFilter !== undefined

  if (authLoading || permLoading) {
    return <DayPlansPageSkeleton />
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
          {t('newDayPlan')}
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

        <Select
          value={typeFilter ?? 'all'}
          onValueChange={(value) => {
            if (value === 'all') setTypeFilter(undefined)
            else setTypeFilter(value as 'fixed' | 'flextime')
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Plan Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allTypes')}</SelectItem>
            <SelectItem value="fixed">{t('fixed')}</SelectItem>
            <SelectItem value="flextime">{t('flextime')}</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setActiveFilter(undefined)
              setTypeFilter(undefined)
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
          ) : dayPlans.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <DayPlanDataTable
              dayPlans={dayPlans}
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
      <DayPlanFormSheet
        open={createOpen || !!editDayPlan}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditDayPlan(null)
          }
        }}
        dayPlan={editDayPlan}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <DayPlanDetailSheet
        dayPlanId={viewDayPlan?.id ?? null}
        open={!!viewDayPlan}
        onOpenChange={(open) => {
          if (!open) setViewDayPlan(null)
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCopy={handleCopy}
      />

      {/* Copy Dialog */}
      <CopyDayPlanDialog
        dayPlan={copyDayPlan}
        open={!!copyDayPlan}
        onOpenChange={(open) => {
          if (!open) setCopyDayPlan(null)
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteDayPlan}
        onOpenChange={(open) => {
          if (!open) setDeleteDayPlan(null)
        }}
        title={t('deleteDayPlan')}
        description={
          deleteDayPlan
            ? t('deleteDescription', { name: deleteDayPlan.name, code: deleteDayPlan.code })
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
  const t = useTranslations('adminDayPlans')
  return (
    <div className="text-center py-12 px-6">
      <Calendar className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('createDayPlan')}
        </Button>
      )}
    </div>
  )
}

function DayPlansPageSkeleton() {
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
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
