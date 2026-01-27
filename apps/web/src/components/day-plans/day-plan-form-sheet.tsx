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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TimeInput } from '@/components/ui/time-input'
import { DurationInput } from '@/components/ui/duration-input'
import { useCreateDayPlan, useUpdateDayPlan, useDayPlan } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']
type CreateDayPlanRequest = components['schemas']['CreateDayPlanRequest']
type UpdateDayPlanRequest = components['schemas']['UpdateDayPlanRequest']

interface DayPlanFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dayPlan?: DayPlan | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  planType: 'fixed' | 'flextime'
  comeFrom: number | null
  comeTo: number | null
  goFrom: number | null
  goTo: number | null
  coreStart: number | null
  coreEnd: number | null
  regularHours: number
  regularHours2: number | null
  fromEmployeeMaster: boolean
  toleranceComePlus: number
  toleranceComeMinus: number
  toleranceGoPlus: number
  toleranceGoMinus: number
  variableWorkTime: boolean
  roundingComeType: string
  roundingComeInterval: number | null
  roundingComeAddValue: number | null
  roundingGoType: string
  roundingGoInterval: number | null
  roundingGoAddValue: number | null
  roundAllBookings: boolean
  minWorkTime: number | null
  maxNetWorkTime: number | null
  holidayCreditCat1: number | null
  holidayCreditCat2: number | null
  holidayCreditCat3: number | null
  vacationDeduction: number
  noBookingBehavior: string
  dayChangeBehavior: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  planType: 'fixed',
  comeFrom: 420, // 07:00
  comeTo: null,
  goFrom: null,
  goTo: 1020, // 17:00
  coreStart: null,
  coreEnd: null,
  regularHours: 480, // 8 hours
  regularHours2: null,
  fromEmployeeMaster: false,
  toleranceComePlus: 0,
  toleranceComeMinus: 0,
  toleranceGoPlus: 0,
  toleranceGoMinus: 0,
  variableWorkTime: false,
  roundingComeType: 'none',
  roundingComeInterval: null,
  roundingComeAddValue: null,
  roundingGoType: 'none',
  roundingGoInterval: null,
  roundingGoAddValue: null,
  roundAllBookings: false,
  minWorkTime: null,
  maxNetWorkTime: null,
  holidayCreditCat1: null,
  holidayCreditCat2: null,
  holidayCreditCat3: null,
  vacationDeduction: 1.0,
  noBookingBehavior: 'error',
  dayChangeBehavior: 'none',
  isActive: true,
}

function validateForm(form: FormState, isEdit: boolean): string[] {
  const errors: string[] = []
  if (!isEdit && !form.code.trim()) errors.push('Code is required')
  if (!form.name.trim()) errors.push('Name is required')
  if (form.regularHours <= 0) errors.push('Regular hours must be greater than 0')
  return errors
}

