'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
import {
  useCreateOrderBooking,
  useUpdateOrderBooking,
  useActivities,
  useWorkReportsByOrder,
} from '@/hooks'
import { EmployeePicker } from '@/components/employees/employee-picker'
import type { components } from '@/types/legacy-api-types'

type OrderBooking = components['schemas']['OrderBooking']

interface OrderBookingFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  booking?: OrderBooking | null
  onSuccess?: () => void
}

interface FormState {
  employeeId: string
  activityId: string
  workReportId: string
  bookingDate: string
  hours: string
  minutes: string
  description: string
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0] ?? ''
}

const INITIAL_STATE: FormState = {
  employeeId: '',
  activityId: '',
  workReportId: '',
  bookingDate: getTodayDate(),
  hours: '0',
  minutes: '0',
  description: '',
}

export function OrderBookingFormSheet({
  open,
  onOpenChange,
  orderId,
  booking,
  onSuccess,
}: OrderBookingFormSheetProps) {
  const t = useTranslations('adminOrders')
  const isEdit = !!booking
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateOrderBooking()
  const updateMutation = useUpdateOrderBooking()
  const { data: activitiesData } = useActivities({ isActive: true, enabled: open })
  const activities = activitiesData?.data ?? []

  // Work-Report dropdown: only DRAFT scheine for the current order are
  // selectable. Signed scheine are immutable and can't accept new bookings.
  const { data: workReportsData } = useWorkReportsByOrder(orderId, open)
  const draftWorkReports = (workReportsData?.items ?? []).filter(
    (wr) => wr.status === 'DRAFT',
  )

  React.useEffect(() => {
    if (open) {
      if (booking) {
        const totalMinutes = booking.time_minutes || 0
        const hours = Math.floor(totalMinutes / 60)
        const minutes = totalMinutes % 60
        // The legacy OpenAPI types don't include work_report_id, so we
        // read it via a structural cast. tRPC-emitted records carry the
        // field directly.
        const wrId =
          (booking as unknown as { work_report_id?: string | null; workReportId?: string | null })
            .work_report_id ??
          (booking as unknown as { work_report_id?: string | null; workReportId?: string | null })
            .workReportId ??
          ''
        setForm({
          employeeId: booking.employee_id || '',
          activityId: booking.activity_id || '',
          workReportId: wrId,
          bookingDate: booking.booking_date?.split('T')[0] || '',
          hours: hours.toString(),
          minutes: minutes.toString(),
          description: booking.description || '',
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, booking])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.employeeId) {
      errors.push(t('validationEmployeeRequired'))
    }

    if (!formData.bookingDate) {
      errors.push(t('validationDateRequired'))
    }

    const totalMinutes = parseInt(formData.hours || '0') * 60 + parseInt(formData.minutes || '0')
    if (totalMinutes <= 0) {
      errors.push(t('validationTimeRequired'))
    }

    return errors
  }

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    const timeMinutes = parseInt(form.hours || '0') * 60 + parseInt(form.minutes || '0')

    // Empty string -> null (clears the assignment); a UUID -> set.
    const workReportId = form.workReportId.trim().length > 0 ? form.workReportId : null

    try {
      if (isEdit && booking) {
        await updateMutation.mutateAsync({
          id: booking.id,
          activityId: form.activityId || undefined,
          workReportId,
          bookingDate: form.bookingDate,
          timeMinutes: timeMinutes,
          description: form.description.trim() || undefined,
        })
      } else {
        await createMutation.mutateAsync({
          orderId: orderId,
          employeeId: form.employeeId,
          activityId: form.activityId || undefined,
          workReportId,
          bookingDate: form.bookingDate,
          timeMinutes: timeMinutes,
          description: form.description.trim() || undefined,
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? t(isEdit ? 'failedUpdate' : 'failedCreate')
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editBooking') : t('newBooking')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editBookingDescription') : t('createBookingDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('fieldEmployee')} *</Label>
                <EmployeePicker
                  value={form.employeeId || null}
                  onChange={(id) =>
                    setForm((prev) => ({ ...prev, employeeId: id ?? '' }))
                  }
                  placeholder={t('employeePlaceholder')}
                  disabled={isSubmitting || isEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('fieldActivity')}</Label>
                <Select
                  value={form.activityId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, activityId: value === '__none__' ? '' : value }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('activityPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('noActivity')}</SelectItem>
                    {activities.map((act) => (
                      <SelectItem key={act.id} value={act.id}>
                        {act.code} - {act.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {/*
                 * Arbeitsschein dropdown — links the booking to a DRAFT
                 * WorkReport so it materializes as a labor position when
                 * the schein is signed and converted to an invoice
                 * (R-1). Hardcoded German strings per plan §11
                 * (i18n out of scope for this module).
                 */}
                <Label htmlFor="orderBookingWorkReportId">Arbeitsschein</Label>
                <Select
                  value={form.workReportId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      workReportId: value === '__none__' ? '' : value,
                    }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="orderBookingWorkReportId">
                    <SelectValue placeholder="Kein Arbeitsschein" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Kein Arbeitsschein —</SelectItem>
                    {draftWorkReports.map((wr) => (
                      <SelectItem key={wr.id} value={wr.id}>
                        {wr.code} ({wr.visitDate})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Nur DRAFT-Arbeitsscheine wählbar. Signierte Scheine sind gesperrt.
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t('fieldDate')} *</Label>
                <Input
                  type="date"
                  value={form.bookingDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, bookingDate: e.target.value }))}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('fieldTime')} *</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={form.hours}
                      onChange={(e) => setForm((prev) => ({ ...prev, hours: e.target.value }))}
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('hours')}</p>
                  </div>
                  <span className="text-lg font-medium">:</span>
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={form.minutes}
                      onChange={(e) => setForm((prev) => ({ ...prev, minutes: e.target.value }))}
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('minutes')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('fieldDescription')}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
