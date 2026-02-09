'use client'

import { useState, useMemo, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDailyValues, useDeleteBooking, useEmployees } from '@/hooks/api'
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
  BookingCreateDialog,
  ExportButtons,
} from '@/components/timesheet'

type ViewMode = 'day' | 'week' | 'month'

interface Booking {
  id: string
  booking_date: string
  booking_type?: { code: string; name: string; direction: 'in' | 'out' } | null
  original_time: number
  edited_time: number
  calculated_time?: number | null
  notes?: string | null
}

export default function TimesheetPage() {
  const t = useTranslations('timesheet')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { user } = useAuth()
  const { allowed: canViewAll } = useHasPermission(['time_tracking.view_all'])
  const searchParams = useSearchParams()
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [deletingBooking, setDeletingBooking] = useState<Booking | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const deleteBooking = useDeleteBooking()

  // For regular users, use their employee_id; for admin, allow selection
  const userEmployeeId = user?.employee_id ?? undefined
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined)

  // Fetch employees for admin selector
  const { data: employeesData } = useEmployees({
    enabled: canViewAll,
    limit: 250,
  })

  // Read date, view, and employee from URL search params (e.g. from monthly evaluation navigation)
  useEffect(() => {
    const dateParam = searchParams.get('date')
    const viewParam = searchParams.get('view')
    const employeeParam = searchParams.get('employee')
    if (dateParam) {
      const parsed = new Date(dateParam + 'T00:00:00')
      if (!isNaN(parsed.getTime())) {
        setCurrentDate(parsed)
      }
    }
    if (viewParam && (viewParam === 'day' || viewParam === 'week' || viewParam === 'month')) {
      setViewMode(viewParam)
    }
    if (employeeParam) {
      setSelectedEmployeeId(employeeParam)
    }
  }, [searchParams])

  useEffect(() => {
    if (!canViewAll) return
    if (selectedEmployeeId) return

    if (userEmployeeId) {
      setSelectedEmployeeId(userEmployeeId)
      return
    }

    const firstEmployee = employeesData?.data?.[0]
    if (firstEmployee?.id) {
      setSelectedEmployeeId(firstEmployee.id)
    }
  }, [employeesData?.data, canViewAll, selectedEmployeeId, userEmployeeId])

  const effectiveEmployeeId = canViewAll ? selectedEmployeeId : userEmployeeId

  // Get the selected employee name for display
  const selectedEmployee = employeesData?.data?.find(emp => emp.id === selectedEmployeeId)
  const employeeName = selectedEmployee
    ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}`
    : user?.display_name

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
    employeeId: effectiveEmployeeId,
    from: formatDate(periodDates.start),
    to: formatDate(periodDates.end),
    enabled: !!effectiveEmployeeId && viewMode !== 'day',
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
    setEditingBooking(booking as Booking)
    setIsEditDialogOpen(true)
  }

  const handleAddBooking = () => {
    setIsCreateDialogOpen(true)
  }

  const handleDeleteBooking = (booking: unknown) => {
    setDeletingBooking(booking as Booking)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingBooking) return

    try {
      await deleteBooking.mutateAsync({ path: { id: deletingBooking.id } } as never)
      setIsDeleteDialogOpen(false)
      setDeletingBooking(null)
    } catch (error) {
      console.error('Failed to delete booking:', error)
    }
  }

  const handleDeleteOpenChange = (open: boolean) => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setDeletingBooking(null)
    }
  }

  // Format period label for display
  const periodLabel = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return formatDisplayDate(currentDate, 'long')
      case 'week':
        return `${formatDisplayDate(periodDates.start, 'short')} - ${formatDisplayDate(periodDates.end, 'short')}`
      case 'month':
        return currentDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    }
  }, [viewMode, currentDate, periodDates])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {employeeName
              ? t('entriesFor', { name: employeeName })
              : t('viewAndManage')}
          </p>
        </div>

        {/* Export button */}
        <ExportButtons
          viewMode={viewMode}
          periodStart={periodDates.start}
          periodEnd={periodDates.end}
          employeeId={effectiveEmployeeId}
          employeeName={employeeName}
          data={exportData}
        />
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* Employee selector (admin only) */}
          {canViewAll && (
            <Select
              value={selectedEmployeeId ?? ''}
              onValueChange={setSelectedEmployeeId}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder={t('selectEmployee')} />
              </SelectTrigger>
              <SelectContent>
                {employeesData?.data?.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* View mode tabs */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="day">{t('day')}</TabsTrigger>
              <TabsTrigger value="week">{t('week')}</TabsTrigger>
              <TabsTrigger value="month">{t('month')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Period navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={navigateToToday}>
            {t('today')}
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
              employeeId={effectiveEmployeeId}
              isEditable={true}
              onAddBooking={effectiveEmployeeId ? handleAddBooking : undefined}
              onEditBooking={handleEditBooking}
              onDeleteBooking={handleDeleteBooking}
            />
          )}
          {viewMode === 'week' && (
            <WeekView
              startDate={periodDates.start}
              endDate={periodDates.end}
              employeeId={effectiveEmployeeId}
              onDayClick={handleDayClick}
            />
          )}
          {viewMode === 'month' && (
            <MonthView
              year={currentDate.getFullYear()}
              month={currentDate.getMonth() + 1}
              employeeId={effectiveEmployeeId}
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

      {/* Booking create dialog */}
      <BookingCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        employeeId={effectiveEmployeeId}
        date={currentDate}
      />

      {/* Booking delete confirmation */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={handleDeleteOpenChange}
        title={t('deleteBookingTitle')}
        description={t('deleteBookingDescription')}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        variant="destructive"
        isLoading={deleteBooking.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
