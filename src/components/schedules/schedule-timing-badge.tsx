'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'

type TimingType = 'seconds' | 'minutes' | 'hours' | 'daily' | 'weekly' | 'monthly' | 'manual'

type BadgeVariant = 'purple' | 'blue' | 'cyan' | 'green' | 'amber' | 'orange' | 'gray'

interface TimingConfig {
  interval?: number
  time?: string
  day_of_week?: number
  day_of_month?: number
}

interface ScheduleTimingBadgeProps {
  timingType: string
  timingConfig?: unknown
}

const timingVariants: Record<TimingType, BadgeVariant> = {
  seconds: 'purple',
  minutes: 'blue',
  hours: 'cyan',
  daily: 'green',
  weekly: 'amber',
  monthly: 'orange',
  manual: 'gray',
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function ScheduleTimingBadge({ timingType, timingConfig }: ScheduleTimingBadgeProps) {
  const t = useTranslations('adminSchedules')
  const type = timingType as TimingType
  const config = timingConfig as TimingConfig | undefined

  const getLabel = (): string => {
    switch (type) {
      case 'seconds':
        return t('timingSeconds', { interval: config?.interval ?? 0 })
      case 'minutes':
        return t('timingMinutes', { interval: config?.interval ?? 0 })
      case 'hours':
        return t('timingHours', { interval: config?.interval ?? 0 })
      case 'daily':
        return t('timingDaily', { time: config?.time ?? '00:00' })
      case 'weekly': {
        const dayIndex = config?.day_of_week ?? 0
        return t('timingWeekly', {
          day: DAYS_OF_WEEK[dayIndex] ?? 'Sunday',
          time: config?.time ?? '00:00',
        })
      }
      case 'monthly':
        return t('timingMonthly', {
          day: config?.day_of_month ?? 1,
          time: config?.time ?? '00:00',
        })
      case 'manual':
        return t('timingManual')
      default:
        return timingType
    }
  }

  return (
    <Badge variant={timingVariants[type]}>
      {getLabel()}
    </Badge>
  )
}
