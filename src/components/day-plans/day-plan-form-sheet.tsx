'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, Loader2 } from 'lucide-react'
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
import { useCreateDayPlan, useUpdateDayPlan, useDayPlan } from '@/hooks'

type DayPlanData = NonNullable<ReturnType<typeof useDayPlan>['data']>

interface DayPlanFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dayPlan?: DayPlanData | null
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
  goFrom: 1020, // 17:00
  goTo: null,
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

function validateForm(
  form: FormState,
  isEdit: boolean,
  t: ReturnType<typeof useTranslations<'adminDayPlans'>>,
): string[] {
  const errors: string[] = []
  if (!isEdit && !form.code.trim()) errors.push(t('validationCodeRequired'))
  if (!form.name.trim()) errors.push(t('validationNameRequired'))
  if (form.regularHours <= 0) errors.push(t('validationRegularHoursPositive'))
  return errors
}

const RESERVED_DAY_PLAN_CODES = new Set(['U', 'K', 'S'])
const ROUNDING_INTERVAL_TYPES = new Set(['up', 'down', 'nearest'])
const ROUNDING_VALUE_TYPES = new Set(['add', 'subtract'])

const isReservedDayPlanCode = (code: string) =>
  RESERVED_DAY_PLAN_CODES.has(code.trim().toUpperCase())

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
          planType: (fullDayPlan.planType as FormState['planType']) ?? 'fixed',
          comeFrom: fullDayPlan.comeFrom ?? null,
          comeTo: fullDayPlan.comeTo ?? null,
          goFrom: fullDayPlan.goFrom ?? null,
          goTo: fullDayPlan.goTo ?? null,
          coreStart: fullDayPlan.coreStart ?? null,
          coreEnd: fullDayPlan.coreEnd ?? null,
          regularHours: fullDayPlan.regularHours,
          regularHours2: fullDayPlan.regularHours2 ?? null,
          fromEmployeeMaster: fullDayPlan.fromEmployeeMaster ?? false,
          toleranceComePlus: fullDayPlan.toleranceComePlus ?? 0,
          toleranceComeMinus: fullDayPlan.toleranceComeMinus ?? 0,
          toleranceGoPlus: fullDayPlan.toleranceGoPlus ?? 0,
          toleranceGoMinus: fullDayPlan.toleranceGoMinus ?? 0,
          variableWorkTime: fullDayPlan.variableWorkTime ?? false,
          roundingComeType: fullDayPlan.roundingComeType ?? 'none',
          roundingComeInterval: fullDayPlan.roundingComeInterval ?? null,
          roundingComeAddValue: fullDayPlan.roundingComeAddValue ?? null,
          roundingGoType: fullDayPlan.roundingGoType ?? 'none',
          roundingGoInterval: fullDayPlan.roundingGoInterval ?? null,
          roundingGoAddValue: fullDayPlan.roundingGoAddValue ?? null,
          roundAllBookings: fullDayPlan.roundAllBookings ?? false,
          minWorkTime: fullDayPlan.minWorkTime ?? null,
          maxNetWorkTime: fullDayPlan.maxNetWorkTime ?? null,
          holidayCreditCat1: fullDayPlan.holidayCreditCat1 ?? null,
          holidayCreditCat2: fullDayPlan.holidayCreditCat2 ?? null,
          holidayCreditCat3: fullDayPlan.holidayCreditCat3 ?? null,
          vacationDeduction: fullDayPlan.vacationDeduction ?? 1.0,
          noBookingBehavior: fullDayPlan.noBookingBehavior ?? 'error',
          dayChangeBehavior: fullDayPlan.dayChangeBehavior ?? 'none',
          isActive: fullDayPlan.isActive ?? true,
        })
      } else if (!isEdit) {
        setForm(INITIAL_STATE)
      }
    }
  }, [open, fullDayPlan, isEdit])

  // Clear unused time window fields when switching to fixed plans
  React.useEffect(() => {
    if (form.planType === 'fixed') {
      setForm((prev) => ({
        ...prev,
        comeTo: null,
        goTo: null,
      }))
    }
  }, [form.planType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const errors = validateForm(form, isEdit, t)
    if (!isEdit && isReservedDayPlanCode(form.code)) {
      errors.push(t('validationCodeReserved'))
    }
    if (
      ROUNDING_INTERVAL_TYPES.has(form.roundingComeType) &&
      (!form.roundingComeInterval || form.roundingComeInterval <= 0)
    ) {
      errors.push(t('validationRoundingArrivalInterval'))
    }
    if (
      ROUNDING_VALUE_TYPES.has(form.roundingComeType) &&
      form.roundingComeAddValue == null
    ) {
      errors.push(t('validationRoundingArrivalValue'))
    }
    if (
      ROUNDING_INTERVAL_TYPES.has(form.roundingGoType) &&
      (!form.roundingGoInterval || form.roundingGoInterval <= 0)
    ) {
      errors.push(t('validationRoundingDepartureInterval'))
    }
    if (
      ROUNDING_VALUE_TYPES.has(form.roundingGoType) &&
      form.roundingGoAddValue == null
    ) {
      errors.push(t('validationRoundingDepartureValue'))
    }
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      const submissionForm: FormState = {
        ...form,
        ...(form.planType === 'fixed'
          ? { comeTo: null, goTo: null }
          : {
              toleranceComePlus: 0,
              toleranceGoMinus: 0,
              variableWorkTime: false,
            }),
      }
      const commonFields = {
          name: submissionForm.name,
          description: submissionForm.description || undefined,
          planType: submissionForm.planType,
          comeFrom: submissionForm.comeFrom ?? undefined,
          comeTo: submissionForm.comeTo ?? undefined,
          goFrom: submissionForm.goFrom ?? undefined,
          goTo: submissionForm.goTo ?? undefined,
          coreStart: submissionForm.coreStart ?? undefined,
          coreEnd: submissionForm.coreEnd ?? undefined,
          regularHours: submissionForm.regularHours,
          regularHours2: submissionForm.regularHours2 ?? undefined,
          fromEmployeeMaster: submissionForm.fromEmployeeMaster,
          toleranceComePlus: submissionForm.toleranceComePlus,
          toleranceComeMinus: submissionForm.toleranceComeMinus,
          toleranceGoPlus: submissionForm.toleranceGoPlus,
          toleranceGoMinus: submissionForm.toleranceGoMinus,
          variableWorkTime: submissionForm.variableWorkTime,
          roundingComeType: submissionForm.roundingComeType as 'none' | 'up' | 'down' | 'nearest' | 'add' | 'subtract',
          roundingComeInterval: submissionForm.roundingComeInterval ?? undefined,
          roundingComeAddValue: submissionForm.roundingComeAddValue ?? undefined,
          roundingGoType: submissionForm.roundingGoType as 'none' | 'up' | 'down' | 'nearest' | 'add' | 'subtract',
          roundingGoInterval: submissionForm.roundingGoInterval ?? undefined,
          roundingGoAddValue: submissionForm.roundingGoAddValue ?? undefined,
          roundAllBookings: submissionForm.roundAllBookings,
          minWorkTime: submissionForm.minWorkTime ?? undefined,
          maxNetWorkTime: submissionForm.maxNetWorkTime ?? undefined,
          holidayCreditCat1: submissionForm.holidayCreditCat1 ?? undefined,
          holidayCreditCat2: submissionForm.holidayCreditCat2 ?? undefined,
          holidayCreditCat3: submissionForm.holidayCreditCat3 ?? undefined,
          vacationDeduction: submissionForm.vacationDeduction,
          noBookingBehavior: submissionForm.noBookingBehavior as 'error' | 'deduct_target' | 'adopt_target' | 'vocational_school' | 'target_with_order',
          dayChangeBehavior: submissionForm.dayChangeBehavior as 'none' | 'at_arrival' | 'at_departure' | 'auto_complete',
      }
      if (isEdit && dayPlan) {
        await updateMutation.mutateAsync({
          id: dayPlan.id,
          ...commonFields,
          isActive: submissionForm.isActive,
        })
      } else {
        await createMutation.mutateAsync({
          code: submissionForm.code,
          ...commonFields,
        })
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
                {form.planType === 'fixed' ? (
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
                    <div className="space-y-2">
                      <Label htmlFor="goFrom">{t('fieldLeaveFrom')}</Label>
                      <TimeInput
                        id="goFrom"
                        value={form.goFrom}
                        onChange={(v) => setForm({ ...form, goFrom: v })}
                        className="w-full"
                      />
                    </div>
                  </div>
                ) : (
                  <>
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
                      <div className="space-y-2">
                        <Label htmlFor="comeTo">{t('fieldArriveUntil')}</Label>
                        <TimeInput
                          id="comeTo"
                          value={form.comeTo}
                          onChange={(v) => setForm({ ...form, comeTo: v })}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="goFrom">{t('fieldLeaveFrom')}</Label>
                        <TimeInput
                          id="goFrom"
                          value={form.goFrom}
                          onChange={(v) => setForm({ ...form, goFrom: v })}
                          className="w-full"
                        />
                      </div>
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
                  </>
                )}

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

                {form.planType === 'flextime' ? (
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
                ) : (
                  <>
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
                          disabled={!form.variableWorkTime}
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

                    <div className="space-y-2 mt-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="variableWorkTime"
                          checked={form.variableWorkTime}
                          onCheckedChange={(c) => setForm({ ...form, variableWorkTime: !!c })}
                        />
                        <Label htmlFor="variableWorkTime" className="font-normal">
                          {t('fieldVariableWorkTime')}
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('variableWorkTimeHelp')}
                      </p>
                    </div>
                  </>
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
                  {form.dayChangeBehavior === 'auto_complete' && (
                    <Alert className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {t('dayChangeAutoCompleteWarning')}
                      </AlertDescription>
                    </Alert>
                  )}
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
