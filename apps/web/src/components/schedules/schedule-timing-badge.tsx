'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/lib/api/types'

type Schedule = components['schemas']['Schedule']
type TimingType = Schedule['timing_type']
type TimingConfig = components['schemas']['TimingConfig']

interface ScheduleTimingBadgeProps {
  timingType: TimingType
  timingConfig?: TimingConfig
}

const timingStyleConfig: Record<TimingType, string> = {
  seconds: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  minutes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  hours: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  daily: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  weekly: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  monthly: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  manual: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function ScheduleTimingBadge({ timingType, timingConfig }: ScheduleTimingBadgeProps) {
  const t = useTranslations('adminSchedules')

  const getLabel = (): string => {
    switch (timingType) {
      case 'seconds':
        return t('timingSeconds', { interval: timingConfig?.interval ?? 0 })
      case 'minutes':
        return t('timingMinutes', { interval: timingConfig?.interval ?? 0 })
      case 'hours':
        return t('timingHours', { interval: timingConfig?.interval ?? 0 })
      case 'daily':
        return t('timingDaily', { time: timingConfig?.time ?? '00:00' })
      case 'weekly': {
        const dayIndex = timingConfig?.day_of_week ?? 0
        return t('timingWeekly', {
          day: DAYS_OF_WEEK[dayIndex] ?? 'Sunday',
          time: timingConfig?.time ?? '00:00',
        })
      }
      case 'monthly':
        return t('timingMonthly', {
          day: timingConfig?.day_of_month ?? 1,
          time: timingConfig?.time ?? '00:00',
        })
      case 'manual':
        return t('timingManual')
      default:
        return timingType
    }
  }

  return (
    <Badge variant="secondary" className={timingStyleConfig[timingType]}>
      {getLabel()}
    </Badge>
  )
}
