'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDayPlans, useCreateEmployeeDayPlan, useUpdateEmployeeDayPlan, useDeleteEmployeeDayPlan } from '@/hooks/api'
import { formatDate, formatDisplayDate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type EmployeeDayPlan = components['schemas']['EmployeeDayPlan']

interface DayPlanCellEditPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: string
  employeeName: string
  date: Date
  existingPlan: EmployeeDayPlan | null
  onSuccess?: () => void
}

export function DayPlanCellEditPopover({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  date,
  existingPlan,
  onSuccess,
}: DayPlanCellEditPopoverProps) {
  const t = useTranslations('employeeDayPlans')
  const locale = useLocale()

  const [selectedDayPlanId, setSelectedDayPlanId] = React.useState<string>('')
  const [notes, setNotes] = React.useState('')

  // Fetch available day plans
  const { data: dayPlansData } = useDayPlans({ active: true, enabled: open })
  const dayPlans = dayPlansData?.data ?? []

  // Mutations
  const createMutation = useCreateEmployeeDayPlan()
  const updateMutation = useUpdateEmployeeDayPlan()
  const deleteMutation = useDeleteEmployeeDayPlan()

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedDayPlanId(existingPlan?.day_plan_id ?? '')
      setNotes(existingPlan?.notes ?? '')
    }
  }, [open, existingPlan])

  const handleSave = async () => {
    try {
      if (existingPlan) {
        // Update existing assignment
        await updateMutation.mutateAsync({
          path: { id: existingPlan.id },
          body: {
            day_plan_id: selectedDayPlanId || undefined,
            source: 'manual',
            notes: notes || undefined,
          },
        })
      } else {
        // Create new assignment
        await createMutation.mutateAsync({
          body: {
            employee_id: employeeId,
            plan_date: formatDate(date),
            day_plan_id: selectedDayPlanId || undefined,
            source: 'manual',
            notes: notes || undefined,
          },
        })
      }
      onOpenChange(false)
      onSuccess?.()
    } catch {
      // Error handled by mutation
    }
  }

  const handleRemove = async () => {
    if (!existingPlan) return
    try {
      await deleteMutation.mutateAsync({
        path: { id: existingPlan.id },
      })
      onOpenChange(false)
      onSuccess?.()
    } catch {
      // Error handled by mutation
    }
  }

  const dateLabel = formatDisplayDate(date, 'long', locale)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('cellEditTitle')}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {employeeName} &mdash; {dateLabel}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Day Plan selector */}
          <div className="space-y-2">
            <Label>{t('cellEditDayPlan')}</Label>
            <Select
              value={selectedDayPlanId || '__none__'}
              onValueChange={(val) =>
                setSelectedDayPlanId(val === '__none__' ? '' : val)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t('cellEditDayPlanPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {t('cellEditNoDayPlan')}
                </SelectItem>
                {dayPlans.map((dp) => (
                  <SelectItem key={dp.id} value={dp.id}>
                    {dp.code} - {dp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source display */}
          {existingPlan && (
            <div className="space-y-2">
              <Label>{t('cellEditSource')}</Label>
              <p className="text-sm text-muted-foreground">
                {existingPlan.source === 'tariff'
                  ? t('sourceTariff')
                  : existingPlan.source === 'manual'
                    ? t('sourceManual')
                    : t('sourceHoliday')}
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('cellEditNotes')}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('cellEditNotesPlaceholder')}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {existingPlan && (
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={isPending}
              className="sm:mr-auto"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('cellEditRemove')}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t('cellEditCancel')}
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {(createMutation.isPending || updateMutation.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('cellEditSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
