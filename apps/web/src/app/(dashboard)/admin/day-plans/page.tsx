'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Calendar, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
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
  const isAdmin = useHasRole(['admin'])

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
    enabled: !authLoading && isAdmin,
  })

  // Delete mutation
  const deleteMutation = useDeleteDayPlan()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

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

  if (authLoading) {
    return <DayPlansPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Day Plans</h1>
          <p className="text-muted-foreground">
            Manage day plan templates for employee schedules
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Day Plan
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code or name..."
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
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
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
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="flextime">Flextime</SelectItem>
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
            Clear filters
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
        title="Delete Day Plan"
        description={
          deleteDayPlan
            ? `Are you sure you want to delete "${deleteDayPlan.name}" (${deleteDayPlan.code})? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
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
  return (
    <div className="text-center py-12 px-6">
      <Calendar className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">No day plans found</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? 'Try adjusting your search or filters'
          : 'Get started by creating your first day plan'}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Create Day Plan
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
