'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { AbsenceTypeSelector } from './absence-type-selector'
import {
  VacationImpactPreview,
  calculateWorkingDays,
} from './vacation-impact-preview'
import {
  useAbsenceTypes,
  useEmployeeAbsences,
  useEmployeeVacationBalance,
  useCreateAbsenceRange,
  useHolidays,
} from '@/hooks/api'
import { formatDate, isSameDay, parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type AbsenceType = components['schemas']['AbsenceType']
type Absence = components['schemas']['Absence']

interface AbsenceRequestFormProps {
  /** Employee ID to create absence for */
  employeeId?: string
  /** Whether the form is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Callback when absence is created successfully */
  onSuccess?: () => void
  /** Pre-fill dates from calendar click */
  initialDates?: DateRange
}

interface FormState {
  absenceTypeId: string
  dateRange: DateRange
  duration: '1' | '0.5'
  halfDayPortion: 'morning' | 'afternoon'
  notes: string
}

const INITIAL_STATE: FormState = {
  absenceTypeId: '',
  dateRange: {},
  duration: '1',
  halfDayPortion: 'morning',
  notes: '',
}

function validateForm(form: FormState): string[] {
  const errors: string[] = []

  if (!form.absenceTypeId) {
    errors.push('Please select an absence type')
  }

  if (!form.dateRange.from) {
    errors.push('Please select a start date')
  }

  if (!form.dateRange.to) {
    errors.push('Please select an end date')
  }

  if (form.dateRange.from && form.dateRange.to) {
    if (form.dateRange.from > form.dateRange.to) {
      errors.push('End date must be after start date')
    }
  }

  return errors
}

function hasOverlap(from: Date, to: Date, existingAbsences: Absence[]): Absence | undefined {
  return existingAbsences.find((absence) => {
    const absFrom = parseISODate(absence.absence_date)
    // For single day absences, to is same as from
    const absTo = absFrom
    return !(to < absFrom || from > absTo)
  })
}

export function AbsenceRequestForm({
  employeeId,
  open,
  onOpenChange,
  onSuccess,
  initialDates,
}: AbsenceRequestFormProps) {
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Reset form when opening with initial dates
  React.useEffect(() => {
    if (open) {
      setForm({
        ...INITIAL_STATE,
        dateRange: initialDates ?? {},
      })
      setError(null)
    }
  }, [open, initialDates])

  // Fetch absence types
  const { data: absenceTypesData, isLoading: isLoadingTypes } = useAbsenceTypes(open)

  // Fetch holidays for current year
  const currentYear = new Date().getFullYear()
  const { data: holidaysData } = useHolidays({
    year: currentYear,
    enabled: open,
  })

  // Fetch employee vacation balance
  const { data: balanceData, isLoading: isLoadingBalance } = useEmployeeVacationBalance(
    employeeId ?? '',
    currentYear,
    open && !!employeeId
  )

  // Fetch existing absences to check for overlaps
  const { data: absencesData } = useEmployeeAbsences(employeeId ?? '', {
    from: formatDate(new Date(currentYear, 0, 1)),
    to: formatDate(new Date(currentYear, 11, 31)),
    enabled: open && !!employeeId,
  })

  // Create mutation
  const createMutation = useCreateAbsenceRange()

  // Derived state
  const absenceTypes = absenceTypesData?.data ?? []
  const selectedType = absenceTypes.find((t) => t.id === form.absenceTypeId)
  const holidays = React.useMemo(
    () => holidaysData?.map((h) => parseISODate(h.holiday_date)) ?? [],
    [holidaysData]
  )
  const existingAbsences = absencesData?.data ?? []

  // Calculate working days for the selected range
  const requestedDays = React.useMemo(() => {
    if (!form.dateRange.from || !form.dateRange.to) return 0
    return calculateWorkingDays(form.dateRange.from, form.dateRange.to, holidays)
  }, [form.dateRange, holidays])

  // Check for overlaps
  const overlappingAbsence = React.useMemo(() => {
    if (!form.dateRange.from || !form.dateRange.to) return undefined
    return hasOverlap(form.dateRange.from, form.dateRange.to, existingAbsences)
  }, [form.dateRange, existingAbsences])

  // Whether half-day option is available (only for single day)
  const canSelectHalfDay =
    form.dateRange.from &&
    form.dateRange.to &&
    isSameDay(form.dateRange.from, form.dateRange.to)

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    if (overlappingAbsence) {
      setError('Selected dates overlap with an existing absence')
      return
    }

    if (!employeeId) {
      setError('Employee not found')
      return
    }

    try {
      await createMutation.mutateAsync({
        path: { id: employeeId },
        body: {
          absence_type_id: form.absenceTypeId,
          from: formatDate(form.dateRange.from!),
          to: formatDate(form.dateRange.to!),
          duration: form.duration === '0.5' ? 0.5 : 1,
          notes: form.notes || undefined,
        },
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Failed to create absence request')
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-hidden">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>Request Absence</SheetTitle>
          <SheetDescription>
            Submit a request for time off. Your manager will be notified for
            approval.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Absence Type */}
            <div className="space-y-3">
              <Label className="text-base">Absence Type</Label>
              <AbsenceTypeSelector
                value={form.absenceTypeId}
                onChange={(typeId) =>
                  setForm((prev) => ({ ...prev, absenceTypeId: typeId }))
                }
                types={absenceTypes}
                isLoading={isLoadingTypes}
                disabled={isSubmitting}
              />
            </div>

            {/* Date Range */}
            <div className="space-y-3">
              <Label className="text-base">Dates</Label>
              <DateRangePicker
                value={form.dateRange}
                onChange={(range) =>
                  setForm((prev) => ({
                    ...prev,
                    dateRange: range ?? {},
                    // Reset duration if range is more than one day
                    duration:
                      range?.from &&
                      range?.to &&
                      !isSameDay(range.from, range.to)
                        ? '1'
                        : prev.duration,
                  }))
                }
                holidays={holidays}
                absences={existingAbsences.map((a) =>
                  parseISODate(a.absence_date)
                )}
                disabled={isSubmitting}
                placeholder="Select date range..."
              />
              {requestedDays > 0 && (
                <p className="text-sm text-muted-foreground">
                  {requestedDays} working day{requestedDays !== 1 ? 's' : ''}{' '}
                  selected
                </p>
              )}
              {overlappingAbsence && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Selected dates overlap with an existing absence.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Duration (Full/Half day) */}
            {canSelectHalfDay && (
              <div className="space-y-3">
                <Label className="text-base">Duration</Label>
                <RadioGroup
                  value={form.duration}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      duration: value as '1' | '0.5',
                    }))
                  }
                  disabled={isSubmitting}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1" id="full-day" />
                    <Label htmlFor="full-day" className="font-normal">
                      Full day
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="0.5" id="half-day" />
                    <Label htmlFor="half-day" className="font-normal">
                      Half day
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Half day portion */}
            {canSelectHalfDay && form.duration === '0.5' && (
              <div className="space-y-3">
                <Label className="text-base">Which half?</Label>
                <RadioGroup
                  value={form.halfDayPortion}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      halfDayPortion: value as 'morning' | 'afternoon',
                    }))
                  }
                  disabled={isSubmitting}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="morning" id="morning" />
                    <Label htmlFor="morning" className="font-normal">
                      Morning
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="afternoon" id="afternoon" />
                    <Label htmlFor="afternoon" className="font-normal">
                      Afternoon
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Vacation Impact Preview */}
            {selectedType && requestedDays > 0 && (
              <VacationImpactPreview
                currentBalance={balanceData?.remaining_days}
                totalEntitlement={balanceData?.total_entitlement}
                requestedDays={requestedDays}
                isHalfDay={form.duration === '0.5'}
                absenceType={selectedType as AbsenceType}
                isLoading={isLoadingBalance}
              />
            )}

            {/* Notes */}
            <div className="space-y-3">
              <Label htmlFor="notes" className="text-base">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="notes"
                placeholder="Add any additional information..."
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-shrink-0 flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !form.absenceTypeId || !form.dateRange.from}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
