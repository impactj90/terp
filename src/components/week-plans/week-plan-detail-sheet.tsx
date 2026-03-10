'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Edit, Trash2, Copy, CalendarDays } from 'lucide-react'
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
import { useWeekPlan } from '@/hooks'
import { cn } from '@/lib/utils'

type WeekPlanData = NonNullable<ReturnType<typeof useWeekPlan>['data']>
type DayPlanSummary = NonNullable<WeekPlanData['mondayDayPlan']>

interface WeekPlanDetailSheetProps {
  weekPlanId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (weekPlan: WeekPlanData) => void
  onDelete: (weekPlan: WeekPlanData) => void
  onCopy: (weekPlan: WeekPlanData) => void
}

const DAYS = [
  { key: 'monday', labelKey: 'monday' as const, shortKey: 'mon' as const, planKey: 'mondayDayPlan' as const, weekend: false },
  { key: 'tuesday', labelKey: 'tuesday' as const, shortKey: 'tue' as const, planKey: 'tuesdayDayPlan' as const, weekend: false },
  { key: 'wednesday', labelKey: 'wednesday' as const, shortKey: 'wed' as const, planKey: 'wednesdayDayPlan' as const, weekend: false },
  { key: 'thursday', labelKey: 'thursday' as const, shortKey: 'thu' as const, planKey: 'thursdayDayPlan' as const, weekend: false },
  { key: 'friday', labelKey: 'friday' as const, shortKey: 'fri' as const, planKey: 'fridayDayPlan' as const, weekend: false },
  { key: 'saturday', labelKey: 'saturday' as const, shortKey: 'sat' as const, planKey: 'saturdayDayPlan' as const, weekend: true },
  { key: 'sunday', labelKey: 'sunday' as const, shortKey: 'sun' as const, planKey: 'sundayDayPlan' as const, weekend: true },
]

function countWorkDays(weekPlan: WeekPlanData): number {
  const days = [
    weekPlan.mondayDayPlanId,
    weekPlan.tuesdayDayPlanId,
    weekPlan.wednesdayDayPlanId,
    weekPlan.thursdayDayPlanId,
    weekPlan.fridayDayPlanId,
    weekPlan.saturdayDayPlanId,
    weekPlan.sundayDayPlanId,
  ]
  return days.filter(Boolean).length
}

export function WeekPlanDetailSheet({
  weekPlanId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onCopy,
}: WeekPlanDetailSheetProps) {
  const t = useTranslations('adminWeekPlans')
  const { data: weekPlan, isLoading } = useWeekPlan(weekPlanId ?? '', open && !!weekPlanId)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        {isLoading ? (
          <DetailSheetSkeleton />
        ) : weekPlan ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="flex items-center gap-2">
                    {weekPlan.name}
                    <Badge variant={weekPlan.isActive ? 'default' : 'secondary'}>
                      {weekPlan.isActive ? t('statusActive') : t('statusInactive')}
                    </Badge>
                  </SheetTitle>
                  <SheetDescription className="mt-1">
                    <span className="font-mono">{weekPlan.code}</span>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
              <div className="space-y-6">
                {/* Visual Week Grid */}
                <Section title={t('sectionWeekSchedule')} icon={CalendarDays}>
                  <WeekGrid weekPlan={weekPlan} />
                </Section>

                {/* Summary */}
                <div className="border rounded-lg p-4 bg-muted/30">
                  <h4 className="text-sm font-medium mb-3">{t('sectionSummary')}</h4>
                  <div className="space-y-2">
                    <DetailRow label={t('labelWorkDays')} value={`${countWorkDays(weekPlan)}/7`} />
                    {weekPlan.description && (
                      <DetailRow label={t('fieldDescription')} value={weekPlan.description} />
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex gap-2 mt-4 border-t pt-4">
              <Button variant="outline" className="flex-1" onClick={() => onEdit(weekPlan)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('actionEdit')}
              </Button>
              <Button variant="outline" onClick={() => onCopy(weekPlan)}>
                <Copy className="mr-2 h-4 w-4" />
                {t('actionCopy')}
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(weekPlan)}
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

function WeekGrid({ weekPlan }: { weekPlan: WeekPlanData }) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {DAYS.map((day) => {
        const dayPlan = weekPlan[day.planKey] as DayPlanSummary | null | undefined
        return <DayCard key={day.key} day={day} dayPlan={dayPlan} />
      })}
    </div>
  )
}

function DayCard({
  day,
  dayPlan,
}: {
  day: (typeof DAYS)[0]
  dayPlan: DayPlanSummary | null | undefined
}) {
  const t = useTranslations('adminWeekPlans')

  return (
    <div
      className={cn(
        'p-2 border rounded-lg text-center min-h-[100px] flex flex-col',
        day.weekend && 'bg-muted/30',
        !dayPlan && 'opacity-60'
      )}
    >
      <div className="text-xs font-medium text-muted-foreground mb-2">{t(day.shortKey as Parameters<typeof t>[0])}</div>
      {dayPlan ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1">
          <Badge variant="outline" className="text-xs">
            {dayPlan.code}
          </Badge>
          <div
            className="text-xs mt-1 truncate w-full px-1"
            title={dayPlan.name}
          >
            {dayPlan.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {dayPlan.planType === 'fixed' ? t('typeFixed') : t('typeFlex')}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">{t('off')}</span>
        </div>
      )}
    </div>
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
      <div>{children}</div>
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
        <div>
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
        <Skeleton className="h-24 rounded-lg" />
      </div>
    </>
  )
}
