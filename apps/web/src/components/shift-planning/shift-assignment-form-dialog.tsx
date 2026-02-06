'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Loader2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  useBulkCreateEmployeeDayPlans,
  useDeleteEmployeeDayPlan,
  useDayPlans,
} from '@/hooks/api'
import { formatDate, formatDisplayDate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Shift = components['schemas']['Shift']

interface EmployeeDayPlan {
  id: string
  tenant_id: string
  employee_id: string
  plan_date: string
  day_plan_id?: string
  shift_id?: string
  source: 'tariff' | 'manual' | 'holiday'
  notes?: string
  day_plan?: { id: string; code: string; name: string }
  shift?: Shift
}

interface ShiftAssignmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: string
  employeeName: string
  date: Date
  existingPlan: EmployeeDayPlan | null
  shifts: Shift[]
  preselectedShiftId?: string
  onSuccess?: () => void
}

export function ShiftAssignmentFormDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  date,
  existingPlan,
  shifts,
  preselectedShiftId,
  onSuccess,
}: ShiftAssignmentFormDialogProps) {
  const t = useTranslations('shiftPlanning')
  const locale = useLocale()

  const [selectedShiftId, setSelectedShiftId] = React.useState('')
  const [selectedDayPlanId, setSelectedDayPlanId] = React.useState('')
  const [notes, setNotes] = React.useState('')

  const upsertMutation = useBulkCreateEmployeeDayPlans()
  const deleteMutation = useDeleteEmployeeDayPlan()

  const { data: dayPlansData } = useDayPlans({ active: true, enabled: open })
  const allDayPlans = dayPlansData?.data ?? []

  const isPending = upsertMutation.isPending || deleteMutation.isPending

  const mutationError = upsertMutation.error || deleteMutation.error

  const isTariffEntry = existingPlan?.source === 'tariff'
  const isHolidayEntry = existingPlan?.source === 'holiday'
  const isOverride = isTariffEntry || isHolidayEntry

  // Track whether the form has been initialized for this dialog open
  const initializedRef = React.useRef(false)

  // Reset state only once when dialog opens - not on every dep change
  React.useEffect(() => {
    if (!open) {
      initializedRef.current = false
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true

    if (existingPlan) {
      setSelectedShiftId(existingPlan.shift_id || '')
      setSelectedDayPlanId(existingPlan.day_plan_id || '')
      setNotes(existingPlan.notes || '')
    } else {
      setSelectedShiftId(preselectedShiftId || '')
      setSelectedDayPlanId('')
      setNotes('')

      // Auto-fill day_plan_id from selected shift
      if (preselectedShiftId) {
        const shift = shifts.find((s) => s.id === preselectedShiftId)
        if (shift?.day_plan_id) {
          setSelectedDayPlanId(shift.day_plan_id)
        }
      }
    }
  }, [open, existingPlan, preselectedShiftId, shifts])

  // When shift changes, auto-fill day_plan_id
  const handleShiftChange = (shiftId: string) => {
    setSelectedShiftId(shiftId)
    if (shiftId) {
      const shift = shifts.find((s) => s.id === shiftId)
      if (shift?.day_plan_id) {
        setSelectedDayPlanId(shift.day_plan_id)
      }
    }
  }

  const handleSave = async () => {
    // Always use bulk upsert - works by (employee_id, plan_date) key,
    // reliable for both new entries and updates to existing ones.
    const planDate = existingPlan
      ? String(existingPlan.plan_date).substring(0, 10)
      : formatDate(date)
    const empId = existingPlan?.employee_id || employeeId

    try {
      await upsertMutation.mutateAsync({
        body: {
          plans: [
            {
              employee_id: empId,
              plan_date: planDate,
              shift_id: selectedShiftId || undefined,
              day_plan_id: selectedDayPlanId || undefined,
              source: 'manual',
              notes: notes || undefined,
            },
          ],
        },
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('[ShiftAssignmentFormDialog] Save failed:', err)
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
    } catch (err) {
      console.error('[ShiftAssignmentFormDialog] Remove failed:', err)
    }
  }

  const activeShifts = shifts.filter((s) => s.is_active)
  const dateLabel = formatDisplayDate(date, 'long', locale)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {existingPlan
              ? t('cellEditTitle')
              : t('assignmentCreateTitle')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {employeeName} &mdash; {dateLabel}
          </p>
        </DialogHeader>

        {isOverride && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t('cellOverrideInfo', { source: isTariffEntry ? t('sourceTariff') : t('sourceHoliday') })}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          {/* Source badge */}
          {existingPlan && (
            <div className="flex items-center gap-2">
              <Label>{t('cellSource')}</Label>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                isTariffEntry
                  ? 'bg-blue-100 text-blue-700'
                  : isHolidayEntry
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-green-100 text-green-700'
              }`}>
                {existingPlan.source === 'tariff'
                  ? t('sourceTariff')
                  : existingPlan.source === 'holiday'
                    ? t('sourceHoliday')
                    : t('sourceManual')}
              </span>
            </div>
          )}

          {/* Shift selector */}
          <div className="space-y-2">
            <Label>{t('assignmentShift')}</Label>
            <Select
              value={selectedShiftId || '__none__'}
              onValueChange={(val) =>
                handleShiftChange(val === '__none__' ? '' : val)
              }

            >
              <SelectTrigger>
                <SelectValue placeholder={t('assignmentShiftPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {t('cellNoShift')}
                </SelectItem>
                {activeShifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-sm border shrink-0"
                        style={{
                          backgroundColor: shift.color || '#808080',
                        }}
                      />
                      <span>
                        {shift.code} - {shift.name}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Day Plan selector */}
          <div className="space-y-2">
            <Label>{t('cellDayPlan')}</Label>
            <Select
              value={selectedDayPlanId || '__none__'}
              onValueChange={(val) =>
                setSelectedDayPlanId(val === '__none__' ? '' : val)
              }

            >
              <SelectTrigger>
                <SelectValue placeholder={t('cellDayPlanPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {t('cellNoDayPlan')}
                </SelectItem>
                {allDayPlans.map((dp) => (
                  <SelectItem key={dp.id} value={dp.id}>
                    {dp.code} - {dp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('assignmentNotes')}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('assignmentNotesPlaceholder')}

            />
          </div>
        </div>

        {mutationError && (
          <Alert variant="destructive">
            <AlertDescription>
              {(mutationError as { message?: string })?.message ||
                t('assignmentSaveError')}
            </AlertDescription>
          </Alert>
        )}

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
              {t('cellRemove')}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t('assignmentCancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
          >
            {upsertMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('assignmentSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
