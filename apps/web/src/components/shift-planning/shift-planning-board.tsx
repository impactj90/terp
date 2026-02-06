'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft, ChevronRight, Loader2, CalendarPlus, Trash2 } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  formatDate,
  formatDisplayDate,
  getWeekRange,
  getMonthRange,
  isWeekend,
  isToday,
} from '@/lib/time-utils'
import {
  useEmployees,
  useDepartments,
  useShifts,
  useEmployeeDayPlans,
  useBulkCreateEmployeeDayPlans,
} from '@/hooks/api'
import { ShiftPalette } from './shift-palette'
import { ShiftAssignmentFormDialog } from './shift-assignment-form-dialog'
import { BulkAssignDialog } from './bulk-assign-dialog'
import { DeleteRangeDialog } from './delete-range-dialog'
import type { components } from '@/lib/api/types'

type Shift = components['schemas']['Shift']

interface EmployeeDayPlan {
  id: string
  tenant_id: string
  employee_id: string
  plan_date: string
  day_plan_id?: string
  shift_id?: string
  source: 'tariff' | 'manual' | 'holiday'
  notes?: string
  day_plan?: { id: string; code: string; name: string }
  shift?: Shift
}

type ViewMode = 'week' | 'twoWeeks' | 'month'

interface ShiftPlanningBoardProps {
  enabled: boolean
}

function getShiftedRange(
  rangeStart: Date,
  viewMode: ViewMode,
  direction: 'prev' | 'next'
): { start: Date; end: Date } {
  const multiplier = direction === 'next' ? 1 : -1

  if (viewMode === 'week') {
    const newStart = new Date(rangeStart)
    newStart.setDate(newStart.getDate() + 7 * multiplier)
    const newEnd = new Date(newStart)
    newEnd.setDate(newStart.getDate() + 6)
    return { start: newStart, end: newEnd }
  }

  if (viewMode === 'twoWeeks') {
    const newStart = new Date(rangeStart)
    newStart.setDate(newStart.getDate() + 14 * multiplier)
    const newEnd = new Date(newStart)
    newEnd.setDate(newStart.getDate() + 13)
    return { start: newStart, end: newEnd }
  }

  // month mode
  const refDate = new Date(rangeStart)
  refDate.setMonth(refDate.getMonth() + multiplier)
  return getMonthRange(refDate)
}

function getTodayRange(viewMode: ViewMode): { start: Date; end: Date } {
  const today = new Date()
  if (viewMode === 'week') {
    return getWeekRange(today)
  }
  if (viewMode === 'twoWeeks') {
    const { start } = getWeekRange(today)
    const end = new Date(start)
    end.setDate(start.getDate() + 13)
    return { start, end }
  }
  return getMonthRange(today)
}

