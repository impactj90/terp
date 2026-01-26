'use client'

import * as React from 'react'
import { format } from 'date-fns'
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
          <SheetTitle>Holiday Details</SheetTitle>
          <SheetDescription>View holiday information</SheetDescription>
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
                  {holiday.is_half_day ? 'Half Day' : 'Full Day'}
                </Badge>
              </div>

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Details</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label="Date" value={formatDateDisplay(holiday.holiday_date)} />
                  <DetailRow label="Name" value={holiday.name} />
                  <DetailRow
                    label="Type"
                    value={
                      <Badge variant={holiday.is_half_day ? 'secondary' : 'default'}>
                        {holiday.is_half_day ? 'Half Day' : 'Full Day'}
                      </Badge>
                    }
                  />
                </div>
              </div>

              {/* Scope */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Scope</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label="Applies To"
                    value={
                      holiday.applies_to_all ? (
                        'All Employees'
                      ) : (
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          <span>{department?.name || 'Specific Department'}</span>
                        </div>
                      )
                    }
                  />
                  {!holiday.applies_to_all && department && (
                    <DetailRow label="Department" value={`${department.name} (${department.code})`} />
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Timestamps</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label="Created" value={formatDateTime(holiday.created_at)} />
                  <DetailRow label="Last Updated" value={formatDateTime(holiday.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Close
          </Button>
          {holiday && (
            <>
              <Button variant="outline" onClick={() => onEdit(holiday)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button variant="destructive" onClick={() => onDelete(holiday)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