export function DayPlanFormSheet({
  open,
  onOpenChange,
  dayPlan,
  onSuccess,
}: DayPlanFormSheetProps) {
  const t = useTranslations('adminDayPlans')
  const isEdit = !!dayPlan
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Fetch full day plan details when editing
  const { data: fullDayPlan } = useDayPlan(dayPlan?.id ?? '', open && isEdit)

  const createMutation = useCreateDayPlan()
  const updateMutation = useUpdateDayPlan()

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      setError(null)
      if (fullDayPlan) {
        setForm({
          code: fullDayPlan.code,
          name: fullDayPlan.name,
          description: fullDayPlan.description ?? '',
          planType: fullDayPlan.plan_type,
          comeFrom: fullDayPlan.come_from ?? null,
          comeTo: fullDayPlan.come_to ?? null,
          goFrom: fullDayPlan.go_from ?? null,
          goTo: fullDayPlan.go_to ?? null,
          coreStart: fullDayPlan.core_start ?? null,
          coreEnd: fullDayPlan.core_end ?? null,
          regularHours: fullDayPlan.regular_hours,
          regularHours2: fullDayPlan.regular_hours_2 ?? null,
          fromEmployeeMaster: fullDayPlan.from_employee_master ?? false,
          toleranceComePlus: fullDayPlan.tolerance_come_plus ?? 0,
          toleranceComeMinus: fullDayPlan.tolerance_come_minus ?? 0,
          toleranceGoPlus: fullDayPlan.tolerance_go_plus ?? 0,
          toleranceGoMinus: fullDayPlan.tolerance_go_minus ?? 0,
          variableWorkTime: fullDayPlan.variable_work_time ?? false,
          roundingComeType: fullDayPlan.rounding_come_type ?? 'none',
          roundingComeInterval: fullDayPlan.rounding_come_interval ?? null,
          roundingComeAddValue: fullDayPlan.rounding_come_add_value ?? null,
          roundingGoType: fullDayPlan.rounding_go_type ?? 'none',
          roundingGoInterval: fullDayPlan.rounding_go_interval ?? null,
          roundingGoAddValue: fullDayPlan.rounding_go_add_value ?? null,
          roundAllBookings: fullDayPlan.round_all_bookings ?? false,
          minWorkTime: fullDayPlan.min_work_time ?? null,
          maxNetWorkTime: fullDayPlan.max_net_work_time ?? null,
          holidayCreditCat1: fullDayPlan.holiday_credit_cat1 ?? null,
          holidayCreditCat2: fullDayPlan.holiday_credit_cat2 ?? null,
          holidayCreditCat3: fullDayPlan.holiday_credit_cat3 ?? null,
          vacationDeduction: fullDayPlan.vacation_deduction ?? 1.0,
          noBookingBehavior: fullDayPlan.no_booking_behavior ?? 'error',
          dayChangeBehavior: fullDayPlan.day_change_behavior ?? 'none',
          isActive: fullDayPlan.is_active ?? true,
        })
      } else if (!isEdit) {
        setForm(INITIAL_STATE)
      }
    }
  }, [open, fullDayPlan, isEdit])

  // Update comeTo/goFrom when planType changes
  React.useEffect(() => {
    if (form.planType === 'fixed') {
      setForm((prev) => ({
        ...prev,
        comeTo: null,
        goFrom: null,
      }))
    }
  }, [form.planType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const errors = validateForm(form, isEdit)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && dayPlan) {
        const body: UpdateDayPlanRequest = {
          name: form.name,
          description: form.description || undefined,
          plan_type: form.planType,
          come_from: form.comeFrom ?? undefined,
          come_to: form.comeTo ?? undefined,
          go_from: form.goFrom ?? undefined,
          go_to: form.goTo ?? undefined,
          core_start: form.coreStart ?? undefined,
          core_end: form.coreEnd ?? undefined,
          regular_hours: form.regularHours,
          regular_hours_2: form.regularHours2 ?? undefined,
          from_employee_master: form.fromEmployeeMaster,
          tolerance_come_plus: form.toleranceComePlus,
          tolerance_come_minus: form.toleranceComeMinus,
          tolerance_go_plus: form.toleranceGoPlus,
          tolerance_go_minus: form.toleranceGoMinus,
          variable_work_time: form.variableWorkTime,
          rounding_come_type: form.roundingComeType as UpdateDayPlanRequest['rounding_come_type'],
          rounding_come_interval: form.roundingComeInterval ?? undefined,
          rounding_come_add_value: form.roundingComeAddValue ?? undefined,
          rounding_go_type: form.roundingGoType as UpdateDayPlanRequest['rounding_go_type'],
          rounding_go_interval: form.roundingGoInterval ?? undefined,
          rounding_go_add_value: form.roundingGoAddValue ?? undefined,
          round_all_bookings: form.roundAllBookings,
          min_work_time: form.minWorkTime ?? undefined,
          max_net_work_time: form.maxNetWorkTime ?? undefined,
          holiday_credit_cat1: form.holidayCreditCat1 ?? undefined,
          holiday_credit_cat2: form.holidayCreditCat2 ?? undefined,
          holiday_credit_cat3: form.holidayCreditCat3 ?? undefined,
          vacation_deduction: form.vacationDeduction,
          no_booking_behavior: form.noBookingBehavior as UpdateDayPlanRequest['no_booking_behavior'],
          day_change_behavior: form.dayChangeBehavior as UpdateDayPlanRequest['day_change_behavior'],
          is_active: form.isActive,
        }
        await updateMutation.mutateAsync({ path: { id: dayPlan.id }, body })
      } else {
        const body: CreateDayPlanRequest = {
          code: form.code,
          name: form.name,
          description: form.description || undefined,
          plan_type: form.planType,
          come_from: form.comeFrom ?? undefined,
          come_to: form.comeTo ?? undefined,
          go_from: form.goFrom ?? undefined,
          go_to: form.goTo ?? undefined,
          core_start: form.coreStart ?? undefined,
          core_end: form.coreEnd ?? undefined,
          regular_hours: form.regularHours,
          regular_hours_2: form.regularHours2 ?? undefined,
          from_employee_master: form.fromEmployeeMaster,
          tolerance_come_plus: form.toleranceComePlus,
          tolerance_come_minus: form.toleranceComeMinus,
          tolerance_go_plus: form.toleranceGoPlus,
          tolerance_go_minus: form.toleranceGoMinus,
          variable_work_time: form.variableWorkTime,
          rounding_come_type: form.roundingComeType as CreateDayPlanRequest['rounding_come_type'],
          rounding_come_interval: form.roundingComeInterval ?? undefined,
          rounding_come_add_value: form.roundingComeAddValue ?? undefined,
          rounding_go_type: form.roundingGoType as CreateDayPlanRequest['rounding_go_type'],
          rounding_go_interval: form.roundingGoInterval ?? undefined,
          rounding_go_add_value: form.roundingGoAddValue ?? undefined,
          round_all_bookings: form.roundAllBookings,
          min_work_time: form.minWorkTime ?? undefined,
          max_net_work_time: form.maxNetWorkTime ?? undefined,
          holiday_credit_cat1: form.holidayCreditCat1 ?? undefined,
          holiday_credit_cat2: form.holidayCreditCat2 ?? undefined,
          holiday_credit_cat3: form.holidayCreditCat3 ?? undefined,
          vacation_deduction: form.vacationDeduction,
          no_booking_behavior: form.noBookingBehavior as CreateDayPlanRequest['no_booking_behavior'],
          day_change_behavior: form.dayChangeBehavior as CreateDayPlanRequest['day_change_behavior'],
          is_active: form.isActive,
        }
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
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('titleEdit') : t('titleCreate')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('descriptionEdit') : t('descriptionCreate')}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 -mx-6 px-6">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="basic">{t('tabBasic')}</TabsTrigger>
                <TabsTrigger value="time">{t('tabTimeWindows')}</TabsTrigger>
                <TabsTrigger value="tolerance">{t('tabTolerance')}</TabsTrigger>
                <TabsTrigger value="rounding">{t('tabRounding')}</TabsTrigger>
                <TabsTrigger value="special">{t('tabSpecial')}</TabsTrigger>
              </TabsList>

              {/* Basic Tab */}
              <TabsContent value="basic" className="space-y-4">
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
                    <Label htmlFor="planType">{t('fieldPlanType')} *</Label>
                    <Select
                      value={form.planType}
                      onValueChange={(v) => setForm({ ...form, planType: v as 'fixed' | 'flextime' })}
                    >
                      <SelectTrigger id="planType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">{t('typeFixedWorking')}</SelectItem>
                        <SelectItem value="flextime">{t('typeFlextime')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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

                <div className="space-y-2">
                  <Label htmlFor="description">{t('fieldDescription')}</Label>
                  <Input
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder={t('placeholderDescription')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="regularHours">{t('fieldTargetHours')} *</Label>
                    <DurationInput
                      id="regularHours"
                      value={form.regularHours}
                      onChange={(v) => setForm({ ...form, regularHours: v ?? 0 })}
                      format="hhmm"
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">{t('targetHoursHelp')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="regularHours2">{t('fieldAbsenceDayHours')}</Label>
                    <DurationInput
                      id="regularHours2"
                      value={form.regularHours2}
                      onChange={(v) => setForm({ ...form, regularHours2: v })}
                      format="hhmm"
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">{t('absenceDayHoursHelp')}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="fromEmployeeMaster"
                    checked={form.fromEmployeeMaster}
                    onCheckedChange={(c) => setForm({ ...form, fromEmployeeMaster: !!c })}
                  />
                  <Label htmlFor="fromEmployeeMaster" className="font-normal">
                    {t('fieldFromEmployeeMaster')}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(c) => setForm({ ...form, isActive: !!c })}
                  />
                  <Label htmlFor="isActive" className="font-normal">{t('fieldActive')}</Label>
                </div>
              </TabsContent>

              {/* Time Windows Tab */}
              <TabsContent value="time" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="comeFrom">{t('fieldArriveFrom')}</Label>
                    <TimeInput
                      id="comeFrom"
                      value={form.comeFrom}
                      onChange={(v) => setForm({ ...form, comeFrom: v })}
                      className="w-full"
                    />
                  </div>
                  {form.planType === 'flextime' && (
                    <div className="space-y-2">
                      <Label htmlFor="comeTo">{t('fieldArriveUntil')}</Label>
                      <TimeInput
                        id="comeTo"
                        value={form.comeTo}
                        onChange={(v) => setForm({ ...form, comeTo: v })}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {form.planType === 'flextime' && (
                    <div className="space-y-2">
                      <Label htmlFor="goFrom">{t('fieldLeaveFrom')}</Label>
                      <TimeInput
                        id="goFrom"
                        value={form.goFrom}
                        onChange={(v) => setForm({ ...form, goFrom: v })}
                        className="w-full"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="goTo">{t('fieldLeaveUntil')}</Label>
                    <TimeInput
                      id="goTo"
                      value={form.goTo}
                      onChange={(v) => setForm({ ...form, goTo: v })}
                      className="w-full"
                    />
                  </div>
                </div>

                {form.planType === 'flextime' && (
                  <>
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-3">{t('sectionCoreTime')}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="coreStart">{t('fieldCoreStart')}</Label>
                          <TimeInput
                            id="coreStart"
                            value={form.coreStart}
                            onChange={(v) => setForm({ ...form, coreStart: v })}
                            className="w-full"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="coreEnd">{t('fieldCoreEnd')}</Label>
                          <TimeInput
                            id="coreEnd"
                            value={form.coreEnd}
                            onChange={(v) => setForm({ ...form, coreEnd: v })}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-3">{t('sectionWorkTimeLimits')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="minWorkTime">{t('fieldMinWorkTime')}</Label>
                      <DurationInput
                        id="minWorkTime"
                        value={form.minWorkTime}
                        onChange={(v) => setForm({ ...form, minWorkTime: v })}
                        format="hhmm"
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxNetWorkTime">{t('fieldMaxNetWorkTime')}</Label>
                      <DurationInput
                        id="maxNetWorkTime"
                        value={form.maxNetWorkTime}
                        onChange={(v) => setForm({ ...form, maxNetWorkTime: v })}
                        format="hhmm"
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tolerance Tab */}
              <TabsContent value="tolerance" className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  {t('toleranceDescription')}
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="toleranceComeMinus">{t('fieldArriveEarly')}</Label>
                    <DurationInput
                      id="toleranceComeMinus"
                      value={form.toleranceComeMinus}
                      onChange={(v) => setForm({ ...form, toleranceComeMinus: v ?? 0 })}
                      format="minutes"
                      placeholder={t('placeholderMinutes')}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="toleranceComePlus">{t('fieldArriveLate')}</Label>
                    <DurationInput
                      id="toleranceComePlus"
                      value={form.toleranceComePlus}
                      onChange={(v) => setForm({ ...form, toleranceComePlus: v ?? 0 })}
                      format="minutes"
                      placeholder={t('placeholderMinutes')}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="toleranceGoMinus">{t('fieldLeaveEarly')}</Label>
                    <DurationInput
                      id="toleranceGoMinus"
                      value={form.toleranceGoMinus}
                      onChange={(v) => setForm({ ...form, toleranceGoMinus: v ?? 0 })}
                      format="minutes"
                      placeholder={t('placeholderMinutes')}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="toleranceGoPlus">{t('fieldLeaveLate')}</Label>
                    <DurationInput
                      id="toleranceGoPlus"
                      value={form.toleranceGoPlus}
                      onChange={(v) => setForm({ ...form, toleranceGoPlus: v ?? 0 })}
                      format="minutes"
                      placeholder={t('placeholderMinutes')}
                      className="w-full"
                    />
                  </div>
                </div>

                {form.planType === 'fixed' && (
                  <div className="flex items-center space-x-2 mt-4">
                    <Checkbox
                      id="variableWorkTime"
                      checked={form.variableWorkTime}
                      onCheckedChange={(c) => setForm({ ...form, variableWorkTime: !!c })}
                    />
                    <Label htmlFor="variableWorkTime" className="font-normal">
                      {t('fieldVariableWorkTime')}
                    </Label>
                  </div>
                )}
              </TabsContent>

              {/* Rounding Tab */}
              <TabsContent value="rounding" className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  {t('roundingDescription')}
                </p>

                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="text-sm font-medium">{t('sectionArrivalRounding')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="roundingComeType">{t('fieldRoundingType')}</Label>
                      <Select
                        value={form.roundingComeType}
                        onValueChange={(v) => setForm({ ...form, roundingComeType: v })}
                      >
                        <SelectTrigger id="roundingComeType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('roundingNone')}</SelectItem>
                          <SelectItem value="up">{t('roundingUp')}</SelectItem>
                          <SelectItem value="down">{t('roundingDown')}</SelectItem>
                          <SelectItem value="nearest">{t('roundingNearest')}</SelectItem>
                          <SelectItem value="add">{t('roundingAdd')}</SelectItem>
                          <SelectItem value="subtract">{t('roundingSubtract')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      {(form.roundingComeType === 'up' ||
                        form.roundingComeType === 'down' ||
                        form.roundingComeType === 'nearest') && (
                        <>
                          <Label htmlFor="roundingComeInterval">{t('fieldIntervalMinutes')}</Label>
                          <DurationInput
                            id="roundingComeInterval"
                            value={form.roundingComeInterval}
                            onChange={(v) => setForm({ ...form, roundingComeInterval: v })}
                            format="minutes"
                            className="w-full"
                          />
                        </>
                      )}
                      {(form.roundingComeType === 'add' || form.roundingComeType === 'subtract') && (
                        <>
                          <Label htmlFor="roundingComeAddValue">{t('fieldValueMinutes')}</Label>
                          <DurationInput
                            id="roundingComeAddValue"
                            value={form.roundingComeAddValue}
                            onChange={(v) => setForm({ ...form, roundingComeAddValue: v })}
                            format="minutes"
                            className="w-full"
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="text-sm font-medium">{t('sectionDepartureRounding')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="roundingGoType">{t('fieldRoundingType')}</Label>
                      <Select
                        value={form.roundingGoType}
                        onValueChange={(v) => setForm({ ...form, roundingGoType: v })}
                      >
                        <SelectTrigger id="roundingGoType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('roundingNone')}</SelectItem>
                          <SelectItem value="up">{t('roundingUp')}</SelectItem>
                          <SelectItem value="down">{t('roundingDown')}</SelectItem>
                          <SelectItem value="nearest">{t('roundingNearest')}</SelectItem>
                          <SelectItem value="add">{t('roundingAdd')}</SelectItem>
                          <SelectItem value="subtract">{t('roundingSubtract')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      {(form.roundingGoType === 'up' ||
                        form.roundingGoType === 'down' ||
                        form.roundingGoType === 'nearest') && (
                        <>
                          <Label htmlFor="roundingGoInterval">{t('fieldIntervalMinutes')}</Label>
                          <DurationInput
                            id="roundingGoInterval"
                            value={form.roundingGoInterval}
                            onChange={(v) => setForm({ ...form, roundingGoInterval: v })}
                            format="minutes"
                            className="w-full"
                          />
                        </>
                      )}
                      {(form.roundingGoType === 'add' || form.roundingGoType === 'subtract') && (
                        <>
                          <Label htmlFor="roundingGoAddValue">{t('fieldValueMinutes')}</Label>
                          <DurationInput
                            id="roundingGoAddValue"
                            value={form.roundingGoAddValue}
                            onChange={(v) => setForm({ ...form, roundingGoAddValue: v })}
                            format="minutes"
                            className="w-full"
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="roundAllBookings"
                    checked={form.roundAllBookings}
                    onCheckedChange={(c) => setForm({ ...form, roundAllBookings: !!c })}
                  />
                  <Label htmlFor="roundAllBookings" className="font-normal">
                    {t('fieldRoundAllBookings')}
                  </Label>
                </div>
              </TabsContent>

              {/* Special Tab */}
              <TabsContent value="special" className="space-y-4">
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="text-sm font-medium">{t('sectionHolidayCredits')}</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="holidayCreditCat1">{t('fieldFullHoliday')}</Label>
                      <DurationInput
                        id="holidayCreditCat1"
                        value={form.holidayCreditCat1}
                        onChange={(v) => setForm({ ...form, holidayCreditCat1: v })}
                        format="hhmm"
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="holidayCreditCat2">{t('fieldHalfHoliday')}</Label>
                      <DurationInput
                        id="holidayCreditCat2"
                        value={form.holidayCreditCat2}
                        onChange={(v) => setForm({ ...form, holidayCreditCat2: v })}
                        format="hhmm"
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="holidayCreditCat3">{t('fieldCategory3')}</Label>
                      <DurationInput
                        id="holidayCreditCat3"
                        value={form.holidayCreditCat3}
                        onChange={(v) => setForm({ ...form, holidayCreditCat3: v })}
                        format="hhmm"
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vacationDeduction">{t('fieldVacationDeduction')}</Label>
                  <Input
                    id="vacationDeduction"
                    type="number"
                    step="0.5"
                    min="0"
                    value={form.vacationDeduction}
                    onChange={(e) =>
                      setForm({ ...form, vacationDeduction: parseFloat(e.target.value) || 1.0 })
                    }
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">{t('vacationDeductionHelp')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="noBookingBehavior">{t('fieldNoBookingBehavior')}</Label>
                  <Select
                    value={form.noBookingBehavior}
                    onValueChange={(v) => setForm({ ...form, noBookingBehavior: v })}
                  >
                    <SelectTrigger id="noBookingBehavior">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="error">{t('noBookingError')}</SelectItem>
                      <SelectItem value="deduct_target">{t('noBookingDeductTarget')}</SelectItem>
                      <SelectItem value="adopt_target">{t('noBookingAdoptTarget')}</SelectItem>
                      <SelectItem value="vocational_school">{t('noBookingVocationalSchool')}</SelectItem>
                      <SelectItem value="target_with_order">{t('noBookingTargetWithOrder')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('noBookingBehaviorHelp')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dayChangeBehavior">{t('fieldDayChangeBehavior')}</Label>
                  <Select
                    value={form.dayChangeBehavior}
                    onValueChange={(v) => setForm({ ...form, dayChangeBehavior: v })}
                  >
                    <SelectTrigger id="dayChangeBehavior">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('dayChangeNone')}</SelectItem>
                      <SelectItem value="at_arrival">{t('dayChangeAtArrival')}</SelectItem>
                      <SelectItem value="at_departure">{t('dayChangeAtDeparture')}</SelectItem>
                      <SelectItem value="auto_complete">{t('dayChangeAutoComplete')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('dayChangeBehaviorHelp')}</p>
                </div>
              </TabsContent>
            </Tabs>
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
              {isEdit ? t('buttonSaveChanges') : t('buttonCreateDayPlan')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
