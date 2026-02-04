'use client'

import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getWeekRange, getMonthRange, formatDisplayDate } from '@/lib/time-utils'

type ViewMode = 'week' | 'twoWeeks' | 'month'

interface DayPlanGridToolbarProps {
  rangeStart: Date
  rangeEnd: Date
  onRangeChange: (start: Date, end: Date) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  search: string
  onSearchChange: (search: string) => void
  departmentId: string | undefined
  onDepartmentChange: (id: string | undefined) => void
  departments: Array<{ id: string; name: string }>
  onBulkAssign: () => void
  onDeleteRange: () => void
  isFetching: boolean
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

export function DayPlanGridToolbar({
  rangeStart,
  rangeEnd,
  onRangeChange,
  viewMode,
  onViewModeChange,
  search,
  onSearchChange,
  departmentId,
  onDepartmentChange,
  departments,
  onBulkAssign,
  onDeleteRange,
  isFetching,
}: DayPlanGridToolbarProps) {
  const t = useTranslations('employeeDayPlans')
  const locale = useLocale()

  const handlePrev = () => {
    const { start, end } = getShiftedRange(rangeStart, viewMode, 'prev')
    onRangeChange(start, end)
  }

  const handleNext = () => {
    const { start, end } = getShiftedRange(rangeStart, viewMode, 'next')
    onRangeChange(start, end)
  }

  const handleToday = () => {
    const { start, end } = getTodayRange(viewMode)
    onRangeChange(start, end)
  }

  const rangeLabel = `${formatDisplayDate(rangeStart, 'short', locale)} - ${formatDisplayDate(rangeEnd, 'short', locale)}`

  return (
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
          {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
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
            onClick={() => onViewModeChange(mode)}
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

      {/* Filters */}
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={t('searchPlaceholder')}
        className="w-56"
      />

      <Select
        value={departmentId ?? 'all'}
        onValueChange={(val) =>
          onDepartmentChange(val === 'all' ? undefined : val)
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

      {/* Actions */}
      <Button size="sm" onClick={onBulkAssign} className="h-9">
        <Plus className="mr-1.5 h-4 w-4" />
        {t('bulkAssign')}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onDeleteRange}
        className="h-9 text-destructive hover:text-destructive"
      >
        <Trash2 className="mr-1.5 h-4 w-4" />
        {t('deleteRange')}
      </Button>
    </div>
  )
}
