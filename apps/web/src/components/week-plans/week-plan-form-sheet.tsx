'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCreateWeekPlan,
  useUpdateWeekPlan,
  useWeekPlan,
  useDayPlans,
} from '@/hooks/api'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type WeekPlan = components['schemas']['WeekPlan']
type DayPlan = components['schemas']['DayPlan']

interface WeekPlanFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekPlan?: WeekPlan | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  mondayDayPlanId: string | null
  tuesdayDayPlanId: string | null
  wednesdayDayPlanId: string | null
  thursdayDayPlanId: string | null
  fridayDayPlanId: string | null
  saturdayDayPlanId: string | null
  sundayDayPlanId: string | null
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  mondayDayPlanId: null,
  tuesdayDayPlanId: null,
  wednesdayDayPlanId: null,
  thursdayDayPlanId: null,
  fridayDayPlanId: null,
  saturdayDayPlanId: null,
  sundayDayPlanId: null,
  isActive: true,
}

const DAYS = [
  { key: 'monday', labelKey: 'monday' as const, shortKey: 'mon' as const, formKey: 'mondayDayPlanId' as const, weekend: false },
  { key: 'tuesday', labelKey: 'tuesday' as const, shortKey: 'tue' as const, formKey: 'tuesdayDayPlanId' as const, weekend: false },
  { key: 'wednesday', labelKey: 'wednesday' as const, shortKey: 'wed' as const, formKey: 'wednesdayDayPlanId' as const, weekend: false },
  { key: 'thursday', labelKey: 'thursday' as const, shortKey: 'thu' as const, formKey: 'thursdayDayPlanId' as const, weekend: false },
  { key: 'friday', labelKey: 'friday' as const, shortKey: 'fri' as const, formKey: 'fridayDayPlanId' as const, weekend: false },
  { key: 'saturday', labelKey: 'saturday' as const, shortKey: 'sat' as const, formKey: 'saturdayDayPlanId' as const, weekend: true },
  { key: 'sunday', labelKey: 'sunday' as const, shortKey: 'sun' as const, formKey: 'sundayDayPlanId' as const, weekend: true },
]

function validateForm(form: FormState, isEdit: boolean): string[] {
  const errors: string[] = []
  if (!isEdit && !form.code.trim()) errors.push('Code is required')
  if (!form.name.trim()) errors.push('Name is required')

  // All 7 days must have a day plan assigned (per ZMI manual section 11.2)
  const missingDays: string[] = []
  if (!form.mondayDayPlanId) missingDays.push('Monday')
  if (!form.tuesdayDayPlanId) missingDays.push('Tuesday')
  if (!form.wednesdayDayPlanId) missingDays.push('Wednesday')
  if (!form.thursdayDayPlanId) missingDays.push('Thursday')
  if (!form.fridayDayPlanId) missingDays.push('Friday')
  if (!form.saturdayDayPlanId) missingDays.push('Saturday')
  if (!form.sundayDayPlanId) missingDays.push('Sunday')

  if (missingDays.length > 0) {
    errors.push(`Day plan required for: ${missingDays.join(', ')}`)
  }

  return errors
}

