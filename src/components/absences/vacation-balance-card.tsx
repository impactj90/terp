'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEmployeeVacationBalance } from '@/hooks/api'

interface VacationBalanceCardProps {
  /** Employee ID to show balance for */
  employeeId?: string
  /** Additional className */
  className?: string
}

export function VacationBalanceCard({
  employeeId,
  className,
}: VacationBalanceCardProps) {
  const currentYear = new Date().getFullYear()
  const { data: balance, isLoading } = useEmployeeVacationBalance(
    employeeId ?? '',
    currentYear,
    !!employeeId
  )

  const t = useTranslations('absences')

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t('vacationBalance')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-2 w-full mb-2" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    )
  }

  if (!balance) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t('vacationBalance')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('noBalanceConfigured')}
          </p>
        </CardContent>
      </Card>
    )
  }

  const remaining = balance.remaining_days ?? 0
  const total = balance.total_entitlement ?? 30
  const percent = total > 0 ? ((total - remaining) / total) * 100 : 0

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t('vacationBalance')}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Main number */}
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-3xl font-bold">{remaining}</span>
          <span className="text-muted-foreground">/ {t('ofTotalDays', { total })}</span>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-2">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>

        {/* Details */}
        <div className="text-xs text-muted-foreground space-y-0.5">
          {balance.used_days !== undefined && balance.used_days > 0 && (
            <p>{balance.used_days} {balance.used_days !== 1 ? t('daysUsed') : t('dayUsed')}</p>
          )}
          {balance.planned_days !== undefined && balance.planned_days > 0 && (
            <p>{balance.planned_days} {balance.planned_days !== 1 ? t('daysPlanned') : t('dayPlanned')}</p>
          )}
          {balance.carryover_from_previous !== undefined && balance.carryover_from_previous > 0 && (
            <p>{balance.carryover_from_previous} {balance.carryover_from_previous !== 1 ? t('daysCarriedOver') : t('dayCarriedOver')}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
