'use client'

import { useTranslations } from 'next-intl'
import { Palmtree, AlertCircle, RefreshCw, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useEmployeeVacationBalance } from '@/hooks/api'

interface BalanceBreakdownProps {
  employeeId: string
  year: number
  className?: string
}

interface BreakdownRowProps {
  label: string
  value: number
  prefix?: '+' | '-' | ''
  tooltip?: string
  highlight?: boolean
}

function BreakdownRow({
  label,
  value,
  prefix = '',
  tooltip,
  highlight = false,
}: BreakdownRowProps) {
  const t = useTranslations('vacation')
  const displayValue = prefix
    ? prefix + String(Math.abs(value))
    : value.toString()

  return (
    <div
      className={cn(
        'flex items-center justify-between py-2',
        highlight && 'font-medium'
      )}
    >
      <div className="flex items-center gap-1">
        <span className={highlight ? 'text-foreground' : 'text-muted-foreground'}>
          {label}
        </span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <span className={cn(
        highlight ? 'text-foreground' : 'text-muted-foreground',
        value < 0 && 'text-destructive'
      )}>
        {t('valueDays', { value: displayValue })}
      </span>
    </div>
  )
}

export function BalanceBreakdown({
  employeeId,
  year,
  className,
}: BalanceBreakdownProps) {
  const t = useTranslations('vacation')
  const tc = useTranslations('common')
  const { data, isLoading, error, refetch } = useEmployeeVacationBalance(
    employeeId,
    year,
    !!employeeId
  )

  if (isLoading) {
    return <BalanceBreakdownSkeleton className={className} />
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palmtree className="h-5 w-5" />
            {t('vacationBalance')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{t('failedToLoadBalance')}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {tc('retry')}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palmtree className="h-5 w-5" />
            {t('vacationBalance')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-muted-foreground">
            {t('noVacationData', { year })}
          </p>
        </CardContent>
      </Card>
    )
  }

  const totalEntitlement = data.total_entitlement ?? 0
  const remainingDays = data.remaining_days ?? 0
  const usedDays = data.used_days ?? 0
  const plannedDays = data.planned_days ?? 0
  const baseEntitlement = data.base_entitlement ?? 0
  const additionalEntitlement = data.additional_entitlement ?? 0
  const carryover = data.carryover_from_previous ?? 0
  const adjustment = data.manual_adjustment ?? 0

  // Progress bar calculations
  const usedPercent = totalEntitlement > 0 ? (usedDays / totalEntitlement) * 100 : 0
  const plannedPercent = totalEntitlement > 0 ? (plannedDays / totalEntitlement) * 100 : 0

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palmtree className="h-5 w-5" />
          {t('vacationBalanceYear', { year })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Large remaining days display */}
        <div className="text-center">
          <div className="text-4xl font-bold">{remainingDays}</div>
          <div className="text-sm text-muted-foreground">{t('daysAvailable')}</div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="flex h-full">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: usedPercent + '%' }}
              />
              <div
                className="h-full bg-yellow-500 transition-all"
                style={{ width: plannedPercent + '%' }}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {t('used', { count: usedDays })}
            </span>
            {plannedDays > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                {t('planned', { count: plannedDays })}
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted" />
              {t('available', { count: remainingDays })}
            </span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="divide-y">
          <BreakdownRow
            label={t('baseEntitlement')}
            value={baseEntitlement}
            tooltip={t('baseEntitlementTooltip')}
          />
          {additionalEntitlement > 0 && (
            <BreakdownRow
              label={t('additionalDays')}
              value={additionalEntitlement}
              prefix="+"
              tooltip={t('additionalDaysTooltip')}
            />
          )}
          {carryover > 0 && (
            <BreakdownRow
              label={t('carryover')}
              value={carryover}
              prefix="+"
              tooltip={t('carryoverTooltip')}
            />
          )}
          {adjustment !== 0 && (
            <BreakdownRow
              label={t('adjustments')}
              value={adjustment}
              prefix={adjustment > 0 ? '+' : '-'}
              tooltip={t('adjustmentsTooltip')}
            />
          )}
          <BreakdownRow
            label={t('totalEntitlement')}
            value={totalEntitlement}
            highlight
          />
          <BreakdownRow
            label={t('usedLabel')}
            value={-usedDays}
            prefix="-"
          />
          {plannedDays > 0 && (
            <BreakdownRow
              label={t('plannedLabel')}
              value={-plannedDays}
              prefix="-"
            />
          )}
          <BreakdownRow
            label={t('availableLabel')}
            value={remainingDays}
            highlight
          />
        </div>
      </CardContent>
    </Card>
  )
}

function BalanceBreakdownSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
