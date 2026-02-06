'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Edit, Trash2, CalendarClock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useShift, useDayPlan } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Shift = components['schemas']['Shift']

interface ShiftDetailSheetProps {
  shiftId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (shift: Shift) => void
  onDelete: (shift: Shift) => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

export function ShiftDetailSheet({
  shiftId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: ShiftDetailSheetProps) {
  const t = useTranslations('shiftPlanning')
  const { data: shift, isLoading } = useShift(shiftId || '', open && !!shiftId)
  const { data: dayPlan } = useDayPlan(shift?.day_plan_id || '', open && !!shift?.day_plan_id)

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('shiftDetails')}</SheetTitle>
          <SheetDescription>{t('viewShiftInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : shift ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with color swatch, icon and status */}
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg"
                  style={{ backgroundColor: shift.color || '#808080' }}
                >
                  <CalendarClock className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{shift.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{shift.code}</p>
                </div>
                <Badge variant={shift.is_active ? 'default' : 'secondary'}>
                  {shift.is_active ? t('statusActive') : t('statusInactive')}
                </Badge>
              </div>

              {/* Description */}
              {shift.description && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('fieldDescription')}</h4>
                  <p className="text-sm">{shift.description}</p>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('detailsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldCode')} value={shift.code} />
                  <DetailRow label={t('fieldName')} value={shift.name} />
                </div>
              </div>

              {/* Appearance */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('appearanceSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('fieldColor')}
                    value={
                      shift.color ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="h-5 w-5 rounded-md border"
                            style={{ backgroundColor: shift.color }}
                          />
                          <span className="font-mono text-xs">{shift.color}</span>
                        </div>
                      ) : (
                        t('noColor')
                      )
                    }
                  />
                  <DetailRow
                    label={t('fieldQualification')}
                    value={shift.qualification || '-'}
                  />
                  <DetailRow
                    label={t('fieldSortOrder')}
                    value={shift.sort_order ?? 0}
                  />
                </div>
              </div>

              {/* Day Plan */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('dayPlanSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('fieldDayPlan')}
                    value={
                      dayPlan
                        ? `${dayPlan.code} - ${dayPlan.name}`
                        : shift.day_plan_id
                          ? '...'
                          : t('dayPlanNone')
                    }
                  />
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('timestampsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDate(shift.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDate(shift.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {shift && (
            <>
              <Button variant="outline" onClick={() => onEdit(shift)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => onDelete(shift)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('delete')}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