export function ShiftPlanningBoard({ enabled }: ShiftPlanningBoardProps) {
  const t = useTranslations('shiftPlanning')
  const locale = useLocale()

  // View mode and date range
  const [viewMode, setViewMode] = React.useState<ViewMode>('week')
  const defaultRange = React.useMemo(() => getWeekRange(new Date()), [])
  const [rangeStart, setRangeStart] = React.useState<Date>(defaultRange.start)
  const [rangeEnd, setRangeEnd] = React.useState<Date>(defaultRange.end)

  // Filters
  const [search, setSearch] = React.useState('')
  const [departmentId, setDepartmentId] = React.useState<string | undefined>(undefined)

  // Dialog state
  const [editCell, setEditCell] = React.useState<{
    employeeId: string
    employeeName: string
    date: Date
    existingPlan: EmployeeDayPlan | null
    preselectedShiftId?: string
  } | null>(null)

  // Bulk/delete dialog state
  const [bulkAssignOpen, setBulkAssignOpen] = React.useState(false)
  const [deleteRangeOpen, setDeleteRangeOpen] = React.useState(false)

  // Drag state
  const [activeShift, setActiveShift] = React.useState<Shift | null>(null)

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

  // Navigation handlers
  const handlePrev = () => {
    const { start, end } = getShiftedRange(rangeStart, viewMode, 'prev')
    setRangeStart(start)
    setRangeEnd(end)
  }

  const handleNext = () => {
    const { start, end } = getShiftedRange(rangeStart, viewMode, 'next')
    setRangeStart(start)
    setRangeEnd(end)
  }

  const handleToday = () => {
    const { start, end } = getTodayRange(viewMode)
    setRangeStart(start)
    setRangeEnd(end)
  }

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

  // Data fetching
  const { data: employeesData, isLoading: employeesLoading } = useEmployees({
    limit: 200,
    departmentId,
    search: search || undefined,
    enabled,
  })
  const employees = employeesData?.data ?? []

  const { data: departmentsData } = useDepartments({
    active: true,
    enabled,
  })
  const departments = (departmentsData?.data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
  }))

  const {
    data: shiftsData,
    isLoading: shiftsLoading,
  } = useShifts({ enabled })
  const shifts = shiftsData?.data ?? []

  const {
    data: edpData,
    isLoading: edpLoading,
    isFetching,
  } = useEmployeeDayPlans({
    from: formatDate(rangeStart),
    to: formatDate(rangeEnd),
    enabled,
  })
  const dayPlans = ((edpData as { data?: EmployeeDayPlan[] })?.data ?? []) as EmployeeDayPlan[]

  const createPlanMutation = useBulkCreateEmployeeDayPlans()

  // Build lookup map: "employeeId-YYYY-MM-DD" -> EmployeeDayPlan
  const planMap = React.useMemo(() => {
    const map = new Map<string, EmployeeDayPlan>()
    for (const plan of dayPlans) {
      if (!plan.employee_id) continue
      const dateStr = String(plan.plan_date).substring(0, 10)
      const key = `${plan.employee_id}-${dateStr}`
      map.set(key, plan)
    }
    return map
  }, [dayPlans])

  // Build shift lookup by ID
  const shiftMap = React.useMemo(() => {
    const map = new Map<string, Shift>()
    for (const shift of shifts) {
      map.set(shift.id, shift)
    }
    return map
  }, [shifts])

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

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current
    if (data?.type === 'shift') {
      setActiveShift(data.shift as Shift)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveShift(null)

    const { active, over } = event
    if (!over) return

    const shiftData = active.data.current
    if (shiftData?.type !== 'shift') return

    const cellData = over.data.current
    if (cellData?.type !== 'cell') return

    const shift = shiftData.shift as Shift
    const { employeeId, date } = cellData as {
      employeeId: string
      date: Date
      existingPlan: EmployeeDayPlan | null
    }

    // Directly assign shift via bulk upsert (handles both create and update)
    try {
      await createPlanMutation.mutateAsync({
        body: {
          plans: [
            {
              employee_id: employeeId,
              plan_date: formatDate(date),
              day_plan_id: shift.day_plan_id || undefined,
              shift_id: shift.id,
              source: 'manual',
            },
          ],
        },
      })
    } catch {
      // Error handled by mutation
    }
  }

  const isLoading = employeesLoading || edpLoading
  const rangeLabel = `${formatDisplayDate(rangeStart, 'short', locale)} - ${formatDisplayDate(rangeEnd, 'short', locale)}`

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrev}
              title={t('previousPeriod')}
              className="h-9 w-9"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-2 px-2 min-w-[160px] justify-center">
              <span className="text-sm font-medium whitespace-nowrap">
                {rangeLabel}
              </span>
              {isFetching && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              title={t('nextPeriod')}
              className="h-9 w-9"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="h-9"
            >
              {t('today')}
            </Button>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center border rounded-md">
            {(['week', 'twoWeeks', 'month'] as const).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange(mode)}
                className="h-9 rounded-none first:rounded-l-md last:rounded-r-md"
              >
                {mode === 'week'
                  ? t('viewWeek')
                  : mode === 'twoWeeks'
                    ? t('viewTwoWeeks')
                    : t('viewMonth')}
              </Button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bulk actions */}
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setBulkAssignOpen(true)}
          >
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            {t('bulkAssign')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setDeleteRangeOpen(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {t('deleteRange')}
          </Button>

          {/* Filters */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('searchPlaceholder')}
            className="w-56"
          />

          <Select
            value={departmentId ?? 'all'}
            onValueChange={(val) =>
              setDepartmentId(val === 'all' ? undefined : val)
            }
          >
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder={t('allDepartments')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allDepartments')}</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Board layout: palette + grid */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex bg-card">
              {/* Shift palette sidebar */}
              <ShiftPalette shifts={shifts} isLoading={shiftsLoading} />

              {/* Calendar grid */}
              <div className="flex-1 overflow-x-auto bg-card">
                {isLoading ? (
                  <BoardGridSkeleton columns={dates.length || 7} />
                ) : employees.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-lg font-medium text-muted-foreground">
                      {t('boardEmptyTitle')}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('boardEmptySubtitle')}
                    </p>
                  </div>
                ) : (
                  <div className="min-w-fit bg-card">
                    {/* Header row */}
                    <div
                      className="grid gap-px border-b bg-muted/50"
                      style={{
                        gridTemplateColumns: `160px repeat(${dates.length}, minmax(80px, 1fr))`,
                      }}
                    >
                      <div className="sticky left-0 z-10 bg-muted/50 px-3 h-[52px] text-xs font-medium text-muted-foreground flex items-center">
                        {t('employee')}
                      </div>
                      {dates.map((date) => {
                        const weekend = isWeekend(date)
                        const today = isToday(date)
                        return (
                          <div
                            key={formatDate(date)}
                            className={cn(
                              'px-1 h-[52px] flex flex-col items-center justify-center text-xs font-medium',
                              weekend && 'text-muted-foreground/70 bg-muted/30',
                              today && 'text-primary'
                            )}
                          >
                            <div className={cn(today && 'font-bold underline underline-offset-2')}>
                              {formatDisplayDate(date, 'weekday', locale)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {date.getDate().toString().padStart(2, '0')}.
                              {(date.getMonth() + 1).toString().padStart(2, '0')}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Employee rows */}
                    {employees.map((employee) => (
                      <div
                        key={employee.id}
                        className="grid gap-px border-b last:border-b-0 hover:bg-accent/20 transition-colors"
                        style={{
                          gridTemplateColumns: `160px repeat(${dates.length}, minmax(80px, 1fr))`,
                        }}
                      >
                        {/* Employee name cell */}
                        <div className="sticky left-0 z-10 bg-card px-3 py-1 flex items-center min-h-[42px] border-r">
                          <div className="truncate">
                            <span className="text-sm font-medium">
                              {employee.last_name}, {employee.first_name}
                            </span>
                            {employee.personnel_number && (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                ({employee.personnel_number})
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Date cells */}
                        {dates.map((date) => {
                          const dateStr = formatDate(date)
                          const key = `${employee.id}-${dateStr}`
                          const plan = planMap.get(key) ?? null
                          const shift = plan?.shift_id
                            ? (plan.shift ?? shiftMap.get(plan.shift_id) ?? null)
                            : null
                          const weekend = isWeekend(date)

                          return (
                            <div
                              key={dateStr}
                              className={cn(
                                'p-1',
                                weekend && 'bg-muted/30'
                              )}
                            >
                              <DroppableShiftCell
                                employeeId={employee.id}
                                date={date}
                                plan={plan}
                                shift={shift}
                                isWeekend={weekend}
                                isToday={isToday(date)}
                                onClick={() =>
                                  handleCellClick(employee.id, date, plan)
                                }
                              />
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeShift ? (
          <div
            className="flex items-center gap-2 rounded-md border bg-background p-2 shadow-lg"
            style={{ width: 160 }}
          >
            <div
              className="h-5 w-5 rounded-sm border shrink-0"
              style={{ backgroundColor: activeShift.color || '#808080' }}
            />
            <div className="text-xs font-medium truncate">
              {activeShift.code} - {activeShift.name}
            </div>
          </div>
        ) : null}
      </DragOverlay>

      {/* Cell edit dialog */}
      {editCell && (
        <ShiftAssignmentFormDialog
          open={!!editCell}
          onOpenChange={(open) => {
            if (!open) setEditCell(null)
          }}
          employeeId={editCell.employeeId}
          employeeName={editCell.employeeName}
          date={editCell.date}
          existingPlan={editCell.existingPlan}
          shifts={shifts}
          preselectedShiftId={editCell.preselectedShiftId}
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
    </DndContext>
  )
}

// ==================== Droppable Cell ====================

interface DroppableShiftCellProps {
  employeeId: string
  date: Date
  plan: EmployeeDayPlan | null
  shift: Shift | null
  isWeekend: boolean
  isToday: boolean
  onClick: () => void
}

function DroppableShiftCell({
  employeeId,
  date,
  plan,
  shift,
  isWeekend: weekend,
  isToday: today,
  onClick,
}: DroppableShiftCellProps) {
  const cellId = `cell-${employeeId}-${formatDate(date)}`
  const { setNodeRef, isOver } = useDroppable({
    id: cellId,
    data: {
      type: 'cell',
      employeeId,
      date,
      existingPlan: plan,
    },
  })

  // Determine text color based on background brightness
  const getContrastColor = (hexColor: string): string => {
    const hex = hexColor.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5 ? '#000000' : '#ffffff'
  }

  // Determine cell appearance based on source and shift
  const bgColor = shift?.color || undefined
  const textColor = bgColor ? getContrastColor(bgColor) : undefined
  const isTariff = plan?.source === 'tariff'
  const isHoliday = plan?.source === 'holiday'

  // Label: show shift code or day plan code
  const label = shift
    ? shift.code
    : plan?.day_plan
      ? plan.day_plan.code
      : plan
        ? '-'
        : ''

  // Source-based styling when no shift color (works in both light and dark mode)
  const sourceClass = !bgColor && plan
    ? isTariff
      ? 'bg-blue-500/20 border-blue-500/40 text-blue-600 dark:text-blue-400'
      : isHoliday
        ? 'bg-orange-500/20 border-orange-500/40 text-orange-600 dark:text-orange-400'
        : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
    : ''

  // Empty cell styling
  const emptyClass = !bgColor && !plan
    ? weekend
      ? 'bg-muted/50 border-muted-foreground/20 text-muted-foreground/50'
      : 'bg-muted/20 border-muted-foreground/20 text-muted-foreground/40 border-dashed'
    : ''

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'h-[34px] rounded-sm border text-center flex items-center justify-center cursor-pointer transition-all text-[11px] font-medium',
        today && 'ring-2 ring-primary/60 ring-offset-1 ring-offset-background',
        isOver && 'ring-2 ring-primary bg-primary/20 scale-105',
        !bgColor && !plan && 'hover:bg-accent/40 hover:border-accent-foreground/30',
        bgColor && 'border-transparent shadow-sm hover:shadow-md hover:scale-[1.02]',
        sourceClass,
        emptyClass
      )}
      style={
        bgColor
          ? { backgroundColor: bgColor, color: textColor }
          : undefined
      }
      title={
        plan
          ? `${plan.source}${plan.day_plan ? ': ' + plan.day_plan.name : ''}${plan.notes ? ' - ' + plan.notes : ''}`
          : undefined
      }
    >
      {label || '-'}
    </div>
  )
}

// ==================== Skeleton ====================

function BoardGridSkeleton({ columns }: { columns: number }) {
  return (
    <div className="p-4 space-y-2">
      <div className="flex gap-1">
        <Skeleton className="h-[52px] w-[160px]" />
        {Array.from({ length: Math.min(columns, 7) }).map((_, i) => (
          <Skeleton key={i} className="h-[52px] flex-1 min-w-[80px]" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, row) => (
        <div key={row} className="flex gap-1">
          <Skeleton className="h-[42px] w-[160px]" />
          {Array.from({ length: Math.min(columns, 7) }).map((_, i) => (
            <Skeleton key={i} className="h-[42px] flex-1 min-w-[80px]" />
          ))}
        </div>
      ))}
    </div>
  )
}
