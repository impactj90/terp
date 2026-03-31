'use client'

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Lock, Unlock } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useMonthlyValues, useDailyValues, useEmployees } from '@/hooks'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MonthlySummaryCards } from '@/components/monthly-evaluation/monthly-summary-cards'
import { DailyBreakdownTable } from '@/components/monthly-evaluation/daily-breakdown-table'
import { CloseMonthSheet } from '@/components/monthly-evaluation/close-month-sheet'
import { ReopenMonthSheet } from '@/components/monthly-evaluation/reopen-month-sheet'
import { MonthlyExportButtons } from '@/components/monthly-evaluation/monthly-export-buttons'

const statusVariants = {
  open: 'blue' as const,
  closed: 'green' as const,
}

export default function MonthlyEvaluationPage() {
  const t = useTranslations('monthlyEvaluation')
  const tc = useTranslations('common')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const { user, isLoading: authLoading } = useAuth()
  const { allowed: canViewAll } = useHasPermission(['time_tracking.view_all'])

  // For regular users, use their employee_id; for admin, allow selection
  const userEmployeeId = user?.employeeId ?? undefined
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined)
  const effectiveEmployeeId = canViewAll ? selectedEmployeeId : userEmployeeId

  // Date state
  const currentDate = new Date()
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)

  // Sheet states
  const [closeSheetOpen, setCloseSheetOpen] = useState(false)
  const [reopenSheetOpen, setReopenSheetOpen] = useState(false)

  // Read URL params (e.g. from year-overview navigation)
  useEffect(() => {
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    const employeeParam = searchParams.get('employee')
    if (yearParam) {
      const y = parseInt(yearParam, 10)
      if (!isNaN(y)) setSelectedYear(y)
    }
    if (monthParam) {
      const m = parseInt(monthParam, 10)
      if (!isNaN(m) && m >= 1 && m <= 12) setSelectedMonth(m)
    }
    if (employeeParam) {
      setSelectedEmployeeId(employeeParam)
    }
  }, [searchParams])

  // Fetch employees for admin selector
  const { data: employeesData } = useEmployees({
    enabled: canViewAll,
    pageSize: 250,
  })

  // Fetch monthly value
  const { data: monthlyData, isLoading: monthlyLoading } = useMonthlyValues({
    employeeId: effectiveEmployeeId,
    year: selectedYear,
    month: selectedMonth,
    enabled: !!effectiveEmployeeId,
  })

  // Fetch daily values for breakdown
  const { data: dailyData, isLoading: dailyLoading } = useDailyValues({
    employeeId: effectiveEmployeeId,
    year: selectedYear,
    month: selectedMonth,
    enabled: !!effectiveEmployeeId,
  })

  // Extract monthly value from array-wrapped response
  const monthlyValue = monthlyData?.data?.[0]
  const dailyValues = dailyData?.data ?? []

  // Navigation handlers
  const navigatePrevious = () => {
    if (selectedMonth === 1) {
      setSelectedYear(y => y - 1)
      setSelectedMonth(12)
    } else {
      setSelectedMonth(m => m - 1)
    }
  }

  const navigateNext = () => {
    if (selectedMonth === 12) {
      setSelectedYear(y => y + 1)
      setSelectedMonth(1)
    } else {
      setSelectedMonth(m => m + 1)
    }
  }

  const navigateToCurrent = () => {
    setSelectedYear(currentDate.getFullYear())
    setSelectedMonth(currentDate.getMonth() + 1)
  }

  // Format month label
  const monthLabel = new Date(selectedYear, selectedMonth - 1, 1)
    .toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  // Check if we can navigate to next month
  const canNavigateNext = selectedYear < currentDate.getFullYear() ||
    (selectedYear === currentDate.getFullYear() && selectedMonth < currentDate.getMonth() + 1)

  // Get the selected employee name
  const selectedEmployee = employeesData?.items?.find(emp => emp.id === selectedEmployeeId)
  const employeeName = selectedEmployee
    ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
    : user?.displayName

  if (authLoading) {
    return <MonthlyEvaluationSkeleton />
  }

  if (!canViewAll && !userEmployeeId) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">
          {tc('noEmployeeRecord')}
        </p>
        <p className="text-sm text-muted-foreground">
          {tc('contactAdmin')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status badge */}
          {monthlyValue && (
            <Badge variant={monthlyValue.is_closed ? statusVariants.closed : statusVariants.open}>
              {monthlyValue.is_closed ? t('statusClosed') : t('statusOpen')}
            </Badge>
          )}

          {/* Action buttons */}
          {monthlyValue?.is_closed ? (
            <Button variant="outline" size="sm" onClick={() => setReopenSheetOpen(true)}>
              <Unlock className="h-4 w-4 mr-2" />
              {t('reopen')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setCloseSheetOpen(true)} disabled={!monthlyValue}>
              <Lock className="h-4 w-4 mr-2" />
              {t('closeMonth')}
            </Button>
          )}

          {/* Export — hidden on mobile */}
          <div className="hidden sm:block">
            <MonthlyExportButtons
              monthlyValue={monthlyValue}
              dailyValues={dailyValues}
              year={selectedYear}
              month={selectedMonth}
              employeeName={employeeName}
            />
          </div>
        </div>
      </div>

      {/* Controls row */}
      <div className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
        {/* Employee selector (admin only) */}
        {canViewAll && (
          <Select
            value={selectedEmployeeId ?? ''}
            onValueChange={setSelectedEmployeeId}
          >
            <SelectTrigger className="w-full sm:w-[250px]">
              <SelectValue placeholder={tc('selectEmployee')} />
            </SelectTrigger>
            <SelectContent>
              {employeesData?.items?.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={navigateToCurrent} className="min-h-[44px] sm:min-h-0">
            {t('current')}
          </Button>
          <div className="flex flex-1 items-center rounded-md border">
            <Button variant="ghost" size="icon-sm" onClick={navigatePrevious} className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex-1 px-2 sm:px-3 text-sm font-medium min-w-0 text-center truncate">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={navigateNext}
              disabled={!canNavigateNext}
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {effectiveEmployeeId && (
        <MonthlySummaryCards
          monthlyValue={monthlyValue}
          isLoading={monthlyLoading}
        />
      )}

      {/* Daily breakdown table */}
      {effectiveEmployeeId && (
        <Card className="overflow-hidden">
          <CardContent className="pt-4 sm:pt-6 px-2 sm:px-6">
            <DailyBreakdownTable
              dailyValues={dailyValues}
              isLoading={dailyLoading}
              year={selectedYear}
              month={selectedMonth}
              employeeId={effectiveEmployeeId}
            />
          </CardContent>
        </Card>
      )}

      {/* No employee selected message for admin */}
      {canViewAll && !effectiveEmployeeId && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <p>{t('selectEmployeePrompt')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Close month sheet */}
      <CloseMonthSheet
        open={closeSheetOpen}
        onOpenChange={setCloseSheetOpen}
        employeeId={effectiveEmployeeId}
        year={selectedYear}
        month={selectedMonth}
        monthLabel={monthLabel}
      />

      {/* Reopen month sheet */}
      <ReopenMonthSheet
        open={reopenSheetOpen}
        onOpenChange={setReopenSheetOpen}
        employeeId={effectiveEmployeeId}
        year={selectedYear}
        month={selectedMonth}
        monthLabel={monthLabel}
      />
    </div>
  )
}

function MonthlyEvaluationSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-[250px]" />
        <Skeleton className="h-10 w-[200px]" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
