'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeVacationBalance } from '@/hooks/api'
import {
  YearSelector,
  BalanceBreakdown,
  CarryoverWarning,
  TransactionHistory,
  UpcomingVacation,
} from '@/components/vacation'

export default function VacationPage() {
  const t = useTranslations('vacation')
  const tc = useTranslations('common')
  const { user, isLoading: authLoading } = useAuth()
  const employeeId = user?.employee_id
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)

  // Fetch balance to get carryover info for warning
  const { data: balance } = useEmployeeVacationBalance(
    employeeId ?? '',
    selectedYear,
    !!employeeId
  )

  if (authLoading) {
    return <VacationPageSkeleton />
  }

  if (!employeeId) {
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
      </div>

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

      {/* Carryover warning */}
      {selectedYear === currentYear && balance && (
        <CarryoverWarning
          carryoverDays={balance.carryover_from_previous ?? 0}
          expiresAt={balance.carryover_expires_at}
        />
      )}

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Balance breakdown - takes 1 column */}
        <BalanceBreakdown
          employeeId={employeeId}
          year={selectedYear}
        />

        {/* Right side content - takes 2 columns */}
        <div className="space-y-6 lg:col-span-2">
          {/* Upcoming vacation - only show for current year */}
          {selectedYear === currentYear && (
            <UpcomingVacation employeeId={employeeId} />
          )}

          {/* Transaction history */}
          <TransactionHistory
            employeeId={employeeId}
            year={selectedYear}
          />
        </div>
      </div>
    </div>
  )
}

function VacationPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-10" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-96" />
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  )
}
