'use client'

import * as React from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Edit, Trash2, Copy, Clock, Settings, Calendar, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TimeInput } from '@/components/ui/time-input'
import { DurationInput } from '@/components/ui/duration-input'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useDayPlan,
  useCreateDayPlanBonus,
  useUpdateDayPlanBonus,
  useDeleteDayPlanBonus,
  useAccounts,
} from '@/hooks'
import { formatTime, formatDuration } from '@/lib/time-utils'

type DayPlanData = NonNullable<ReturnType<typeof useDayPlan>['data']>

interface DayPlanDetailSheetProps {
  dayPlanId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (dayPlan: DayPlanData) => void
  onDelete: (dayPlan: DayPlanData) => void
  onCopy: (dayPlan: DayPlanData) => void
}

const ROUNDING_LABEL_KEYS = {
  none: 'roundingNone',
  up: 'roundingUp',
  down: 'roundingDown',
  nearest: 'roundingNearest',
  add: 'roundingAdd',
  subtract: 'roundingSubtract',
} as const

const NO_BOOKING_LABEL_KEYS = {
  error: 'noBookingError',
  deduct_target: 'noBookingDeductTarget',
  adopt_target: 'noBookingAdoptTarget',
  vocational_school: 'noBookingVocationalSchool',
  target_with_order: 'noBookingTargetWithOrder',
} as const

const DAY_CHANGE_LABEL_KEYS = {
  none: 'dayChangeNone',
  at_arrival: 'dayChangeAtArrival',
  at_departure: 'dayChangeAtDeparture',
  auto_complete: 'dayChangeAutoComplete',
} as const

const BREAK_TYPE_LABEL_KEYS = {
  fixed: 'breakTypeFixed',
  variable: 'breakTypeVariable',
  minimum: 'breakTypeMinimum',
} as const

type BonusFormValue = {
  accountId: string
  timeFrom: number
  timeTo: number
  calculationType: 'fixed' | 'per_minute' | 'percentage'
  valueMinutes: number
  minWorkMinutes: number | null
  appliesOnHoliday: boolean
}

const DEFAULT_BONUS: BonusFormValue = {
  accountId: '',
  timeFrom: 1320,
  timeTo: 360,
  calculationType: 'per_minute',
  valueMinutes: 0,
  minWorkMinutes: null,
  appliesOnHoliday: false,
}

