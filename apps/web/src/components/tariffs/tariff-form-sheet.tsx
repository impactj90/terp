'use client'

import * as React from 'react'
import { Loader2, CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DurationInput } from '@/components/ui/duration-input'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useCreateTariff, useUpdateTariff, useTariff, useWeekPlans, useDayPlans } from '@/hooks/api'
import { parseISODate } from '@/lib/time-utils'
import { RollingWeekPlanSelector } from './rolling-week-plan-selector'
import { XDaysRhythmConfig } from './x-days-rhythm-config'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']

interface TariffFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tariff?: Tariff | null
  onSuccess?: () => void
}

interface FormState {
  // Basic
  code: string
  name: string
  description: string
  isActive: boolean

  // Week Plan (for weekly rhythm)
  weekPlanId: string
  validFrom: Date | undefined
  validTo: Date | undefined

  // Rhythm Configuration
  rhythmType: 'weekly' | 'rolling_weekly' | 'x_days'
  cycleDays: number | null
  rhythmStartDate: Date | undefined
  weekPlanIds: string[] // For rolling_weekly
  dayPlans: { dayPosition: number; dayPlanId: string | null }[] // For x_days

  // Vacation Settings
  annualVacationDays: number | null
  workDaysPerWeek: number | null
  vacationBasis: 'calendar_year' | 'entry_date'

  // Target Hours (stored as hours)
  dailyTargetHours: number | null
  weeklyTargetHours: number | null
  monthlyTargetHours: number | null
  annualTargetHours: number | null

  // Flextime/Monthly Evaluation (stored in minutes)
  maxFlextimePerMonth: number | null
  upperLimitAnnual: number | null
  lowerLimitAnnual: number | null
  flextimeThreshold: number | null
  creditType: 'no_evaluation' | 'complete' | 'after_threshold' | 'no_carryover'
}

const INITIAL_STATE: FormState = {
  // Basic
  code: '',
  name: '',
  description: '',
  isActive: true,

  // Week Plan
  weekPlanId: '',
  validFrom: undefined,
  validTo: undefined,

  // Rhythm
  rhythmType: 'weekly',
  cycleDays: null,
  rhythmStartDate: undefined,
  weekPlanIds: [],
  dayPlans: [],

  // Vacation
  annualVacationDays: null,
  workDaysPerWeek: 5,
  vacationBasis: 'calendar_year',

  // Target Hours
  dailyTargetHours: null,
  weeklyTargetHours: null,
  monthlyTargetHours: null,
  annualTargetHours: null,

  // Flextime
  maxFlextimePerMonth: null,
  upperLimitAnnual: null,
  lowerLimitAnnual: null,
  flextimeThreshold: null,
  creditType: 'no_evaluation',
}

function validateForm(form: FormState, isEdit: boolean): string[] {
  const errors: string[] = []
  if (!isEdit && !form.code.trim()) errors.push('Code is required')
  if (form.code.length > 20) errors.push('Code must be 20 characters or less')
  if (!form.name.trim()) errors.push('Name is required')
  if (form.name.length > 255) errors.push('Name must be 255 characters or less')
  if (form.validFrom && form.validTo && form.validFrom > form.validTo) {
    errors.push('Valid To must be after Valid From')
  }
  return errors
}

