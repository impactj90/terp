'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft, ChevronRight, Lock, Unlock } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useMonthlyValues, useDailyValues, useEmployees } from '@/hooks/api'
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

const statusStyles = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  closed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
}

export default function MonthlyEvaluationPage() {
  const t = useTranslations('monthlyEvaluation')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { user, isLoading: authLoading } = useAuth()
  const { allowed: canViewAll } = useHasPermission(['time_tracking.view_all'])

  // For regular users, use their employee_id; for admin, allow selection
  const userEmployeeId = user?.employee_id ?? undefined
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined)
  const effectiveEmployeeId = canViewAll ? selectedEmployeeId : userEmployeeId

  // Date state
  const currentDate = new Date()
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)

  // Sheet states
  const [closeSheetOpen, setCloseSheetOpen] = useState(false)
  const [reopenSheetOpen, setReopenSheetOpen] = useState(false)

  // Fetch employees for admin selector
  const { data: employeesData } = useEmployees({
    enabled: canViewAll,
    limit: 250,
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
  const selectedEmployee = employeesData?.data?.find(emp => emp.id === selectedEmployeeId)
  const employeeName = selectedEmployee
    ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}`
    : user?.display_name

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
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status badge */}
          {monthlyValue && (
            <Badge className={monthlyValue.is_closed ? statusStyles.closed : statusStyles.open}>
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

          {/* Export */}
          <MonthlyExportButtons
            monthlyValue={monthlyValue}
            dailyValues={dailyValues}
            year={selectedYear}
            month={selectedMonth}
            employeeName={employeeName}
          />
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Employee selector (admin only) */}
        {canViewAll && (
          <Select
            value={selectedEmployeeId ?? ''}
            onValueChange={setSelectedEmployeeId}
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder={tc('selectEmployee')} />
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

        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={navigateToCurrent}>
            {t('current')}
          </Button>
          <div className="flex items-center rounded-md border">
            <Button variant="ghost" size="icon-sm" onClick={navigatePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-medium min-w-[160px] text-center">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={navigateNext}
              disabled={!canNavigateNext}
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
        <Card>
          <CardContent className="pt-6">
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
