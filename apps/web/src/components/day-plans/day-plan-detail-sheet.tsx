'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Edit, Trash2, Copy, Clock, Settings, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useDayPlan } from '@/hooks/api'
import { formatTime, formatDuration } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']

interface DayPlanDetailSheetProps {
  dayPlanId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (dayPlan: DayPlan) => void
  onDelete: (dayPlan: DayPlan) => void
  onCopy: (dayPlan: DayPlan) => void
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

export function DayPlanDetailSheet({
  dayPlanId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onCopy,
}: DayPlanDetailSheetProps) {
  const t = useTranslations('adminDayPlans')
  const { data: dayPlan, isLoading } = useDayPlan(dayPlanId ?? '', open && !!dayPlanId)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        {isLoading ? (
          <DetailSheetSkeleton />
        ) : dayPlan ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="flex items-center gap-2">
                    {dayPlan.name}
                    <Badge variant={dayPlan.is_active ? 'default' : 'secondary'}>
                      {dayPlan.is_active ? t('statusActive') : t('statusInactive')}
                    </Badge>
                  </SheetTitle>
                  <SheetDescription className="mt-1">
                    <span className="font-mono">{dayPlan.code}</span>
                    {' '}&bull;{' '}
                    <Badge variant="outline">
                      {dayPlan.plan_type === 'fixed' ? t('typeFixed') : t('typeFlextime')}
                    </Badge>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
              <div className="space-y-6">
                {/* Time Window Section */}
                <Section title={t('sectionTimeWindow')} icon={Clock}>
                  <DetailRow label={t('labelArriveFrom')} value={dayPlan.come_from != null ? formatTime(dayPlan.come_from) : '-'} />
                  {dayPlan.plan_type === 'flextime' && (
                    <DetailRow label={t('labelArriveUntil')} value={dayPlan.come_to != null ? formatTime(dayPlan.come_to) : '-'} />
                  )}
                  {dayPlan.plan_type === 'flextime' && (
                    <DetailRow label={t('labelLeaveFrom')} value={dayPlan.go_from != null ? formatTime(dayPlan.go_from) : '-'} />
                  )}
                  <DetailRow label={t('labelLeaveUntil')} value={dayPlan.go_to != null ? formatTime(dayPlan.go_to) : '-'} />
                  {dayPlan.plan_type === 'flextime' && dayPlan.core_start != null && (
                    <>
                      <DetailRow label={t('labelCoreStart')} value={formatTime(dayPlan.core_start)} />
                      <DetailRow label={t('labelCoreEnd')} value={dayPlan.core_end != null ? formatTime(dayPlan.core_end) : '-'} />
                    </>
                  )}
                </Section>

                {/* Target Hours Section */}
                <Section title={t('sectionTargetHours')} icon={Calendar}>
                  <DetailRow label={t('labelRegularHours')} value={formatDuration(dayPlan.regular_hours)} />
                  {dayPlan.regular_hours_2 != null && (
                    <DetailRow label={t('labelAbsenceDayHours')} value={formatDuration(dayPlan.regular_hours_2)} />
                  )}
                  <DetailRow
                    label={t('labelFromEmployeeMaster')}
                    value={dayPlan.from_employee_master ? t('yes') : t('no')}
                  />
                  {dayPlan.min_work_time != null && (
                    <DetailRow label={t('labelMinWorkTime')} value={formatDuration(dayPlan.min_work_time)} />
                  )}
                  {dayPlan.max_net_work_time != null && (
                    <DetailRow label={t('labelMaxNetWorkTime')} value={formatDuration(dayPlan.max_net_work_time)} />
                  )}
                </Section>

                {/* Tolerance Section */}
                <Section title={t('sectionTolerance')} icon={Settings}>
                  <DetailRow label={t('labelArriveEarly')} value={t('minuteValue', { count: dayPlan.tolerance_come_minus ?? 0 })} />
                  <DetailRow label={t('labelArriveLate')} value={t('minuteValue', { count: dayPlan.tolerance_come_plus ?? 0 })} />
                  <DetailRow label={t('labelLeaveEarly')} value={t('minuteValue', { count: dayPlan.tolerance_go_minus ?? 0 })} />
                  <DetailRow label={t('labelLeaveLate')} value={t('minuteValue', { count: dayPlan.tolerance_go_plus ?? 0 })} />
                  {dayPlan.plan_type === 'fixed' && (
                    <DetailRow
                      label={t('labelVariableWorkTime')}
                      value={dayPlan.variable_work_time ? t('yes') : t('no')}
                    />
                  )}
                </Section>

                {/* Rounding Section */}
                <Section title={t('sectionRounding')} icon={Settings}>
                  <DetailRow
                    label={t('labelArrivalRounding')}
                    value={t(ROUNDING_LABEL_KEYS[dayPlan.rounding_come_type as keyof typeof ROUNDING_LABEL_KEYS] ?? 'roundingNone' as Parameters<typeof t>[0])}
                  />
                  {dayPlan.rounding_come_interval != null && (
                    <DetailRow label={t('labelArrivalInterval')} value={t('minuteValue', { count: dayPlan.rounding_come_interval })} />
                  )}
                  <DetailRow
                    label={t('labelDepartureRounding')}
                    value={t(ROUNDING_LABEL_KEYS[dayPlan.rounding_go_type as keyof typeof ROUNDING_LABEL_KEYS] ?? 'roundingNone' as Parameters<typeof t>[0])}
                  />
                  {dayPlan.rounding_go_interval != null && (
                    <DetailRow label={t('labelDepartureInterval')} value={t('minuteValue', { count: dayPlan.rounding_go_interval })} />
                  )}
                  <DetailRow
                    label={t('labelRoundAllBookings')}
                    value={dayPlan.round_all_bookings ? t('yes') : t('no')}
                  />
                </Section>

                {/* Special Settings Section */}
                <Section title={t('sectionSpecialSettings')} icon={Settings}>
                  <DetailRow
                    label={t('labelNoBookingBehavior')}
                    value={t(NO_BOOKING_LABEL_KEYS[dayPlan.no_booking_behavior as keyof typeof NO_BOOKING_LABEL_KEYS] ?? 'noBookingError' as Parameters<typeof t>[0])}
                  />
                  <DetailRow
                    label={t('labelDayChangeBehavior')}
                    value={t(DAY_CHANGE_LABEL_KEYS[dayPlan.day_change_behavior as keyof typeof DAY_CHANGE_LABEL_KEYS] ?? 'dayChangeNone' as Parameters<typeof t>[0])}
                  />
                  <DetailRow label={t('labelVacationDeduction')} value={t('vacationDays', { count: dayPlan.vacation_deduction ?? 1 })} />
                </Section>

                {/* Holiday Credits Section */}
                {(dayPlan.holiday_credit_cat1 != null ||
                  dayPlan.holiday_credit_cat2 != null ||
                  dayPlan.holiday_credit_cat3 != null) && (
                  <Section title={t('sectionHolidayCredits')} icon={Calendar}>
                    {dayPlan.holiday_credit_cat1 != null && (
                      <DetailRow label={t('fieldFullHoliday')} value={formatDuration(dayPlan.holiday_credit_cat1)} />
                    )}
                    {dayPlan.holiday_credit_cat2 != null && (
                      <DetailRow label={t('fieldHalfHoliday')} value={formatDuration(dayPlan.holiday_credit_cat2)} />
                    )}
                    {dayPlan.holiday_credit_cat3 != null && (
                      <DetailRow label={t('fieldCategory3')} value={formatDuration(dayPlan.holiday_credit_cat3)} />
                    )}
                  </Section>
                )}

                {/* Breaks Section */}
                {dayPlan.breaks && dayPlan.breaks.length > 0 && (
                  <Section title={t('sectionBreaks')} icon={Clock}>
                    <div className="space-y-3">
                      {dayPlan.breaks.map((brk) => (
                        <div key={brk.id} className="border rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline">{t(BREAK_TYPE_LABEL_KEYS[brk.break_type as keyof typeof BREAK_TYPE_LABEL_KEYS] as Parameters<typeof t>[0])}</Badge>
                            <span className="font-medium">{formatDuration(brk.duration)}</span>
                          </div>
                          {brk.start_time != null && brk.end_time != null && (
                            <div className="text-muted-foreground">
                              {formatTime(brk.start_time)} - {formatTime(brk.end_time)}
                            </div>
                          )}
                          {brk.after_work_minutes != null && (
                            <div className="text-muted-foreground">
                              {t('afterWork', { duration: formatDuration(brk.after_work_minutes) })}
                            </div>
                          )}
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            {brk.auto_deduct && <span>{t('autoDeduct')}</span>}
                            {brk.is_paid && <span>{t('paid')}</span>}
                            {brk.minutes_difference && <span>{t('proportional')}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Bonuses Section */}
                {dayPlan.bonuses && dayPlan.bonuses.length > 0 && (
                  <Section title={t('sectionBonuses')} icon={Settings}>
                    <div className="space-y-3">
                      {dayPlan.bonuses.map((bonus) => (
                        <div key={bonus.id} className="border rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{bonus.account?.name ?? t('unknownAccount')}</span>
                            <span>{formatDuration(bonus.value_minutes)}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {formatTime(bonus.time_from)} - {formatTime(bonus.time_to)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {bonus.calculation_type === 'fixed' && t('bonusCalculationFixed')}
                            {bonus.calculation_type === 'per_minute' && t('bonusCalculationPerMinute')}
                            {bonus.calculation_type === 'percentage' && t('bonusCalculationPercentage')}
                            {bonus.applies_on_holiday && ` | ${t('bonusAppliesOnHoliday')}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
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
