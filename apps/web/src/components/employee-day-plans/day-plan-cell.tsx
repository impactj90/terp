'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { components } from '@/lib/api/types'

type EmployeeDayPlan = components['schemas']['EmployeeDayPlan']
type EmployeeDayPlanSource = components['schemas']['EmployeeDayPlanSource']

interface DayPlanCellProps {
  dayPlan: EmployeeDayPlan | null
  date: Date
  isWeekend: boolean
  isToday: boolean
  onClick?: () => void
  className?: string
}

const sourceColorClasses: Record<EmployeeDayPlanSource, string> = {
  tariff: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  manual: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  holiday: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
}

const sourceDotClasses: Record<EmployeeDayPlanSource, string> = {
  tariff: 'bg-blue-500',
  manual: 'bg-green-500',
  holiday: 'bg-orange-500',
}

export function DayPlanCell({
  dayPlan,
  date: _date,
  isWeekend,
  isToday: isTodayDate,
  onClick,
  className,
}: DayPlanCellProps) {
  const t = useTranslations('employeeDayPlans')

  const sourceLabel = dayPlan
    ? dayPlan.source === 'tariff'
      ? t('sourceTariff')
      : dayPlan.source === 'manual'
        ? t('sourceManual')
        : t('sourceHoliday')
    : undefined

  const tooltipParts: string[] = []
  if (dayPlan?.day_plan?.name) {
    tooltipParts.push(t('tooltipDayPlan', { name: dayPlan.day_plan.name }))
  }
  if (sourceLabel) {
    tooltipParts.push(t('tooltipSource', { source: sourceLabel }))
  }
  if (dayPlan?.notes) {
    tooltipParts.push(t('tooltipNotes', { notes: dayPlan.notes }))
  }
  if (!dayPlan) {
    tooltipParts.push(t('offDay'))
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltipParts.join('\n')}
      className={cn(
        'h-10 w-full min-w-[60px] rounded-sm text-xs transition-colors',
        'hover:bg-accent/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'flex items-center justify-center gap-1',
        isTodayDate && 'ring-1 ring-primary/50',
        isWeekend && !dayPlan && 'bg-muted/20',
        dayPlan ? sourceColorClasses[dayPlan.source] : 'bg-muted/30 border border-dashed border-muted-foreground/20',
        className
      )}
    >
      {dayPlan ? (
        <>
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full shrink-0',
              sourceDotClasses[dayPlan.source]
            )}
          />
          <span className="truncate font-medium">
            {dayPlan.day_plan?.code ?? '-'}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground/50">-</span>
      )}
    </button>
  )
}