export function WeekPlanFormSheet({
  open,
  onOpenChange,
  weekPlan,
  onSuccess,
}: WeekPlanFormSheetProps) {
  const t = useTranslations('adminWeekPlans')
  const isEdit = !!weekPlan
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Fetch full week plan details when editing
  const { data: fullWeekPlan } = useWeekPlan(weekPlan?.id ?? '', open && isEdit)

  // Fetch active day plans for dropdown
  const { data: dayPlansData } = useDayPlans({ active: true, enabled: open })
  const dayPlans = dayPlansData?.data ?? []

  const createMutation = useCreateWeekPlan()
  const updateMutation = useUpdateWeekPlan()

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      setError(null)
      if (fullWeekPlan) {
        setForm({
          code: fullWeekPlan.code,
          name: fullWeekPlan.name,
          description: fullWeekPlan.description ?? '',
          mondayDayPlanId: fullWeekPlan.monday_day_plan_id ?? null,
          tuesdayDayPlanId: fullWeekPlan.tuesday_day_plan_id ?? null,
          wednesdayDayPlanId: fullWeekPlan.wednesday_day_plan_id ?? null,
          thursdayDayPlanId: fullWeekPlan.thursday_day_plan_id ?? null,
          fridayDayPlanId: fullWeekPlan.friday_day_plan_id ?? null,
          saturdayDayPlanId: fullWeekPlan.saturday_day_plan_id ?? null,
          sundayDayPlanId: fullWeekPlan.sunday_day_plan_id ?? null,
          isActive: fullWeekPlan.is_active ?? true,
        })
      } else if (!isEdit) {
        setForm(INITIAL_STATE)
      }
    }
  }, [open, fullWeekPlan, isEdit])

  // Calculate weekly summary
  const summary = React.useMemo(() => {
    const dayPlanIds = [
      form.mondayDayPlanId,
      form.tuesdayDayPlanId,
      form.wednesdayDayPlanId,
      form.thursdayDayPlanId,
      form.fridayDayPlanId,
      form.saturdayDayPlanId,
      form.sundayDayPlanId,
    ]
    const workDays = dayPlanIds.filter(Boolean).length

    // Calculate total hours from day plans
    let totalMinutes = 0
    dayPlanIds.forEach((id) => {
      if (id) {
        const dp = dayPlans.find((d) => d.id === id)
        if (dp) totalMinutes += dp.regular_hours
      }
    })

    return { workDays, totalMinutes }
  }, [form, dayPlans])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const errors = validateForm(form, isEdit)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      const body = {
        code: form.code,
        name: form.name,
        description: form.description || undefined,
        monday_day_plan_id: form.mondayDayPlanId || undefined,
        tuesday_day_plan_id: form.tuesdayDayPlanId || undefined,
        wednesday_day_plan_id: form.wednesdayDayPlanId || undefined,
        thursday_day_plan_id: form.thursdayDayPlanId || undefined,
        friday_day_plan_id: form.fridayDayPlanId || undefined,
        saturday_day_plan_id: form.saturdayDayPlanId || undefined,
        sunday_day_plan_id: form.sundayDayPlanId || undefined,
        is_active: form.isActive,
      }

      if (isEdit && weekPlan) {
        await updateMutation.mutateAsync({
          path: { id: weekPlan.id },
          body,
        })
      } else {
        await createMutation.mutateAsync({ body })
      }
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorOccurred'))
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('titleEdit') : t('titleCreate')}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? t('descriptionEdit')
              : t('descriptionCreate')}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Basic Information */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">{t('sectionBasicInformation')}</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">{t('fieldCode')} *</Label>
                    <Input
                      id="code"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      disabled={isEdit}
                      placeholder={t('placeholderCode')}
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('fieldName')} *</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder={t('placeholderName')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('fieldDescription')}</Label>
                  <Input
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder={t('placeholderDescription')}
                  />
                </div>
              </div>

              {/* Week Schedule */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">{t('sectionWeekSchedule')}</h4>
                <p className="text-sm text-muted-foreground">
                  {t('weekScheduleDescription')}
                </p>

                <div className="grid grid-cols-1 gap-3">
                  {DAYS.map((day) => (
                    <DayPlanSelector
                      key={day.key}
                      dayLabelKey={day.labelKey}
                      value={form[day.formKey]}
                      onChange={(id) => setForm({ ...form, [day.formKey]: id })}
                      dayPlans={dayPlans}
                      isWeekend={day.weekend}
                    />
                  ))}
                </div>
              </div>

              {/* Weekly Summary */}
              <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                <h4 className="text-sm font-medium">{t('sectionWeeklySummary')}</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('labelWorkDays')}:</span>
                    <span className="font-medium">{summary.workDays}/7</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('labelTotalHours')}:</span>
                    <span className="font-medium">{formatDuration(summary.totalMinutes)}</span>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(c) => setForm({ ...form, isActive: !!c })}
                />
                <Label htmlFor="isActive" className="font-normal">
                  {t('fieldActive')}
                </Label>
              </div>
            </div>
          </ScrollArea>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <SheetFooter className="mt-6 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t('buttonCancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? t('buttonSaveChanges') : t('buttonCreateWeekPlan')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function DayPlanSelector({
  dayLabelKey,
  value,
  onChange,
  dayPlans,
  isWeekend,
}: {
  dayLabelKey: string
  value: string | null
  onChange: (id: string | null) => void
  dayPlans: DayPlan[]
  isWeekend: boolean
}) {
  const t = useTranslations('adminWeekPlans')
  const selectedPlan = value ? dayPlans.find((d) => d.id === value) : null
  const hasError = !value

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-3 border rounded-lg',
        isWeekend && 'bg-muted/30',
        hasError && 'border-destructive/50'
      )}
    >
      <Label className="w-24 text-sm font-medium shrink-0">{t(dayLabelKey as Parameters<typeof t>[0])} *</Label>
      <Select
        value={value ?? ''}
        onValueChange={(v) => onChange(v || null)}
      >
        <SelectTrigger className={cn('flex-1', hasError && 'border-destructive')}>
          <SelectValue placeholder={t('placeholderSelectDayPlan')} />
        </SelectTrigger>
        <SelectContent>
          {dayPlans.map((dp) => (
            <SelectItem key={dp.id} value={dp.id}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{dp.code}</span>
                <span>{dp.name}</span>
                <Badge variant="outline" className="text-xs ml-auto">
                  {dp.plan_type === 'fixed' ? t('typeFixed') : t('typeFlex')}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedPlan && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDuration(selectedPlan.regular_hours)}
        </span>
      )}
    </div>
  )
}