export function DayPlanDetailSheet({
  dayPlanId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onCopy,
}: DayPlanDetailSheetProps) {
  const t = useTranslations('adminDayPlans')
  const { data: dayPlan, isLoading, refetch } = useDayPlan(dayPlanId ?? '', open && !!dayPlanId)
  const { data: accountsData } = useAccounts({ accountType: 'bonus', active: true, includeSystem: true, enabled: open })
  const createBonusMutation = useCreateDayPlanBonus()
  const updateBonusMutation = useUpdateDayPlanBonus()
  const deleteBonusMutation = useDeleteDayPlanBonus()
  const [showAddBonus, setShowAddBonus] = useState(false)
  const [newBonus, setNewBonus] = useState<BonusFormValue>(DEFAULT_BONUS)
  const [editingBonusId, setEditingBonusId] = useState<string | null>(null)
  const [editBonus, setEditBonus] = useState<BonusFormValue>(DEFAULT_BONUS)

  // Reset forms when sheet closes
  React.useEffect(() => {
    if (!open) {
      setShowAddBonus(false)
      setNewBonus(DEFAULT_BONUS)
      setEditingBonusId(null)
      setEditBonus(DEFAULT_BONUS)
    }
  }, [open])

  const handleAddBonus = async () => {
    if (!dayPlan || !newBonus.accountId) return
    try {
      await createBonusMutation.mutateAsync({
        dayPlanId: dayPlan.id,
        accountId: newBonus.accountId,
        timeFrom: newBonus.timeFrom,
        timeTo: newBonus.timeTo,
        calculationType: newBonus.calculationType,
        valueMinutes: newBonus.valueMinutes,
        minWorkMinutes: newBonus.minWorkMinutes ?? undefined,
        appliesOnHoliday: newBonus.appliesOnHoliday,
      })
      setShowAddBonus(false)
      setNewBonus(DEFAULT_BONUS)
      refetch()
    } catch {
      // Error handled by mutation
    }
  }

  const handleStartEditBonus = (bonus: NonNullable<DayPlanData['bonuses']>[number]) => {
    setEditingBonusId(bonus.id)
    setEditBonus({
      accountId: bonus.accountId,
      timeFrom: bonus.timeFrom,
      timeTo: bonus.timeTo,
      calculationType: bonus.calculationType as 'fixed' | 'per_minute' | 'percentage',
      valueMinutes: bonus.valueMinutes,
      minWorkMinutes: bonus.minWorkMinutes ?? null,
      appliesOnHoliday: bonus.appliesOnHoliday,
    })
  }

  const handleCancelEditBonus = () => {
    setEditingBonusId(null)
    setEditBonus(DEFAULT_BONUS)
  }

  const handleSaveEditBonus = async () => {
    if (!dayPlan || !editingBonusId || !editBonus.accountId) return
    try {
      await updateBonusMutation.mutateAsync({
        dayPlanId: dayPlan.id,
        bonusId: editingBonusId,
        accountId: editBonus.accountId,
        timeFrom: editBonus.timeFrom,
        timeTo: editBonus.timeTo,
        calculationType: editBonus.calculationType,
        valueMinutes: editBonus.valueMinutes,
        minWorkMinutes: editBonus.minWorkMinutes,
        appliesOnHoliday: editBonus.appliesOnHoliday,
      })
      handleCancelEditBonus()
      refetch()
    } catch {
      // Error handled by mutation
    }
  }

  const handleDeleteBonus = async (bonusId: string) => {
    if (!dayPlan) return
    try {
      await deleteBonusMutation.mutateAsync({
        dayPlanId: dayPlan.id,
        bonusId,
      })
      refetch()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex min-h-0 flex-col">
        {isLoading ? (
          <DetailSheetSkeleton />
        ) : dayPlan ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="flex items-center gap-2">
                    {dayPlan.name}
                    <Badge variant={dayPlan.isActive ? 'default' : 'secondary'}>
                      {dayPlan.isActive ? t('statusActive') : t('statusInactive')}
                    </Badge>
                  </SheetTitle>
                  <SheetDescription className="mt-1">
                    <span className="font-mono">{dayPlan.code}</span>
                    {' '}&bull;{' '}
                    <Badge variant="outline">
                      {dayPlan.planType === 'fixed' ? t('typeFixed') : t('typeFlextime')}
                    </Badge>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
              <div className="space-y-6">
                {/* Time Window Section */}
                <Section title={t('sectionTimeWindow')} icon={Clock}>
                  <DetailRow label={t('labelArriveFrom')} value={dayPlan.comeFrom != null ? formatTime(dayPlan.comeFrom) : '-'} />
                  {dayPlan.planType === 'flextime' && (
                    <DetailRow label={t('labelArriveUntil')} value={dayPlan.comeTo != null ? formatTime(dayPlan.comeTo) : '-'} />
                  )}
                  {dayPlan.planType === 'fixed' ? (
                    <DetailRow label={t('labelLeaveFrom')} value={dayPlan.goFrom != null ? formatTime(dayPlan.goFrom) : '-'} />
                  ) : (
                    <>
                      <DetailRow label={t('labelLeaveFrom')} value={dayPlan.goFrom != null ? formatTime(dayPlan.goFrom) : '-'} />
                      <DetailRow label={t('labelLeaveUntil')} value={dayPlan.goTo != null ? formatTime(dayPlan.goTo) : '-'} />
                    </>
                  )}
                  {dayPlan.planType === 'flextime' && dayPlan.coreStart != null && (
                    <>
                      <DetailRow label={t('labelCoreStart')} value={formatTime(dayPlan.coreStart)} />
                      <DetailRow label={t('labelCoreEnd')} value={dayPlan.coreEnd != null ? formatTime(dayPlan.coreEnd) : '-'} />
                    </>
                  )}
                </Section>

                {/* Target Hours Section */}
                <Section title={t('sectionTargetHours')} icon={Calendar}>
                  <DetailRow label={t('labelRegularHours')} value={formatDuration(dayPlan.regularHours)} />
                  {dayPlan.regularHours2 != null && (
                    <DetailRow label={t('labelAbsenceDayHours')} value={formatDuration(dayPlan.regularHours2)} />
                  )}
                  <DetailRow
                    label={t('labelFromEmployeeMaster')}
                    value={dayPlan.fromEmployeeMaster ? t('yes') : t('no')}
                  />
                  {dayPlan.minWorkTime != null && (
                    <DetailRow label={t('labelMinWorkTime')} value={formatDuration(dayPlan.minWorkTime)} />
                  )}
                  {dayPlan.maxNetWorkTime != null && (
                    <DetailRow label={t('labelMaxNetWorkTime')} value={formatDuration(dayPlan.maxNetWorkTime)} />
                  )}
                </Section>

                {/* Tolerance Section */}
                <Section title={t('sectionTolerance')} icon={Settings}>
                  <DetailRow label={t('labelArriveEarly')} value={t('minuteValue', { count: dayPlan.toleranceComeMinus ?? 0 })} />
                  <DetailRow label={t('labelArriveLate')} value={t('minuteValue', { count: dayPlan.toleranceComePlus ?? 0 })} />
                  <DetailRow label={t('labelLeaveEarly')} value={t('minuteValue', { count: dayPlan.toleranceGoMinus ?? 0 })} />
                  <DetailRow label={t('labelLeaveLate')} value={t('minuteValue', { count: dayPlan.toleranceGoPlus ?? 0 })} />
                  {dayPlan.planType === 'fixed' && (
                    <DetailRow
                      label={t('labelVariableWorkTime')}
                      value={dayPlan.variableWorkTime ? t('yes') : t('no')}
                    />
                  )}
                </Section>

                {/* Rounding Section */}
                <Section title={t('sectionRounding')} icon={Settings}>
                  <DetailRow
                    label={t('labelArrivalRounding')}
                    value={t(ROUNDING_LABEL_KEYS[dayPlan.roundingComeType as keyof typeof ROUNDING_LABEL_KEYS] ?? 'roundingNone' as Parameters<typeof t>[0])}
                  />
                  {dayPlan.roundingComeInterval != null && (
                    <DetailRow label={t('labelArrivalInterval')} value={t('minuteValue', { count: dayPlan.roundingComeInterval })} />
                  )}
                  <DetailRow
                    label={t('labelDepartureRounding')}
                    value={t(ROUNDING_LABEL_KEYS[dayPlan.roundingGoType as keyof typeof ROUNDING_LABEL_KEYS] ?? 'roundingNone' as Parameters<typeof t>[0])}
                  />
                  {dayPlan.roundingGoInterval != null && (
                    <DetailRow label={t('labelDepartureInterval')} value={t('minuteValue', { count: dayPlan.roundingGoInterval })} />
                  )}
                  <DetailRow
                    label={t('labelRoundAllBookings')}
                    value={dayPlan.roundAllBookings ? t('yes') : t('no')}
                  />
                </Section>

                {/* Special Settings Section */}
                <Section title={t('sectionSpecialSettings')} icon={Settings}>
                  <DetailRow
                    label={t('labelNoBookingBehavior')}
                    value={t(NO_BOOKING_LABEL_KEYS[dayPlan.noBookingBehavior as keyof typeof NO_BOOKING_LABEL_KEYS] ?? 'noBookingError' as Parameters<typeof t>[0])}
                  />
                  <DetailRow
                    label={t('labelDayChangeBehavior')}
                    value={t(DAY_CHANGE_LABEL_KEYS[dayPlan.dayChangeBehavior as keyof typeof DAY_CHANGE_LABEL_KEYS] ?? 'dayChangeNone' as Parameters<typeof t>[0])}
                  />
                  <DetailRow label={t('labelVacationDeduction')} value={t('vacationDays', { count: dayPlan.vacationDeduction ?? 1 })} />
                </Section>

                {/* Holiday Credits Section */}
                {(dayPlan.holidayCreditCat1 != null ||
                  dayPlan.holidayCreditCat2 != null ||
                  dayPlan.holidayCreditCat3 != null) && (
                  <Section title={t('sectionHolidayCredits')} icon={Calendar}>
                    {dayPlan.holidayCreditCat1 != null && (
                      <DetailRow label={t('fieldFullHoliday')} value={formatDuration(dayPlan.holidayCreditCat1)} />
                    )}
                    {dayPlan.holidayCreditCat2 != null && (
                      <DetailRow label={t('fieldHalfHoliday')} value={formatDuration(dayPlan.holidayCreditCat2)} />
                    )}
                    {dayPlan.holidayCreditCat3 != null && (
                      <DetailRow label={t('fieldCategory3')} value={formatDuration(dayPlan.holidayCreditCat3)} />
                    )}
                  </Section>
                )}

                {/* Breaks Section */}
                {dayPlan.breaks && dayPlan.breaks.length > 0 && (
                  <Section title={t('sectionBreaks')} icon={Clock}>
                    <div className="space-y-3">
                      {dayPlan.breaks.map((brk: NonNullable<DayPlanData['breaks']>[number]) => (
                        <div key={brk.id} className="border rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline">{t(BREAK_TYPE_LABEL_KEYS[brk.breakType as keyof typeof BREAK_TYPE_LABEL_KEYS] as Parameters<typeof t>[0])}</Badge>
                            <span className="font-medium">{formatDuration(brk.duration)}</span>
                          </div>
                          {brk.startTime != null && brk.endTime != null && (
                            <div className="text-muted-foreground">
                              {formatTime(brk.startTime)} - {formatTime(brk.endTime)}
                            </div>
                          )}
                          {brk.afterWorkMinutes != null && (
                            <div className="text-muted-foreground">
                              {t('afterWork', { duration: formatDuration(brk.afterWorkMinutes) })}
                            </div>
                          )}
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            {brk.autoDeduct && <span>{t('autoDeduct')}</span>}
                            {brk.isPaid && <span>{t('paid')}</span>}
                            {brk.minutesDifference && <span>{t('proportional')}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Bonuses Section */}
                <Section title={t('sectionBonuses')} icon={Settings}>
                  {dayPlan.bonuses && dayPlan.bonuses.length > 0 ? (
                    <div className="space-y-3">
                      {dayPlan.bonuses.map((bonus: NonNullable<DayPlanData['bonuses']>[number]) => (
                        editingBonusId === bonus.id ? (
                          <div key={bonus.id} className="border rounded-lg p-4 space-y-4">
                            <h4 className="text-sm font-medium">{t('editBonus')}</h4>
                            <BonusFormFields
                              value={editBonus}
                              onChange={setEditBonus}
                              accounts={accountsData?.data ?? []}
                              labels={{
                                account: t('fieldAccount'),
                                selectAccount: t('selectAccount'),
                                timeFrom: t('fieldTimeFrom'),
                                timeTo: t('fieldTimeTo'),
                                calculationType: t('fieldCalculationType'),
                                calcFixed: t('bonusCalculationFixed'),
                                calcPerMinute: t('bonusCalculationPerMinute'),
                                calcPercentage: t('bonusCalculationPercentage'),
                                valueMinutes: t('fieldValueMinutes'),
                                valuePercent: t('fieldValuePercent'),
                                minWorkMinutes: t('fieldMinWorkMinutes'),
                                appliesOnHoliday: t('fieldAppliesOnHoliday'),
                              }}
                              idPrefix={`edit-${bonus.id}`}
                            />
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancelEditBonus}
                                className="flex-1"
                              >
                                {t('cancel')}
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSaveEditBonus}
                                disabled={updateBonusMutation.isPending || !editBonus.accountId}
                                className="flex-1"
                              >
                                {updateBonusMutation.isPending && (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {t('saveBonus')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div key={bonus.id} className="border rounded-lg p-3 text-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{bonus.account?.name ?? t('unknownAccount')}</span>
                              <div className="flex items-center gap-2">
                                <span>{formatDuration(bonus.valueMinutes)}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => handleStartEditBonus(bonus)}
                                  disabled={
                                    updateBonusMutation.isPending ||
                                    deleteBonusMutation.isPending ||
                                    editingBonusId !== null
                                  }
                                  aria-label={t('editBonus')}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteBonus(bonus.id)}
                                  disabled={deleteBonusMutation.isPending || editingBonusId !== null}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="text-muted-foreground">
                              {formatTime(bonus.timeFrom)} - {formatTime(bonus.timeTo)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {bonus.calculationType === 'fixed' && t('bonusCalculationFixed')}
                              {bonus.calculationType === 'per_minute' && t('bonusCalculationPerMinute')}
                              {bonus.calculationType === 'percentage' && t('bonusCalculationPercentage')}
                              {bonus.appliesOnHoliday && ` | ${t('bonusAppliesOnHoliday')}`}
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('noBonusesConfigured')}</p>
                  )}

                  {/* Add Bonus Form */}
                  {showAddBonus ? (
                    <div className="border rounded-lg p-4 space-y-4 mt-4">
                      <h4 className="text-sm font-medium">{t('addBonus')}</h4>
                      <BonusFormFields
                        value={newBonus}
                        onChange={setNewBonus}
                        accounts={accountsData?.data ?? []}
                        labels={{
                          account: t('fieldAccount'),
                          selectAccount: t('selectAccount'),
                          timeFrom: t('fieldTimeFrom'),
                          timeTo: t('fieldTimeTo'),
                          calculationType: t('fieldCalculationType'),
                          calcFixed: t('bonusCalculationFixed'),
                          calcPerMinute: t('bonusCalculationPerMinute'),
                          calcPercentage: t('bonusCalculationPercentage'),
                          valueMinutes: t('fieldValueMinutes'),
                          valuePercent: t('fieldValuePercent'),
                          minWorkMinutes: t('fieldMinWorkMinutes'),
                          appliesOnHoliday: t('fieldAppliesOnHoliday'),
                        }}
                        idPrefix="add"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddBonus(false)}
                          className="flex-1"
                        >
                          {t('cancel')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleAddBonus}
                          disabled={createBonusMutation.isPending || !newBonus.accountId}
                          className="flex-1"
                        >
                          {createBonusMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {t('addBonus')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddBonus(true)}
                      disabled={editingBonusId !== null}
                      className="mt-4"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('addBonus')}
                    </Button>
                  )}
                </Section>
              </div>
            </ScrollArea>

            <div className="flex gap-2 mt-4 border-t pt-4">
              <Button variant="outline" className="flex-1" onClick={() => onEdit(dayPlan)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('actionEdit')}
              </Button>
              <Button variant="outline" onClick={() => onCopy(dayPlan)}>
                <Copy className="mr-2 h-4 w-4" />
                {t('actionCopy')}
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(dayPlan)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">{t('notFound')}</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-medium mb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

type BonusFormLabels = {
  account: string
  selectAccount: string
  timeFrom: string
  timeTo: string
  calculationType: string
  calcFixed: string
  calcPerMinute: string
  calcPercentage: string
  valueMinutes: string
  valuePercent: string
  minWorkMinutes: string
  appliesOnHoliday: string
}

function BonusFormFields({
  value,
  onChange,
  accounts,
  labels,
  idPrefix,
}: {
  value: BonusFormValue
  onChange: (next: BonusFormValue) => void
  accounts: Array<{ id: string; name: string }>
  labels: BonusFormLabels
  idPrefix: string
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>{labels.account}</Label>
        <Select value={value.accountId} onValueChange={(v) => onChange({ ...value, accountId: v })}>
          <SelectTrigger>
            <SelectValue placeholder={labels.selectAccount} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{labels.timeFrom}</Label>
          <TimeInput
            value={value.timeFrom}
            onChange={(v) => onChange({ ...value, timeFrom: v ?? 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>{labels.timeTo}</Label>
          <TimeInput
            value={value.timeTo}
            onChange={(v) => onChange({ ...value, timeTo: v ?? 0 })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{labels.calculationType}</Label>
          <Select
            value={value.calculationType}
            onValueChange={(v) =>
              onChange({
                ...value,
                calculationType: v as 'fixed' | 'per_minute' | 'percentage',
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">{labels.calcFixed}</SelectItem>
              <SelectItem value="per_minute">{labels.calcPerMinute}</SelectItem>
              <SelectItem value="percentage">{labels.calcPercentage}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>
            {value.calculationType === 'percentage'
              ? labels.valuePercent
              : labels.valueMinutes}
          </Label>
          {value.calculationType === 'percentage' ? (
            <Input
              type="number"
              min={1}
              max={1000}
              step={1}
              value={value.valueMinutes === 0 ? '' : value.valueMinutes}
              onChange={(e) =>
                onChange({
                  ...value,
                  valueMinutes: e.target.value === '' ? 0 : Number(e.target.value),
                })
              }
              className="w-full"
            />
          ) : (
            <DurationInput
              value={value.valueMinutes}
              onChange={(v) => onChange({ ...value, valueMinutes: v ?? 0 })}
              format="minutes"
              className="w-full"
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>{labels.minWorkMinutes}</Label>
        <DurationInput
          value={value.minWorkMinutes}
          onChange={(v) => onChange({ ...value, minWorkMinutes: v })}
          format="hhmm"
          className="w-full"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-applies-on-holiday`}
          checked={value.appliesOnHoliday}
          onCheckedChange={(c) =>
            onChange({ ...value, appliesOnHoliday: c === true })
          }
        />
        <Label htmlFor={`${idPrefix}-applies-on-holiday`}>{labels.appliesOnHoliday}</Label>
      </div>
    </>
  )
}

function DetailSheetSkeleton() {
  return (
    <>
      <SheetHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32 mt-1" />
      </SheetHeader>
      <div className="space-y-6 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-5 w-32 mb-3" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
