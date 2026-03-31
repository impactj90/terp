'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { TimeDisplay } from './time-display'

interface ProgressSummaryProps {
  targetMinutes?: number | null
  grossMinutes?: number | null
  breakMinutes?: number | null
  netMinutes?: number | null
  balanceMinutes?: number | null
  className?: string
}

export function ProgressSummary({
  targetMinutes,
  grossMinutes,
  breakMinutes,
  netMinutes,
  balanceMinutes,
  className,
}: ProgressSummaryProps) {
  const t = useTranslations('timesheet')

  const target = targetMinutes ?? 0
  const net = netMinutes ?? 0
  const progress = target > 0 ? Math.min((net / target) * 100, 100) : 0
  const isOvertime = net > target && target > 0
  const isComplete = progress >= 100

  // SVG progress ring
  const size = 88
  const strokeWidth = 5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className={cn(
      'rounded-xl border bg-card/50 p-4 sm:p-5',
      className,
    )}>
      {/* Mobile: compact stacked layout */}
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Progress ring */}
        <div className="relative shrink-0">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-muted-foreground/10"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={cn(
                'transition-all duration-700 ease-out',
                isOvertime
                  ? 'text-amber-500'
                  : isComplete
                    ? 'text-emerald-500'
                    : 'text-primary',
              )}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn(
              'text-lg font-semibold tabular-nums leading-none',
              isOvertime && 'text-amber-500',
              isComplete && !isOvertime && 'text-emerald-500',
            )}>
              {Math.round(progress)}%
            </span>
          </div>
        </div>

        {/* Mobile: balance next to ring; Desktop: stats grid */}
        <div className="flex-1 min-w-0">
          {/* Balance — shown inline on mobile */}
          <div className="sm:hidden">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
              {t('balance')}
            </div>
            <TimeDisplay
              value={balanceMinutes}
              format="balance"
              className="text-2xl font-semibold"
            />
          </div>
          {/* Stats grid — hidden on mobile, shown on desktop */}
          <div className="hidden sm:grid grid-cols-2 gap-x-8 gap-y-1.5">
            <StatItem label={t('target')} value={targetMinutes} format="duration" />
            <StatItem label={t('gross')} value={grossMinutes} format="duration" />
            <StatItem label={t('breaks')} value={breakMinutes} format="duration" />
            <StatItem label={t('net')} value={netMinutes} format="duration" />
          </div>
        </div>

        {/* Balance — desktop only, right side */}
        <div className="hidden sm:block text-right shrink-0 pl-4 border-l border-border/50">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            {t('balance')}
          </div>
          <TimeDisplay
            value={balanceMinutes}
            format="balance"
            className="text-2xl font-semibold"
          />
        </div>
      </div>

      {/* Mobile: stats row below */}
      <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/50 sm:hidden">
        <MobileStatItem label={t('target')} value={targetMinutes} format="duration" />
        <MobileStatItem label={t('gross')} value={grossMinutes} format="duration" />
        <MobileStatItem label={t('breaks')} value={breakMinutes} format="duration" />
        <MobileStatItem label={t('net')} value={netMinutes} format="duration" />
      </div>
    </div>
  )
}

function StatItem({ label, value, format }: {
  label: string
  value: number | null | undefined
  format: 'duration' | 'balance'
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground truncate">{label}</span>
      <TimeDisplay value={value} format={format} className="text-sm tabular-nums" />
    </div>
  )
}

function MobileStatItem({ label, value, format }: {
  label: string
  value: number | null | undefined
  format: 'duration' | 'balance'
}) {
  return (
    <div className="text-center">
      <TimeDisplay value={value} format={format} className="text-sm font-medium tabular-nums" />
      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{label}</div>
    </div>
  )
}
