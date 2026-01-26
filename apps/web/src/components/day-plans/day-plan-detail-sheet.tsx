'use client'

import * as React from 'react'
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

const ROUNDING_LABELS: Record<string, string> = {
  none: 'None',
  up: 'Round Up',
  down: 'Round Down',
  nearest: 'Nearest',
  add: 'Add Value',
  subtract: 'Subtract Value',
}

const NO_BOOKING_LABELS: Record<string, string> = {
  error: 'Show Error',
  deduct_target: 'Deduct Target Hours',
  adopt_target: 'Credit Target Hours',
  vocational_school: 'Vocational School Day',
  target_with_order: 'Target with Default Order',
}

const DAY_CHANGE_LABELS: Record<string, string> = {
  none: 'No Day Change',
  at_arrival: 'Evaluate at Arrival',
  at_departure: 'Evaluate at Departure',
  auto_complete: 'Auto-Complete at Midnight',
}

const BREAK_TYPE_LABELS: Record<string, string> = {
  fixed: 'Fixed',
  variable: 'Variable',
  minimum: 'Minimum',
}

export function DayPlanDetailSheet({
  dayPlanId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onCopy,
}: DayPlanDetailSheetProps) {
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
                      {dayPlan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </SheetTitle>
                  <SheetDescription className="mt-1">
                    <span className="font-mono">{dayPlan.code}</span>
                    {' '}&bull;{' '}
                    <Badge variant="outline">
                      {dayPlan.plan_type === 'fixed' ? 'Fixed' : 'Flextime'}
                    </Badge>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
              <div className="space-y-6">
                {/* Time Window Section */}
                <Section title="Time Window" icon={Clock}>
                  <DetailRow label="Arrive From" value={dayPlan.come_from != null ? formatTime(dayPlan.come_from) : '-'} />
                  {dayPlan.plan_type === 'flextime' && (
                    <DetailRow label="Arrive Until" value={dayPlan.come_to != null ? formatTime(dayPlan.come_to) : '-'} />
                  )}
                  {dayPlan.plan_type === 'flextime' && (
                    <DetailRow label="Leave From" value={dayPlan.go_from != null ? formatTime(dayPlan.go_from) : '-'} />
                  )}
                  <DetailRow label="Leave Until" value={dayPlan.go_to != null ? formatTime(dayPlan.go_to) : '-'} />
                  {dayPlan.plan_type === 'flextime' && dayPlan.core_start != null && (
                    <>
                      <DetailRow label="Core Start" value={formatTime(dayPlan.core_start)} />
                      <DetailRow label="Core End" value={dayPlan.core_end != null ? formatTime(dayPlan.core_end) : '-'} />
                    </>
                  )}
                </Section>

                {/* Target Hours Section */}
                <Section title="Target Hours" icon={Calendar}>
                  <DetailRow label="Regular Hours" value={formatDuration(dayPlan.regular_hours)} />
                  {dayPlan.regular_hours_2 != null && (
                    <DetailRow label="Absence Day Hours" value={formatDuration(dayPlan.regular_hours_2)} />
                  )}
                  <DetailRow
                    label="From Employee Master"
                    value={dayPlan.from_employee_master ? 'Yes' : 'No'}
                  />
                  {dayPlan.min_work_time != null && (
                    <DetailRow label="Min Work Time" value={formatDuration(dayPlan.min_work_time)} />
                  )}
                  {dayPlan.max_net_work_time != null && (
                    <DetailRow label="Max Net Work Time" value={formatDuration(dayPlan.max_net_work_time)} />
                  )}
                </Section>

                {/* Tolerance Section */}
                <Section title="Tolerance" icon={Settings}>
                  <DetailRow label="Arrive Early" value={`${dayPlan.tolerance_come_minus ?? 0} min`} />
                  <DetailRow label="Arrive Late" value={`${dayPlan.tolerance_come_plus ?? 0} min`} />
                  <DetailRow label="Leave Early" value={`${dayPlan.tolerance_go_minus ?? 0} min`} />
                  <DetailRow label="Leave Late" value={`${dayPlan.tolerance_go_plus ?? 0} min`} />
                  {dayPlan.plan_type === 'fixed' && (
                    <DetailRow
                      label="Variable Work Time"
                      value={dayPlan.variable_work_time ? 'Yes' : 'No'}
                    />
                  )}
                </Section>

                {/* Rounding Section */}
                <Section title="Rounding" icon={Settings}>
                  <DetailRow
                    label="Arrival Rounding"
                    value={ROUNDING_LABELS[dayPlan.rounding_come_type ?? 'none'] ?? 'None'}
                  />
                  {dayPlan.rounding_come_interval != null && (
                    <DetailRow label="Arrival Interval" value={`${dayPlan.rounding_come_interval} min`} />
                  )}
                  <DetailRow
                    label="Departure Rounding"
                    value={ROUNDING_LABELS[dayPlan.rounding_go_type ?? 'none'] ?? 'None'}
                  />
                  {dayPlan.rounding_go_interval != null && (
                    <DetailRow label="Departure Interval" value={`${dayPlan.rounding_go_interval} min`} />
                  )}
                  <DetailRow
                    label="Round All Bookings"
                    value={dayPlan.round_all_bookings ? 'Yes' : 'No'}
                  />
                </Section>

                {/* Special Settings Section */}
                <Section title="Special Settings" icon={Settings}>
                  <DetailRow
                    label="No Booking Behavior"
                    value={NO_BOOKING_LABELS[dayPlan.no_booking_behavior ?? 'error'] ?? 'Show Error'}
                  />
                  <DetailRow
                    label="Day Change Behavior"
                    value={DAY_CHANGE_LABELS[dayPlan.day_change_behavior ?? 'none'] ?? 'No Day Change'}
                  />
                  <DetailRow label="Vacation Deduction" value={`${dayPlan.vacation_deduction ?? 1} day(s)`} />
                </Section>

                {/* Holiday Credits Section */}
                {(dayPlan.holiday_credit_cat1 != null ||
                  dayPlan.holiday_credit_cat2 != null ||
                  dayPlan.holiday_credit_cat3 != null) && (
                  <Section title="Holiday Credits" icon={Calendar}>
                    {dayPlan.holiday_credit_cat1 != null && (
                      <DetailRow label="Full Holiday" value={formatDuration(dayPlan.holiday_credit_cat1)} />
                    )}
                    {dayPlan.holiday_credit_cat2 != null && (
                      <DetailRow label="Half Holiday" value={formatDuration(dayPlan.holiday_credit_cat2)} />
                    )}
                    {dayPlan.holiday_credit_cat3 != null && (
                      <DetailRow label="Category 3" value={formatDuration(dayPlan.holiday_credit_cat3)} />
                    )}
                  </Section>
                )}

                {/* Breaks Section */}
                {dayPlan.breaks && dayPlan.breaks.length > 0 && (
                  <Section title="Breaks" icon={Clock}>
                    <div className="space-y-3">
                      {dayPlan.breaks.map((brk) => (
                        <div key={brk.id} className="border rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline">{BREAK_TYPE_LABELS[brk.break_type]}</Badge>
                            <span className="font-medium">{formatDuration(brk.duration)}</span>
                          </div>
                          {brk.start_time != null && brk.end_time != null && (
                            <div className="text-muted-foreground">
                              {formatTime(brk.start_time)} - {formatTime(brk.end_time)}
                            </div>
                          )}
                          {brk.after_work_minutes != null && (
                            <div className="text-muted-foreground">
                              After {formatDuration(brk.after_work_minutes)} work
                            </div>
                          )}
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            {brk.auto_deduct && <span>Auto-deduct</span>}
                            {brk.is_paid && <span>Paid</span>}
                            {brk.minutes_difference && <span>Proportional</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Bonuses Section */}
                {dayPlan.bonuses && dayPlan.bonuses.length > 0 && (
                  <Section title="Surcharges/Bonuses" icon={Settings}>
                    <div className="space-y-3">
                      {dayPlan.bonuses.map((bonus) => (
                        <div key={bonus.id} className="border rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{bonus.account?.name ?? 'Unknown Account'}</span>
                            <span>{formatDuration(bonus.value_minutes)}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {formatTime(bonus.time_from)} - {formatTime(bonus.time_to)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {bonus.calculation_type === 'fixed' && 'Fixed value'}
                            {bonus.calculation_type === 'per_minute' && 'Per minute'}
                            {bonus.calculation_type === 'percentage' && 'Percentage'}
                            {bonus.applies_on_holiday && ' | Applies on holiday'}
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
                Edit
              </Button>
              <Button variant="outline" onClick={() => onCopy(dayPlan)}>
                <Copy className="mr-2 h-4 w-4" />
                Copy
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
          <div className="text-center py-8 text-muted-foreground">Day plan not found</div>
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
