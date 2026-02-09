'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { useCreateSchedule, useUpdateSchedule } from '@/hooks/api'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { components } from '@/lib/api/types'

type Schedule = components['schemas']['Schedule']
type TimingType = Schedule['timing_type']

interface ScheduleFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule?: Schedule | null
  onSuccess?: () => void
}

interface FormState {
  name: string
  description: string
  timingType: TimingType
  interval: number
  time: string
  dayOfWeek: number
  dayOfMonth: number
  isEnabled: boolean
}

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  timingType: 'daily',
  interval: 60,
  time: '00:00',
  dayOfWeek: 1,
  dayOfMonth: 1,
  isEnabled: true,
}

const TIMING_TYPES: TimingType[] = [
  'seconds',
  'minutes',
  'hours',
  'daily',
  'weekly',
  'monthly',
  'manual',
]

const TIMING_TYPE_LABELS: Record<TimingType, 'timingTypeSeconds' | 'timingTypeMinutes' | 'timingTypeHours' | 'timingTypeDaily' | 'timingTypeWeekly' | 'timingTypeMonthly' | 'timingTypeManual'> = {
  seconds: 'timingTypeSeconds',
  minutes: 'timingTypeMinutes',
  hours: 'timingTypeHours',
  daily: 'timingTypeDaily',
  weekly: 'timingTypeWeekly',
  monthly: 'timingTypeMonthly',
  manual: 'timingTypeManual',
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export function ScheduleFormSheet({
  open,
  onOpenChange,
  schedule,
  onSuccess,
}: ScheduleFormSheetProps) {
  const t = useTranslations('adminSchedules')
  const isEdit = !!schedule
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateSchedule()
  const updateMutation = useUpdateSchedule()

  React.useEffect(() => {
    if (open) {
      if (schedule) {
        setForm({
          name: schedule.name ?? '',
          description: schedule.description ?? '',
          timingType: schedule.timing_type ?? 'daily',
          interval: schedule.timing_config?.interval ?? 60,
          time: schedule.timing_config?.time ?? '00:00',
          dayOfWeek: schedule.timing_config?.day_of_week ?? 1,
          dayOfMonth: schedule.timing_config?.day_of_month ?? 1,
          isEnabled: schedule.is_enabled ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, schedule])

  const buildTimingConfig = () => {
    switch (form.timingType) {
      case 'seconds':
      case 'minutes':
      case 'hours':
        return { interval: form.interval }
      case 'daily':
        return { time: form.time }
      case 'weekly':
        return { time: form.time, day_of_week: form.dayOfWeek }
      case 'monthly':
        return { time: form.time, day_of_month: form.dayOfMonth }
      case 'manual':
      default:
        return {}
    }
  }

  const handleSubmit = async () => {
    setError(null)

    if (!form.name.trim()) {
      setError(t('validationNameRequired'))
      return
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      timing_type: form.timingType,
      timing_config: buildTimingConfig(),
      is_enabled: form.isEnabled,
    }

    try {
      if (isEdit && schedule) {
        await updateMutation.mutateAsync({
          path: { id: schedule.id },
          body: payload,
        })
      } else {
        await createMutation.mutateAsync({ body: payload })
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? t(isEdit ? 'failedUpdate' : 'failedCreate')
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editSchedule') : t('newSchedule')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldNamePlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('fieldDescriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            {/* Timing Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('sectionTiming')}
              </h3>

              <div className="space-y-2">
                <Label htmlFor="timingType">{t('fieldTimingType')}</Label>
                <Select
                  value={form.timingType}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, timingType: v as TimingType }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="timingType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMING_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(TIMING_TYPE_LABELS[type])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dynamic Timing Config Fields */}
              {['seconds', 'minutes', 'hours'].includes(form.timingType) && (
                <div className="space-y-2">
                  <Label htmlFor="interval">{t('fieldInterval')}</Label>
                  <Input
                    id="interval"
                    type="number"
                    min={1}
                    value={form.interval}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        interval: parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
              )}

              {['daily', 'weekly', 'monthly'].includes(form.timingType) && (
                <div className="space-y-2">
                  <Label htmlFor="time">{t('fieldTime')}</Label>
                  <Input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
                    disabled={isSubmitting}
                  />
                </div>
              )}

              {form.timingType === 'weekly' && (
                <div className="space-y-2">
                  <Label htmlFor="dayOfWeek">{t('fieldDayOfWeek')}</Label>
                  <Select
                    value={String(form.dayOfWeek)}
                    onValueChange={(v) =>
                      setForm((prev) => ({ ...prev, dayOfWeek: parseInt(v, 10) }))
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="dayOfWeek">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((day) => (
                        <SelectItem key={day.value} value={String(day.value)}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.timingType === 'monthly' && (
                <div className="space-y-2">
                  <Label htmlFor="dayOfMonth">{t('fieldDayOfMonth')}</Label>
                  <Select
                    value={String(form.dayOfMonth)}
                    onValueChange={(v) =>
                      setForm((prev) => ({ ...prev, dayOfMonth: parseInt(v, 10) }))
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="dayOfMonth">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...Array(31)].map((_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Status */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isEnabled">{t('fieldEnabled')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('fieldEnabledDescription')}
                  </p>
                </div>
                <Switch
                  id="isEnabled"
                  checked={form.isEnabled}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isEnabled: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
