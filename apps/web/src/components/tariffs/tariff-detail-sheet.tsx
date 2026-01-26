'use client'

import * as React from 'react'
import {
  Edit,
  Trash2,
  Copy,
  Clock,
  Calendar,
  Settings,
  Plus,
  Loader2,
  Palmtree,
  Target,
  Timer,
  Repeat,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import { DurationInput } from '@/components/ui/duration-input'
import { useTariff, useCreateTariffBreak, useDeleteTariffBreak } from '@/hooks/api'
import { formatDate, formatDuration, parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']
type TariffBreak = components['schemas']['TariffBreak']

interface TariffDetailSheetProps {
  tariffId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (tariff: Tariff) => void
  onDelete: (tariff: Tariff) => void
  onCopy: (tariff: Tariff) => void
}

const BREAK_TYPE_LABELS: Record<string, string> = {
  fixed: 'Fixed',
  variable: 'Variable',
  minimum: 'Minimum',
}

const RHYTHM_TYPE_LABELS: Record<string, string> = {
  weekly: 'Weekly (Single Plan)',
  rolling_weekly: 'Rolling Weekly',
  x_days: 'X-Days Cycle',
}

const VACATION_BASIS_LABELS: Record<string, string> = {
  calendar_year: 'Calendar Year (Jan 1 - Dec 31)',
  entry_date: 'Entry Date (Anniversary)',
}

const CREDIT_TYPE_LABELS: Record<string, string> = {
  no_evaluation: 'No Evaluation (1:1 Transfer)',
  complete: 'Complete Carryover (with Limits)',
  after_threshold: 'After Threshold',
  no_carryover: 'No Carryover (Reset to 0)',
}

function formatHours(value: number | string | null | undefined): string {
  if (value == null) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return `${num.toFixed(2)} h`
}

export function TariffDetailSheet({
  tariffId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onCopy,
}: TariffDetailSheetProps) {
  const { data: tariff, isLoading, refetch } = useTariff(tariffId ?? '', open && !!tariffId)

  // Break management state
  const [showAddBreak, setShowAddBreak] = React.useState(false)
  const [newBreak, setNewBreak] = React.useState({
    breakType: 'minimum' as 'fixed' | 'variable' | 'minimum',
    afterWorkMinutes: 300,
    duration: 30,
    isPaid: false,
  })

  const createBreakMutation = useCreateTariffBreak()
  const deleteBreakMutation = useDeleteTariffBreak()

  // Reset add break form when sheet closes
  React.useEffect(() => {
    if (!open) {
      setShowAddBreak(false)
      setNewBreak({ breakType: 'minimum', afterWorkMinutes: 300, duration: 30, isPaid: false })
    }
  }, [open])

  const handleAddBreak = async () => {
    if (!tariff) return
    try {
      await createBreakMutation.mutateAsync({
        path: { id: tariff.id },
        body: {
          break_type: newBreak.breakType,
          after_work_minutes: newBreak.breakType === 'minimum' ? newBreak.afterWorkMinutes : undefined,
          duration: newBreak.duration,
          is_paid: newBreak.isPaid,
        },
      })
      setShowAddBreak(false)
      setNewBreak({ breakType: 'minimum', afterWorkMinutes: 300, duration: 30, isPaid: false })
      refetch()
    } catch {
      // Error handled by mutation
    }
  }

  const handleDeleteBreak = async (breakItem: TariffBreak) => {
    if (!tariff) return
    try {
      await deleteBreakMutation.mutateAsync({
        path: { id: tariff.id, breakId: breakItem.id },
      })
      refetch()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        {isLoading ? (
          <DetailSheetSkeleton />
        ) : tariff ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="flex items-center gap-2">
                    {tariff.name}
                    <Badge variant={tariff.is_active ? 'default' : 'secondary'}>
                      {tariff.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </SheetTitle>
                  <SheetDescription className="mt-1">
                    <span className="font-mono">{tariff.code}</span>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
              <div className="space-y-6">
                {/* Basic Information */}
                <Section title="Basic Information" icon={Settings}>
                  {tariff.description && (
                    <DetailRow label="Description" value={tariff.description} />
                  )}
                </Section>

                {/* Schedule / Rhythm */}
                <Section title="Schedule" icon={Repeat}>
                  <DetailRow
                    label="Rhythm Type"
                    value={RHYTHM_TYPE_LABELS[tariff.rhythm_type ?? 'weekly'] ?? 'Weekly'}
                  />

                  {/* Weekly: Show single week plan */}
                  {(tariff.rhythm_type === 'weekly' || !tariff.rhythm_type) && (
                    <DetailRow
                      label="Week Plan"
                      value={
                        tariff.week_plan ? (
                          <span>
                            <span className="font-mono">{tariff.week_plan.code}</span> -{' '}
                            {tariff.week_plan.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )
                      }
                    />
                  )}

                  {/* Rolling Weekly: Show week plan list */}
                  {tariff.rhythm_type === 'rolling_weekly' &&
                    tariff.tariff_week_plans &&
                    tariff.tariff_week_plans.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <span className="text-sm text-muted-foreground">Week Plans (in order):</span>
                        <div className="space-y-1 ml-2">
                          {tariff.tariff_week_plans.map((twp, idx) => (
                            <div key={twp.id} className="text-sm">
                              <span className="font-medium">Week {idx + 1}:</span>{' '}
                              <span className="font-mono">{twp.week_plan?.code}</span> -{' '}
                              {twp.week_plan?.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* X-Days: Show cycle info and day plans */}
                  {tariff.rhythm_type === 'x_days' && (
                    <>
                      <DetailRow
                        label="Cycle Length"
                        value={tariff.cycle_days ? `${tariff.cycle_days} days` : '-'}
                      />
                      {tariff.tariff_day_plans && tariff.tariff_day_plans.length > 0 && (
                        <div className="space-y-2 mt-2">
                          <span className="text-sm text-muted-foreground">Day Plans:</span>
                          <div className="grid grid-cols-2 gap-1 ml-2 text-sm">
                            {tariff.tariff_day_plans.map((tdp) => (
                              <div key={tdp.id}>
                                <span className="font-medium">Day {tdp.day_position}:</span>{' '}
                                {tdp.day_plan ? (
                                  <span>{tdp.day_plan.code}</span>
                                ) : (
                                  <span className="text-muted-foreground">Off</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Rhythm Start Date */}
                  {tariff.rhythm_type && tariff.rhythm_type !== 'weekly' && (
                    <DetailRow
                      label="Rhythm Start Date"
                      value={
                        tariff.rhythm_start_date
                          ? formatDate(parseISODate(tariff.rhythm_start_date))
                          : 'Not set'
                      }
                    />
                  )}
                </Section>

                {/* Validity Period */}
                <Section title="Validity Period" icon={Calendar}>
                  <DetailRow
                    label="Valid From"
                    value={tariff.valid_from ? formatDate(parseISODate(tariff.valid_from)) : 'Not set'}
                  />
                  <DetailRow
                    label="Valid To"
                    value={tariff.valid_to ? formatDate(parseISODate(tariff.valid_to)) : 'Not set'}
                  />
                </Section>

                {/* Vacation Settings */}
                <Section title="Vacation" icon={Palmtree}>
                  <DetailRow
                    label="Annual Vacation Days"
                    value={tariff.annual_vacation_days != null ? `${tariff.annual_vacation_days} days` : '-'}
                  />
                  <DetailRow
                    label="Work Days per Week"
                    value={tariff.work_days_per_week != null ? `${tariff.work_days_per_week} days` : '-'}
                  />
                  <DetailRow
                    label="Vacation Year Basis"
                    value={VACATION_BASIS_LABELS[tariff.vacation_basis ?? 'calendar_year']}
                  />
                </Section>

                {/* Target Hours */}
                <Section title="Target Hours" icon={Target}>
                  <DetailRow label="Daily" value={formatHours(tariff.daily_target_hours)} />
                  <DetailRow label="Weekly" value={formatHours(tariff.weekly_target_hours)} />
                  <DetailRow label="Monthly" value={formatHours(tariff.monthly_target_hours)} />
                  <DetailRow label="Annual" value={formatHours(tariff.annual_target_hours)} />
                </Section>

                {/* Flextime / Monthly Evaluation */}
                <Section title="Flextime" icon={Timer}>
                  <DetailRow
                    label="Credit Type"
                    value={CREDIT_TYPE_LABELS[tariff.credit_type ?? 'no_evaluation']}
                  />
                  <DetailRow
                    label="Max Flextime/Month"
                    value={
                      tariff.max_flextime_per_month != null
                        ? formatDuration(tariff.max_flextime_per_month)
                        : '-'
                    }
                  />
                  <DetailRow
                    label="Flextime Threshold"
                    value={
                      tariff.flextime_threshold != null
                        ? formatDuration(tariff.flextime_threshold)
                        : '-'
                    }
                  />
                  <DetailRow
                    label="Upper Limit (Annual)"
                    value={
                      tariff.upper_limit_annual != null
                        ? formatDuration(tariff.upper_limit_annual)
                        : '-'
                    }
                  />
                  <DetailRow
                    label="Lower Limit (Annual)"
                    value={
                      tariff.lower_limit_annual != null
                        ? formatDuration(tariff.lower_limit_annual)
                        : '-'
                    }
                  />
                </Section>

                {/* Breaks Section */}
                <Section title="Break Deductions" icon={Clock}>
                  {tariff.breaks && tariff.breaks.length > 0 ? (
                    <div className="space-y-3">
                      {tariff.breaks.map((brk) => (
                        <div key={brk.id} className="border rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline">{BREAK_TYPE_LABELS[brk.break_type]}</Badge>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{formatDuration(brk.duration)}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteBreak(brk)}
                                disabled={deleteBreakMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {brk.break_type === 'minimum' && brk.after_work_minutes != null && (
                            <div className="text-muted-foreground">
                              After {formatDuration(brk.after_work_minutes)} work
                            </div>
                          )}
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            {brk.is_paid && <span>Paid break</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No breaks configured</p>
                  )}

                  {/* Add Break Form */}
                  {showAddBreak ? (
                    <div className="border rounded-lg p-4 space-y-4 mt-4">
                      <h4 className="text-sm font-medium">Add Break</h4>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Break Type</Label>
                          <Select
                            value={newBreak.breakType}
                            onValueChange={(v) =>
                              setNewBreak({ ...newBreak, breakType: v as 'fixed' | 'variable' | 'minimum' })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fixed">Fixed</SelectItem>
                              <SelectItem value="variable">Variable</SelectItem>
                              <SelectItem value="minimum">Minimum</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Duration</Label>
                          <DurationInput
                            value={newBreak.duration}
                            onChange={(v) => setNewBreak({ ...newBreak, duration: v ?? 0 })}
                            format="minutes"
                            className="w-full"
                          />
                        </div>
                      </div>

                      {newBreak.breakType === 'minimum' && (
                        <div className="space-y-2">
                          <Label>After Work Time</Label>
                          <DurationInput
                            value={newBreak.afterWorkMinutes}
                            onChange={(v) => setNewBreak({ ...newBreak, afterWorkMinutes: v ?? 0 })}
                            format="hhmm"
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            Break is deducted after this much work time
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Paid Break</Label>
                          <p className="text-xs text-muted-foreground">Break time counts as work time</p>
                        </div>
                        <Switch
                          checked={newBreak.isPaid}
                          onCheckedChange={(c) => setNewBreak({ ...newBreak, isPaid: c })}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddBreak(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleAddBreak}
                          disabled={createBreakMutation.isPending}
                          className="flex-1"
                        >
                          {createBreakMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Add Break
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddBreak(true)}
                      className="mt-4"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Break
                    </Button>
                  )}
                </Section>
              </div>
            </ScrollArea>

            <div className="flex gap-2 mt-4 border-t pt-4">
              <Button variant="outline" className="flex-1" onClick={() => onEdit(tariff)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button variant="outline" onClick={() => onCopy(tariff)}>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(tariff)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Tariff Details</SheetTitle>
              <SheetDescription>Unable to load tariff</SheetDescription>
            </SheetHeader>
            <div className="text-center py-8 text-muted-foreground">Tariff not found</div>
          </>
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
        <SheetTitle>Loading...</SheetTitle>
        <SheetDescription>Loading tariff details</SheetDescription>
      </SheetHeader>
      <div className="space-y-6 mt-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
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
