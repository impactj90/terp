'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import { CalendarIcon, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  useTariffs,
  useCreateEmployeeTariffAssignment,
  useUpdateEmployeeTariffAssignment,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type TariffAssignment = components['schemas']['EmployeeTariffAssignment']

interface FormState {
  tariffId: string
  effectiveFrom: Date | undefined
  effectiveTo: Date | undefined
  overwriteBehavior: 'overwrite' | 'preserve_manual'
  notes: string
}

const INITIAL_STATE: FormState = {
  tariffId: '',
  effectiveFrom: undefined,
  effectiveTo: undefined,
  overwriteBehavior: 'preserve_manual',
  notes: '',
}

interface TariffAssignmentFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: string
  assignment?: TariffAssignment | null
  onSuccess?: () => void
}

function formatDateForApi(date: Date | undefined): string | undefined {
  if (!date) return undefined
  return format(date, 'yyyy-MM-dd')
}

export function TariffAssignmentFormSheet({
  open,
  onOpenChange,
  employeeId,
  assignment,
  onSuccess,
}: TariffAssignmentFormSheetProps) {
  const t = useTranslations('employeeTariffAssignments')
  const isEdit = !!assignment

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [validationErrors, setValidationErrors] = React.useState<string[]>([])
  const [fromMonth, setFromMonth] = React.useState<Date>(new Date())
  const [toMonth, setToMonth] = React.useState<Date>(new Date())

  const { data: tariffsData } = useTariffs()
  const tariffs = tariffsData?.data ?? []

  const createMutation = useCreateEmployeeTariffAssignment()
  const updateMutation = useUpdateEmployeeTariffAssignment()
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  // Populate form when editing
  React.useEffect(() => {
    if (open) {
      if (assignment) {
        const from = parseISO(assignment.effective_from)
        const to = assignment.effective_to ? parseISO(assignment.effective_to) : undefined
        setForm({
          tariffId: assignment.tariff_id,
          effectiveFrom: from,
          effectiveTo: to,
          overwriteBehavior: assignment.overwrite_behavior,
          notes: assignment.notes ?? '',
        })
        setFromMonth(from)
        if (to) setToMonth(to)
      } else {
        setForm(INITIAL_STATE)
        setFromMonth(new Date())
        setToMonth(new Date())
      }
      setError(null)
      setValidationErrors([])
    }
  }, [open, assignment])

  const validate = (): string[] => {
    const errors: string[] = []
    if (!isEdit && !form.tariffId) {
      errors.push(t('validationTariffRequired'))
    }
    if (!form.effectiveFrom) {
      errors.push(t('validationEffectiveFromRequired'))
    }
    if (form.effectiveFrom && form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
      errors.push(t('validationDateOrder'))
    }
    return errors
  }

  const handleSubmit = async () => {
    setError(null)
    setValidationErrors([])

    const errors = validate()
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    try {
      if (isEdit && assignment) {
        await updateMutation.mutateAsync({
          path: { id: employeeId, assignmentId: assignment.id },
          body: {
            effective_from: formatDateForApi(form.effectiveFrom),
            effective_to: formatDateForApi(form.effectiveTo),
            overwrite_behavior: form.overwriteBehavior,
            notes: form.notes.trim() || undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          path: { id: employeeId },
          body: {
            tariff_id: form.tariffId,
            effective_from: formatDateForApi(form.effectiveFrom)!,
            overwrite_behavior: form.overwriteBehavior,
            effective_to: formatDateForApi(form.effectiveTo),
            notes: form.notes.trim() || undefined,
          },
        })
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      const apiError = err as { status?: number; detail?: string; message?: string }
      if (apiError.status === 409) {
        setError(t('errorOverlap'))
      } else {
        setError(
          apiError.detail ?? apiError.message ?? (isEdit ? t('errorUpdateFailed') : t('errorCreateFailed'))
        )
      }
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('formEditTitle') : t('formCreateTitle')}</SheetTitle>
          <SheetDescription>{isEdit ? t('formEditDescription') : t('formCreateDescription')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Error display */}
            {(error || validationErrors.length > 0) && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3">
                {validationErrors.map((ve, i) => (
                  <p key={i} className="text-sm text-destructive">{ve}</p>
                ))}
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}

            {/* Tariff selection (only for create) */}
            {!isEdit && (
              <div className="space-y-2">
                <Label>{t('fieldTariff')}</Label>
                <Select
                  value={form.tariffId}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, tariffId: v }))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('fieldTariffPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {tariffs.map((tariff) => (
                      <SelectItem key={tariff.id} value={tariff.id}>
                        {tariff.code} - {tariff.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Effective From */}
            <div className="space-y-2">
              <Label>{t('fieldEffectiveFrom')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !form.effectiveFrom && 'text-muted-foreground'
                    )}
                    disabled={isSubmitting}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.effectiveFrom ? format(form.effectiveFrom, 'dd.MM.yyyy') : t('pickDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    month={fromMonth}
                    onMonthChange={setFromMonth}
                    selected={form.effectiveFrom}
                    onSelect={(date) => {
                      if (date instanceof Date) {
                        setForm((prev) => ({ ...prev, effectiveFrom: date }))
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Effective To */}
            <div className="space-y-2">
              <Label>{t('fieldEffectiveTo')}</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.effectiveTo && 'text-muted-foreground'
                      )}
                      disabled={isSubmitting}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.effectiveTo ? format(form.effectiveTo, 'dd.MM.yyyy') : t('pickDate')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      month={toMonth}
                      onMonthChange={setToMonth}
                      selected={form.effectiveTo}
                      onSelect={(date) => {
                        if (date instanceof Date) {
                          setForm((prev) => ({ ...prev, effectiveTo: date }))
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {form.effectiveTo && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setForm((prev) => ({ ...prev, effectiveTo: undefined }))}
                    disabled={isSubmitting}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t('fieldEffectiveToHelp')}</p>
            </div>

            {/* Overwrite Behavior */}
            <div className="space-y-2">
              <Label>{t('fieldOverwriteBehavior')}</Label>
              <Select
                value={form.overwriteBehavior}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    overwriteBehavior: v as 'overwrite' | 'preserve_manual',
                  }))
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preserve_manual">
                    {t('overwriteBehaviorPreserveManual')}
                  </SelectItem>
                  <SelectItem value="overwrite">
                    {t('overwriteBehaviorOverwrite')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('fieldOverwriteBehaviorHelp')}</p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>{t('fieldNotes')}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder={t('fieldNotesPlaceholder')}
                disabled={isSubmitting}
                rows={3}
              />
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting
              ? (isEdit ? t('saving') : t('creating'))
              : (isEdit ? t('saveChanges') : t('create'))
            }
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
