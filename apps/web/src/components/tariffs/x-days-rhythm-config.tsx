'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']

interface DayPlanAssignment {
  dayPosition: number
  dayPlanId: string | null
}

interface XDaysRhythmConfigProps {
  cycleDays: number | null
  dayPlans: DayPlanAssignment[]
  availableDayPlans: DayPlan[]
  onCycleDaysChange: (days: number | null) => void
  onDayPlansChange: (plans: DayPlanAssignment[]) => void
  disabled?: boolean
}

export function XDaysRhythmConfig({
  cycleDays,
  dayPlans,
  availableDayPlans,
  onCycleDaysChange,
  onDayPlansChange,
  disabled,
}: XDaysRhythmConfigProps) {
  const t = useTranslations('adminTariffs')

  // When cycle days change, update the day plans array
  React.useEffect(() => {
    if (!cycleDays || cycleDays < 1) return

    const newPlans: DayPlanAssignment[] = []
    for (let i = 1; i <= cycleDays; i++) {
      const existing = dayPlans.find((dp) => dp.dayPosition === i)
      newPlans.push({
        dayPosition: i,
        dayPlanId: existing?.dayPlanId ?? null,
      })
    }

    if (JSON.stringify(newPlans) !== JSON.stringify(dayPlans)) {
      onDayPlansChange(newPlans)
    }
  }, [cycleDays, dayPlans, onDayPlansChange])

  const handleDayPlanChange = (position: number, dayPlanId: string | null) => {
    const newPlans = dayPlans.map((dp) =>
      dp.dayPosition === position ? { ...dp, dayPlanId } : dp
    )
    onDayPlansChange(newPlans)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cycleDays">{t('cycleLengthDays')}</Label>
        <Input
          id="cycleDays"
          type="number"
          min="1"
          max="365"
          value={cycleDays ?? ''}
          onChange={(e) => onCycleDaysChange(e.target.value ? parseInt(e.target.value) : null)}
          disabled={disabled}
          placeholder={t('cycleDaysPlaceholder')}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          {t('cycleDaysHelp')}
        </p>
      </div>

      {cycleDays && cycleDays > 0 && (
        <div className="space-y-2">
          <Label>{t('dayPlanAssignments')}</Label>
          <ScrollArea className="h-64 border rounded-lg">
            <div className="p-2 space-y-1">
              {dayPlans.map((dp) => (
                <div key={dp.dayPosition} className="flex items-center gap-2 py-1">
                  <span className="w-16 text-sm font-medium">{t('dayNumber', { number: dp.dayPosition })}:</span>
                  <Select
                    value={dp.dayPlanId ?? ''}
                    onValueChange={(v) =>
                      handleDayPlanChange(dp.dayPosition, v || null)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={t('selectDayPlan')} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDayPlans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.code} - {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </ScrollArea>
          <p className="text-xs text-muted-foreground">
            {t('dayPlanAssignmentsHelp')}
          </p>
        </div>
      )}
    </div>
  )
}
