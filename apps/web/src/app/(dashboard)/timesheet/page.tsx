'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { useDailyValues } from '@/hooks/api'
import {
  formatDate,
  getWeekRange,
  getMonthRange,
  getWeekDates,
  getMonthDates,
  formatDisplayDate,
} from '@/lib/time-utils'
import {
  DayView,
  WeekView,
  MonthView,
  BookingEditDialog,
  ExportButtons,
} from '@/components/timesheet'

type ViewMode = 'day' | 'week' | 'month'

export default function TimesheetPage() {
  const { user } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [editingBooking, setEditingBooking] = useState<unknown | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  // TODO: Get employeeId from user context or selector
  // For now, we use user.id as a placeholder
  const employeeId = user?.id

  // Calculate period dates based on view mode
  const periodDates = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return { start: currentDate, end: currentDate }
      case 'week':
        return getWeekRange(currentDate)
      case 'month':
        return getMonthRange(currentDate)
    }
  }, [viewMode, currentDate])

  // Fetch daily values for export
  const { data: dailyValuesData } = useDailyValues({
    employeeId,
    from: formatDate(periodDates.start),
    to: formatDate(periodDates.end),
    enabled: !!employeeId && viewMode !== 'day',
  })

  // Prepare export data
  const exportData = useMemo(() => {
    if (viewMode === 'day') return undefined

    const dates = viewMode === 'week'
      ? getWeekDates(currentDate)
      : getMonthDates(currentDate)

    const dailyValuesByDate = new Map<string, {
      target_minutes?: number | null
      gross_minutes?: number | null
      break_minutes?: number | null
      net_minutes?: number | null
      balance_minutes?: number | null
    }>()

    if (dailyValuesData?.data) {
      for (const dv of dailyValuesData.data) {
        dailyValuesByDate.set(dv.value_date, dv)
      }
    }

    return { dates, dailyValues: dailyValuesByDate }
  }, [viewMode, currentDate, dailyValuesData])

  // Navigation functions
  const navigatePrevious = () => {
    const newDate = new Date(currentDate)
    switch (viewMode) {
      case 'day':
        newDate.setDate(newDate.getDate() - 1)
        break
      case 'week':
        newDate.setDate(newDate.getDate() - 7)
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() - 1)
        break
    }
    setCurrentDate(newDate)
  }

  const navigateNext = () => {
    const newDate = new Date(currentDate)
    switch (viewMode) {
      case 'day':
        newDate.setDate(newDate.getDate() + 1)
        break
      case 'week':
        newDate.setDate(newDate.getDate() + 7)
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() + 1)
        break
    }
    setCurrentDate(newDate)
  }

  const navigateToToday = () => {
    setCurrentDate(new Date())
  }

  const handleDayClick = (date: Date) => {
    setCurrentDate(date)
    setViewMode('day')
  }

  const handleEditBooking = (booking: unknown) => {
    setEditingBooking(booking)
    setIsEditDialogOpen(true)
  }

  const handleAddBooking = () => {
    // TODO: Open add booking dialog
    console.log('Add booking for', currentDate)
  }

  // Format period label for display
  const periodLabel = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return formatDisplayDate(currentDate, 'long')
      case 'week':
        return `${formatDisplayDate(periodDates.start, 'short')} - ${formatDisplayDate(periodDates.end, 'short')}`
      case 'month':
        return currentDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
    }
  }, [viewMode, currentDate, periodDates])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timesheet</h1>
          <p className="text-muted-foreground">
            View and manage your time entries
          </p>
        </div>

        {/* Export button */}
        <ExportButtons
          viewMode={viewMode}
          periodStart={periodDates.start}
          periodEnd={periodDates.end}
          employeeId={employeeId}
          employeeName={user?.display_name}
          data={exportData}
        />
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* View mode tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Period navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={navigateToToday}>
            Today
          </Button>
          <div className="flex items-center rounded-md border">
            <Button variant="ghost" size="icon-sm" onClick={navigatePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-medium min-w-[180px] text-center">
              {periodLabel}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={navigateNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content based on view mode */}
      <Card>
        <CardContent className="pt-6">
          {viewMode === 'day' && (
            <DayView
              date={currentDate}
              employeeId={employeeId}
              isEditable={true}
              onAddBooking={handleAddBooking}
              onEditBooking={handleEditBooking}
            />
          )}
          {viewMode === 'week' && (
            <WeekView
              startDate={periodDates.start}
              endDate={periodDates.end}
              employeeId={employeeId}
              onDayClick={handleDayClick}
            />
          )}
          {viewMode === 'month' && (
            <MonthView
              year={currentDate.getFullYear()}
              month={currentDate.getMonth() + 1}
              employeeId={employeeId}
              onDayClick={handleDayClick}
            />
          )}
        </CardContent>
      </Card>

      {/* Booking edit dialog */}
      <BookingEditDialog
        booking={editingBooking as never}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
    </div>
  )
}