export function TariffFormSheet({
  open,
  onOpenChange,
  tariff,
  onSuccess,
}: TariffFormSheetProps) {
  const isEdit = !!tariff
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [validFromMonth, setValidFromMonth] = React.useState(new Date())
  const [validToMonth, setValidToMonth] = React.useState(new Date())

  // Fetch full tariff details when editing
  const { data: fullTariff } = useTariff(tariff?.id ?? '', open && isEdit)

  // Fetch week plans for selector
  const { data: weekPlansData, isLoading: loadingWeekPlans } = useWeekPlans({
    active: true,
    enabled: open,
  })
  const weekPlans = weekPlansData?.data ?? []

  // Fetch day plans for x_days rhythm
  const { data: dayPlansData } = useDayPlans({ active: true, enabled: open })
  const dayPlans = dayPlansData?.data ?? []

  const createMutation = useCreateTariff()
  const updateMutation = useUpdateTariff()

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      setError(null)
      if (fullTariff) {
        setForm({
          code: fullTariff.code,
          name: fullTariff.name,
          description: fullTariff.description ?? '',
          isActive: fullTariff.is_active ?? true,

          // Week Plan / Rhythm
          weekPlanId: fullTariff.week_plan_id ?? '',
          validFrom: fullTariff.valid_from ? parseISODate(fullTariff.valid_from) : undefined,
          validTo: fullTariff.valid_to ? parseISODate(fullTariff.valid_to) : undefined,
          rhythmType: fullTariff.rhythm_type ?? 'weekly',
          cycleDays: fullTariff.cycle_days ?? null,
          rhythmStartDate: fullTariff.rhythm_start_date
            ? parseISODate(fullTariff.rhythm_start_date)
            : undefined,
          weekPlanIds: fullTariff.tariff_week_plans?.map((twp) => twp.week_plan_id) ?? [],
          dayPlans:
            fullTariff.tariff_day_plans?.map((tdp) => ({
              dayPosition: tdp.day_position,
              dayPlanId: tdp.day_plan_id ?? null,
            })) ?? [],

          // Vacation
          annualVacationDays: fullTariff.annual_vacation_days ?? null,
          workDaysPerWeek: fullTariff.work_days_per_week ?? 5,
          vacationBasis: fullTariff.vacation_basis ?? 'calendar_year',

          // Target Hours
          dailyTargetHours: fullTariff.daily_target_hours ?? null,
          weeklyTargetHours: fullTariff.weekly_target_hours ?? null,
          monthlyTargetHours: fullTariff.monthly_target_hours ?? null,
          annualTargetHours: fullTariff.annual_target_hours ?? null,

          // Flextime
          maxFlextimePerMonth: fullTariff.max_flextime_per_month ?? null,
          upperLimitAnnual: fullTariff.upper_limit_annual ?? null,
          lowerLimitAnnual: fullTariff.lower_limit_annual ?? null,
          flextimeThreshold: fullTariff.flextime_threshold ?? null,
          creditType: fullTariff.credit_type ?? 'no_evaluation',
        })
      } else if (!isEdit) {
        setForm(INITIAL_STATE)
      }
    }
  }, [open, fullTariff, isEdit])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const errors = validateForm(form, isEdit)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      // Helper to convert null to undefined for API
      const nullToUndefined = <T,>(value: T | null): T | undefined =>
        value === null ? undefined : value

      // Build common fields for both create and update
      const commonFields = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        valid_from: form.validFrom ? format(form.validFrom, 'yyyy-MM-dd') : undefined,
        valid_to: form.validTo ? format(form.validTo, 'yyyy-MM-dd') : undefined,

        // Rhythm fields
        rhythm_type: form.rhythmType,
        cycle_days:
          form.rhythmType === 'x_days' ? nullToUndefined(form.cycleDays) : undefined,
        rhythm_start_date:
          form.rhythmType !== 'weekly' && form.rhythmStartDate
            ? format(form.rhythmStartDate, 'yyyy-MM-dd')
            : undefined,

        // Week plan (for weekly rhythm)
        week_plan_id: form.rhythmType === 'weekly' ? form.weekPlanId || undefined : undefined,

        // Week plan IDs (for rolling_weekly)
        week_plan_ids: form.rhythmType === 'rolling_weekly' ? form.weekPlanIds : undefined,

        // Day plans (for x_days)
        day_plans:
          form.rhythmType === 'x_days'
            ? form.dayPlans.map((dp) => ({
                day_position: dp.dayPosition,
                day_plan_id: nullToUndefined(dp.dayPlanId),
              }))
            : undefined,

        // Vacation fields
        annual_vacation_days: nullToUndefined(form.annualVacationDays),
        work_days_per_week: nullToUndefined(form.workDaysPerWeek),
        vacation_basis: form.vacationBasis,

        // Target hours
        daily_target_hours: nullToUndefined(form.dailyTargetHours),
        weekly_target_hours: nullToUndefined(form.weeklyTargetHours),
        monthly_target_hours: nullToUndefined(form.monthlyTargetHours),
        annual_target_hours: nullToUndefined(form.annualTargetHours),

        // Flextime
        max_flextime_per_month: nullToUndefined(form.maxFlextimePerMonth),
        upper_limit_annual: nullToUndefined(form.upperLimitAnnual),
        lower_limit_annual: nullToUndefined(form.lowerLimitAnnual),
        flextime_threshold: nullToUndefined(form.flextimeThreshold),
        credit_type: form.creditType,
      }

      if (isEdit && tariff) {
        await updateMutation.mutateAsync({
          path: { id: tariff.id },
          body: {
            ...commonFields,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            ...commonFields,
          },
        })
      }
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? `Failed to ${isEdit ? 'update' : 'create'} tariff`)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  // Add state for rhythm start date calendar
  const [rhythmStartMonth, setRhythmStartMonth] = React.useState(new Date())

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Tariff' : 'Create Tariff'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update tariff settings and configuration.'
              : 'Create a new tariff for employee contracts.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 -mx-6 px-6">
            <Tabs defaultValue="basic" className="w-full py-4">
              <TabsList className="mb-4">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="vacation">Vacation</TabsTrigger>
                <TabsTrigger value="hours">Target Hours</TabsTrigger>
                <TabsTrigger value="flextime">Flextime</TabsTrigger>
              </TabsList>

              {/* Basic Tab */}
              <TabsContent value="basic" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code *</Label>
                    <Input
                      id="code"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      disabled={isEdit || isPending}
                      placeholder="e.g., TARIFF-001"
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      disabled={isPending}
                      placeholder="e.g., Standard Full-Time"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    disabled={isPending}
                    placeholder="Optional description..."
                    rows={3}
                  />
                </div>

                {isEdit && (
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isActive">Active</Label>
                      <p className="text-sm text-muted-foreground">
                        Inactive tariffs cannot be assigned to employees
                      </p>
                    </div>
                    <Switch
                      id="isActive"
                      checked={form.isActive}
                      onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                      disabled={isPending}
                    />
                  </div>
                )}
              </TabsContent>

              {/* Schedule Tab */}
              <TabsContent value="schedule" className="space-y-4">
                {/* Rhythm Type Selector */}
                <div className="space-y-2">
                  <Label>Rhythm Type</Label>
                  <Select
                    value={form.rhythmType}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        rhythmType: v as FormState['rhythmType'],
                        // Reset related fields
                        weekPlanIds: v === 'rolling_weekly' ? form.weekPlanIds : [],
                        dayPlans: v === 'x_days' ? form.dayPlans : [],
                        cycleDays: v === 'x_days' ? form.cycleDays : null,
                      })
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly (Single Plan)</SelectItem>
                      <SelectItem value="rolling_weekly">Rolling Weekly (Multiple Plans)</SelectItem>
                      <SelectItem value="x_days">X-Days Cycle</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {form.rhythmType === 'weekly' && 'Same week plan every week'}
                    {form.rhythmType === 'rolling_weekly' && 'Week plans rotate in sequence'}
                    {form.rhythmType === 'x_days' && 'Custom day cycle (not tied to weekdays)'}
                  </p>
                </div>

                {/* Weekly: Single Week Plan */}
                {form.rhythmType === 'weekly' && (
                  <div className="space-y-2">
                    <Label>Week Plan</Label>
                    <Select
                      value={form.weekPlanId || '__none__'}
                      onValueChange={(value) =>
                        setForm({ ...form, weekPlanId: value === '__none__' ? '' : value })
                      }
                      disabled={isPending || loadingWeekPlans}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select week plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {weekPlans.map((wp) => (
                          <SelectItem key={wp.id} value={wp.id}>
                            {wp.code} - {wp.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Rolling Weekly: Multiple Week Plans */}
                {form.rhythmType === 'rolling_weekly' && (
                  <RollingWeekPlanSelector
                    weekPlans={weekPlans}
                    selectedIds={form.weekPlanIds}
                    onChange={(ids) => setForm({ ...form, weekPlanIds: ids })}
                    disabled={isPending}
                  />
                )}

                {/* X-Days: Cycle Configuration */}
                {form.rhythmType === 'x_days' && (
                  <XDaysRhythmConfig
                    cycleDays={form.cycleDays}
                    dayPlans={form.dayPlans}
                    availableDayPlans={dayPlans}
                    onCycleDaysChange={(days) => setForm({ ...form, cycleDays: days })}
                    onDayPlansChange={(plans) => setForm({ ...form, dayPlans: plans })}
                    disabled={isPending}
                  />
                )}

                {/* Rhythm Start Date */}
                {form.rhythmType !== 'weekly' && (
                  <div className="space-y-2">
                    <Label>Rhythm Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !form.rhythmStartDate && 'text-muted-foreground'
                          )}
                          disabled={isPending}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.rhythmStartDate
                            ? format(form.rhythmStartDate, 'PPP')
                            : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          month={rhythmStartMonth}
                          onMonthChange={setRhythmStartMonth}
                          selected={form.rhythmStartDate}
                          onSelect={(date) =>
                            setForm({ ...form, rhythmStartDate: date as Date | undefined })
                          }
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      When the rhythm cycle begins for calculation
                    </p>
                  </div>
                )}

                {/* Validity Period */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-sm font-medium mb-3">Validity Period</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Valid From</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !form.validFrom && 'text-muted-foreground'
                            )}
                            disabled={isPending}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {form.validFrom ? format(form.validFrom, 'PPP') : 'Pick a date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            month={validFromMonth}
                            onMonthChange={setValidFromMonth}
                            selected={form.validFrom}
                            onSelect={(date) =>
                              setForm({ ...form, validFrom: date as Date | undefined })
                            }
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Valid To</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !form.validTo && 'text-muted-foreground'
                            )}
                            disabled={isPending}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {form.validTo ? format(form.validTo, 'PPP') : 'Pick a date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            month={validToMonth}
                            onMonthChange={setValidToMonth}
                            selected={form.validTo}
                            onSelect={(date) =>
                              setForm({ ...form, validTo: date as Date | undefined })
                            }
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Leave empty for no time restriction
                  </p>
                </div>
              </TabsContent>

              {/* Vacation Tab */}
              <TabsContent value="vacation" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Configure vacation entitlement and calculation settings.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="annualVacationDays">Annual Vacation Days</Label>
                    <Input
                      id="annualVacationDays"
                      type="number"
                      step="0.5"
                      min="0"
                      max="365"
                      value={form.annualVacationDays ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          annualVacationDays: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      disabled={isPending}
                      placeholder="e.g., 30"
                    />
                    <p className="text-xs text-muted-foreground">Base vacation days per year</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="workDaysPerWeek">Work Days per Week</Label>
                    <Select
                      value={form.workDaysPerWeek?.toString() ?? '5'}
                      onValueChange={(v) => setForm({ ...form, workDaysPerWeek: parseInt(v) })}
                      disabled={isPending}
                    >
                      <SelectTrigger id="workDaysPerWeek">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                          <SelectItem key={d} value={d.toString()}>
                            {d} day{d > 1 ? 's' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">For vacation pro-rating</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Vacation Year Basis</Label>
                  <Select
                    value={form.vacationBasis}
                    onValueChange={(v) =>
                      setForm({ ...form, vacationBasis: v as FormState['vacationBasis'] })
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="calendar_year">Calendar Year (Jan 1 - Dec 31)</SelectItem>
                      <SelectItem value="entry_date">Entry Date (Anniversary)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    When the vacation year starts for this tariff
                  </p>
                </div>
              </TabsContent>

              {/* Target Hours Tab */}
              <TabsContent value="hours" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Define target working hours. These can be used for reference and macros.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dailyTargetHours">Daily Target (hours)</Label>
                    <Input
                      id="dailyTargetHours"
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      value={form.dailyTargetHours ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          dailyTargetHours: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      disabled={isPending}
                      placeholder="e.g., 8.0"
                    />
                    <p className="text-xs text-muted-foreground">Hours per day</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="weeklyTargetHours">Weekly Target (hours)</Label>
                    <Input
                      id="weeklyTargetHours"
                      type="number"
                      step="0.5"
                      min="0"
                      max="168"
                      value={form.weeklyTargetHours ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          weeklyTargetHours: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      disabled={isPending}
                      placeholder="e.g., 40.0"
                    />
                    <p className="text-xs text-muted-foreground">Hours per week</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="monthlyTargetHours">Monthly Target (hours)</Label>
                    <Input
                      id="monthlyTargetHours"
                      type="number"
                      step="0.5"
                      min="0"
                      value={form.monthlyTargetHours ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          monthlyTargetHours: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      disabled={isPending}
                      placeholder="e.g., 173.33"
                    />
                    <p className="text-xs text-muted-foreground">Hours per month</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="annualTargetHours">Annual Target (hours)</Label>
                    <Input
                      id="annualTargetHours"
                      type="number"
                      step="1"
                      min="0"
                      value={form.annualTargetHours ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          annualTargetHours: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      disabled={isPending}
                      placeholder="e.g., 2080"
                    />
                    <p className="text-xs text-muted-foreground">Hours per year</p>
                  </div>
                </div>
              </TabsContent>

              {/* Flextime Tab */}
              <TabsContent value="flextime" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Configure monthly evaluation and flextime account limits.
                </p>

                <div className="space-y-2">
                  <Label>Credit Type</Label>
                  <Select
                    value={form.creditType}
                    onValueChange={(v) =>
                      setForm({ ...form, creditType: v as FormState['creditType'] })
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_evaluation">No Evaluation (1:1 Transfer)</SelectItem>
                      <SelectItem value="complete">Complete Carryover (with Limits)</SelectItem>
                      <SelectItem value="after_threshold">After Threshold</SelectItem>
                      <SelectItem value="no_carryover">No Carryover (Reset to 0)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    How flextime is credited at month end
                  </p>
                </div>

                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="text-sm font-medium">Account Limits</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="maxFlextimePerMonth">Max Flextime per Month</Label>
                      <DurationInput
                        id="maxFlextimePerMonth"
                        value={form.maxFlextimePerMonth}
                        onChange={(v) => setForm({ ...form, maxFlextimePerMonth: v })}
                        format="hhmm"
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Maximum monthly credit</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="flextimeThreshold">Flextime Threshold</Label>
                      <DurationInput
                        id="flextimeThreshold"
                        value={form.flextimeThreshold}
                        onChange={(v) => setForm({ ...form, flextimeThreshold: v })}
                        format="hhmm"
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Minimum overtime to qualify</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="upperLimitAnnual">Upper Limit (Annual)</Label>
                      <DurationInput
                        id="upperLimitAnnual"
                        value={form.upperLimitAnnual}
                        onChange={(v) => setForm({ ...form, upperLimitAnnual: v })}
                        format="hhmm"
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Annual flextime cap</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lowerLimitAnnual">Lower Limit (Annual)</Label>
                      <DurationInput
                        id="lowerLimitAnnual"
                        value={form.lowerLimitAnnual}
                        onChange={(v) => setForm({ ...form, lowerLimitAnnual: v })}
                        format="hhmm"
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Annual flextime floor (can be negative)
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Error Display */}
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </ScrollArea>

          <SheetFooter className="flex-row gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Tariff'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
