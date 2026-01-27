'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { Edit, Trash2, CalendarDays, Building2 } from 'lucide-react'
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
import { useHoliday, useDepartment } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

interface HolidayDetailSheetProps {
  holidayId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (holiday: Holiday) => void
  onDelete: (holiday: Holiday) => void
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

export function HolidayDetailSheet({
  holidayId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: HolidayDetailSheetProps) {
  const t = useTranslations('adminHolidays')
  const { data: holiday, isLoading } = useHoliday(holidayId || '', open && !!holidayId)

  // Fetch department details if holiday is department-specific
  const { data: department } = useDepartment(
    holiday?.department_id || '',
    open && !!holiday?.department_id
  )

  const formatDateDisplay = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'EEEE, MMMM d, yyyy')
  }

  const formatDateTime = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('holidayDetails')}</SheetTitle>
          <SheetDescription>{t('viewHolidayInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : holiday ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                  <CalendarDays className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{holiday.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDateDisplay(holiday.holiday_date)}
                  </p>
                </div>
                <Badge variant={holiday.is_half_day ? 'secondary' : 'default'}>
                  {holiday.is_half_day ? t('halfDay') : t('fullDay')}
                </Badge>
              </div>

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('detailsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldDate')} value={formatDateDisplay(holiday.holiday_date)} />
                  <DetailRow label={t('fieldName')} value={holiday.name} />
                  <DetailRow
                    label={t('fieldType')}
                    value={
                      <Badge variant={holiday.is_half_day ? 'secondary' : 'default'}>
                        {holiday.is_half_day ? t('halfDay') : t('fullDay')}
                      </Badge>
                    }
                  />
                </div>
              </div>

              {/* Scope */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('scopeSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('labelAppliesTo')}
                    value={
                      holiday.applies_to_all ? (
                        t('allEmployees')
                      ) : (
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          <span>{department?.name || t('specificDepartment')}</span>
                        </div>
                      )
                    }
                  />
                  {!holiday.applies_to_all && department && (
                    <DetailRow label={t('fieldDepartment')} value={`${department.name} (${department.code})`} />
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('timestampsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDateTime(holiday.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDateTime(holiday.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {holiday && (
            <>
              <Button variant="outline" onClick={() => onEdit(holiday)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              <Button variant="destructive" onClick={() => onDelete(holiday)}>
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
