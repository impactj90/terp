'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks/use-has-role'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { YearSelector } from '@/components/vacation'
import { useYearOverview, useEmployeeVacationBalance, useEmployees } from '@/hooks/api'
import {
  YearOverviewTable,
  YearSummaryCards,
  FlextimeChart,
  YearExportButtons,
} from '@/components/year-overview'

export default function YearOverviewPage() {
  const t = useTranslations('yearOverview')
  const tc = useTranslations('common')
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // For regular users, use their employee_id; for admin, allow selection
  const userEmployeeId = user?.employee_id ?? undefined
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined)
  const effectiveEmployeeId = isAdmin ? selectedEmployeeId : userEmployeeId

  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)

  // Fetch employees for admin selector
  const { data: employeesData } = useEmployees({
    enabled: isAdmin,
    limit: 250,
  })

  // Fetch all monthly values for the year
  const {
    data: monthlyData,
    isLoading,
    error,
    refetch,
  } = useYearOverview({
    employeeId: effectiveEmployeeId,
    year: selectedYear,
    enabled: !!effectiveEmployeeId,
  })

  // Fetch vacation balance for vacation summary
  const { data: vacationBalance } = useEmployeeVacationBalance(
    effectiveEmployeeId ?? '',
    selectedYear,
    !!effectiveEmployeeId
  )

  // Transform monthly values to sorted array
  const monthlyValuesList = useMemo(() => {
    const values = monthlyData?.data ?? []
    return [...values].sort((a, b) => (a.month ?? 0) - (b.month ?? 0))
  }, [monthlyData])

  // Prepare flextime chart data - 12 data points for each month
  const flextimeData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mv = monthlyValuesList.find((m) => m.month === i + 1)
      return {
        month: i + 1,
        balance:
          mv?.account_balances?.flextime ?? mv?.balance_minutes ?? 0,
        hasData: !!mv,
      }
    })
  }, [monthlyValuesList])

  const handleMonthClick = (month: number) => {
    router.push(`/monthly-evaluation?year=${selectedYear}&month=${month}`)
  }

  if (authLoading) {
    return <YearOverviewPageSkeleton />
  }

  if (!isAdmin && !userEmployeeId) {
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <p className="text-destructive">{t('failedToLoad')}</p>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : t('unknownError')}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          {tc('retry')}
        </Button>
      </div>
    )
  }

  // Get the selected employee name for export
  const selectedEmployee = employeesData?.data?.find(emp => emp.id === selectedEmployeeId)
  const employeeName = selectedEmployee
    ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}`
    : user?.display_name

  return (
    <div className="space-y-6">
      {/* Page header with export button */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <YearExportButtons
          year={selectedYear}
          employeeName={employeeName}
          monthlyValues={monthlyValuesList}
        />
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Employee selector (admin only) */}
        {isAdmin && (
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

        {/* Year selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedYear((y) => y - 1)}
            aria-label={tc('previousYear')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <YearSelector
            value={selectedYear}
            onChange={setSelectedYear}
            className="w-32"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedYear((y) => y + 1)}
            disabled={selectedYear >= currentYear + 1}
            aria-label={tc('nextYear')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {selectedYear !== currentYear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedYear(currentYear)}
            >
              {tc('currentYear')}
            </Button>
          )}
        </div>
      </div>

      {/* Content when employee is selected */}
      {effectiveEmployeeId && (
        <>
          {/* Summary cards */}
          <YearSummaryCards
            monthlyValues={monthlyValuesList}
            vacationUsed={vacationBalance?.used_days}
            vacationEntitlement={vacationBalance?.total_entitlement}
            isLoading={isLoading}
          />

          {/* Chart and Table grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Flextime progression chart - 1 column */}
            <FlextimeChart data={flextimeData} isLoading={isLoading} />

            {/* Monthly table - 2 columns */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t('monthlyBreakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                <YearOverviewTable
                  year={selectedYear}
                  monthlyValues={monthlyValuesList}
                  isLoading={isLoading}
                  onMonthClick={handleMonthClick}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* No employee selected message for admin */}
      {isAdmin && !effectiveEmployeeId && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <p>{t('selectEmployeePrompt')}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function YearOverviewPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>

      {/* Year selector */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-10" />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart and Table */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
