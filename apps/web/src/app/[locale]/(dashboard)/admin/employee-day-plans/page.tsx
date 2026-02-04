'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useEmployees, useDepartments, useEmployeeDayPlans } from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, getWeekRange, getMonthRange } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

import { DayPlanCalendarGrid } from '@/components/employee-day-plans/day-plan-calendar-grid'
import { DayPlanGridToolbar } from '@/components/employee-day-plans/day-plan-grid-toolbar'
import { DayPlanGridSkeleton } from '@/components/employee-day-plans/day-plan-grid-skeleton'
import { DayPlanCellEditPopover } from '@/components/employee-day-plans/day-plan-cell-edit-popover'
import { BulkAssignDialog } from '@/components/employee-day-plans/bulk-assign-dialog'
import { DeleteRangeDialog } from '@/components/employee-day-plans/delete-range-dialog'

type EmployeeDayPlan = components['schemas']['EmployeeDayPlan']
type ViewMode = 'week' | 'twoWeeks' | 'month'

export default function EmployeeDayPlansPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])
  const t = useTranslations('employeeDayPlans')

  // Redirect non-admins
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  // View mode and date range
  const [viewMode, setViewMode] = React.useState<ViewMode>('week')
  const defaultRange = React.useMemo(() => getWeekRange(new Date()), [])
  const [rangeStart, setRangeStart] = React.useState<Date>(defaultRange.start)
  const [rangeEnd, setRangeEnd] = React.useState<Date>(defaultRange.end)

  // Filters
  const [search, setSearch] = React.useState('')
  const [departmentId, setDepartmentId] = React.useState<string | undefined>(
    undefined
  )

  // Dialog state
  const [bulkAssignOpen, setBulkAssignOpen] = React.useState(false)
  const [deleteRangeOpen, setDeleteRangeOpen] = React.useState(false)

  // Cell edit dialog state
  const [editCell, setEditCell] = React.useState<{
    employeeId: string
    employeeName: string
    date: Date
    existingPlan: EmployeeDayPlan | null
  } | null>(null)

  // Compute dates array from range
  const dates = React.useMemo(() => {
    const result: Date[] = []
    const current = new Date(rangeStart)
    while (current <= rangeEnd) {
      result.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return result
  }, [rangeStart, rangeEnd])

  // Handle range navigation
  const handleRangeChange = (start: Date, end: Date) => {
    setRangeStart(start)
    setRangeEnd(end)
  }

  // Handle view mode change (recalculate range)
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    const today = new Date()
    if (mode === 'week') {
      const { start, end } = getWeekRange(today)
      setRangeStart(start)
      setRangeEnd(end)
    } else if (mode === 'twoWeeks') {
      const { start } = getWeekRange(today)
      const end = new Date(start)
      end.setDate(start.getDate() + 13)
      setRangeStart(start)
      setRangeEnd(end)
    } else {
      const { start, end } = getMonthRange(today)
      setRangeStart(start)
      setRangeEnd(end)
    }
  }

  // Fetch employees (for grid rows)
  const { data: employeesData, isLoading: employeesLoading } = useEmployees({
    limit: 200,
    departmentId,
    search: search || undefined,
    enabled: !authLoading && isAdmin,
  })
  const employees = employeesData?.data ?? []

  // Fetch departments (for filter dropdown)
  const { data: departmentsData } = useDepartments({
    active: true,
    enabled: !authLoading && isAdmin,
  })
  const departments = (departmentsData?.data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
  }))

  // Fetch employee day plans for the visible range
  const {
    data: dayPlansData,
    isLoading: dayPlansLoading,
    isFetching,
  } = useEmployeeDayPlans({
    from: formatDate(rangeStart),
    to: formatDate(rangeEnd),
    limit: 10000,
    enabled: !authLoading && isAdmin,
  })
  // Backend returns { data: [...] } not { items: [...] }
  const dayPlanAssignments = ((dayPlansData as Record<string, unknown>)?.data as EmployeeDayPlan[]) ?? []

  // Cell click handler
  const handleCellClick = (
    employeeId: string,
    date: Date,
    existingPlan: EmployeeDayPlan | null
  ) => {
    const employee = employees.find((e) => e.id === employeeId)
    const employeeName = employee
      ? `${employee.last_name}, ${employee.first_name}`
      : ''
    setEditCell({ employeeId, employeeName, date, existingPlan })
  }

  if (authLoading) return <EmployeeDayPlansPageSkeleton />
  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Toolbar */}
      <DayPlanGridToolbar
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onRangeChange={handleRangeChange}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        search={search}
        onSearchChange={setSearch}
        departmentId={departmentId}
        onDepartmentChange={setDepartmentId}
        departments={departments}
        onBulkAssign={() => setBulkAssignOpen(true)}
        onDeleteRange={() => setDeleteRangeOpen(true)}
        isFetching={isFetching}
      />

      {/* Grid */}
      <Card>
        <CardContent className="p-0">
          <DayPlanCalendarGrid
            employees={employees}
            dayPlanAssignments={dayPlanAssignments}
            dates={dates}
            onCellClick={handleCellClick}
            isLoading={employeesLoading || dayPlansLoading}
          />
        </CardContent>
      </Card>

      {/* Cell edit dialog */}
      {editCell && (
        <DayPlanCellEditPopover
          open={!!editCell}
          onOpenChange={(open) => {
            if (!open) setEditCell(null)
          }}
          employeeId={editCell.employeeId}
          employeeName={editCell.employeeName}
          date={editCell.date}
          existingPlan={editCell.existingPlan}
          onSuccess={() => setEditCell(null)}
        />
      )}

      {/* Bulk assign dialog */}
      <BulkAssignDialog
        open={bulkAssignOpen}
        onOpenChange={setBulkAssignOpen}
      />

      {/* Delete range dialog */}
      <DeleteRangeDialog
        open={deleteRangeOpen}
        onOpenChange={setDeleteRangeOpen}
      />
    </div>
  )
}

function EmployeeDayPlansPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-9 w-10" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-10" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <DayPlanGridSkeleton rows={8} columns={7} />
    </div>
  )
}
