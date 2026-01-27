'use client'

import { useTranslations } from 'next-intl'
import { Clock, Coffee, Target, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMinutes } from '@/lib/time-utils'
import { cn } from '@/lib/utils'

interface TodayStatsProps {
  grossMinutes: number
  breakMinutes: number
  netMinutes: number
  targetMinutes: number
  overtimeMinutes: number
  undertimeMinutes: number
  isLoading?: boolean
  className?: string
}

export function TodayStats({
  grossMinutes,
  breakMinutes,
  targetMinutes,
  overtimeMinutes,
  undertimeMinutes,
  isLoading,
  className,
}: TodayStatsProps) {
  const t = useTranslations('timeClock')

  if (isLoading) {
    return <TodayStatsSkeleton className={className} />
  }

  const balance = overtimeMinutes - undertimeMinutes
  const balanceIsPositive = balance >= 0

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{t('todaysSummary')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <StatItem
            icon={Clock}
            label={t('grossTime')}
            value={formatMinutes(grossMinutes)}
          />
          <StatItem
            icon={Coffee}
            label={t('breakTime')}
            value={formatMinutes(breakMinutes)}
          />
          <StatItem
            icon={Target}
            label={t('targetTime')}
            value={formatMinutes(targetMinutes)}
          />
          <StatItem
            icon={TrendingUp}
            label={t('balance')}
            value={`${balanceIsPositive ? '+' : ''}${formatMinutes(balance)}`}
            valueClassName={balanceIsPositive ? 'text-success' : 'text-destructive'}
          />
        </div>
      </CardContent>
    </Card>
  )
}

interface StatItemProps {
  icon: typeof Clock
  label: string
  value: string
  valueClassName?: string
}

function StatItem({ icon: Icon, label, value, valueClassName }: StatItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-sm font-semibold tabular-nums', valueClassName)}>
          {value}
        </p>
      </div>
    </div>
  )
}

function TodayStatsSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
