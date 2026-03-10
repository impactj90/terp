'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  useCreateMacroAssignment,
  useUpdateMacroAssignment,
  useTariffs,
  useEmployees,
} from '@/hooks'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Macro = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MacroAssignment = any

interface MacroAssignmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  macroId: string
  macroType: Macro['macro_type']
  assignment?: MacroAssignment | null
}

interface FormState {
  targetType: 'tariff' | 'employee'
  tariffId: string
  employeeId: string
  executionDay: number
  isActive: boolean
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export function MacroAssignmentFormDialog({
  open,
  onOpenChange,
  macroId,
  macroType,
  assignment,
}: MacroAssignmentFormDialogProps) {
  const t = useTranslations('adminMacros')
  const isEdit = !!assignment
  const [form, setForm] = React.useState<FormState>({
    targetType: 'tariff',
    tariffId: '',
    employeeId: '',
    executionDay: macroType === 'weekly' ? 1 : 1,
    isActive: true,
  })
  const [error, setError] = React.useState<string | null>(null)

  const { data: tariffsData } = useTariffs({ enabled: open })
  const { data: employeesData } = useEmployees({ enabled: open })
  const tariffs = tariffsData?.data ?? []
  const employees = employeesData?.items ?? []

  const createMutation = useCreateMacroAssignment()
  const updateMutation = useUpdateMacroAssignment()

  React.useEffect(() => {
    if (open) {
      if (assignment) {
        setForm({
          targetType: assignment.tariffId ? 'tariff' : 'employee',
          tariffId: assignment.tariffId ?? '',
          employeeId: assignment.employeeId ?? '',
          executionDay: assignment.executionDay,
          isActive: assignment.isActive ?? true,
        })
      } else {
        setForm({
          targetType: 'tariff',
          tariffId: '',
          employeeId: '',
          executionDay: macroType === 'weekly' ? 1 : 1,
          isActive: true,
        })
      }
      setError(null)
    }
  }, [open, assignment, macroType])

  const handleSubmit = async () => {
    setError(null)

    const tariffId = form.targetType === 'tariff' ? form.tariffId || undefined : undefined
    const employeeId = form.targetType === 'employee' ? form.employeeId || undefined : undefined

    if (!tariffId && !employeeId) {
      setError(t('validationNameRequired'))
      return
    }

    try {
      if (isEdit && assignment) {
        await updateMutation.mutateAsync({
          macroId,
          assignmentId: assignment.id,
          executionDay: form.executionDay,
          isActive: form.isActive,
        })
      } else {
        await createMutation.mutateAsync({
          macroId,
          tariffId,
          employeeId,
          executionDay: form.executionDay,
        })
      }
      onOpenChange(false)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('failedSaveAssignment'))
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editAssignment') : t('addAssignment')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('editAssignmentDescription') : t('addAssignmentDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('assignmentTargetType')}</Label>
            <RadioGroup
              value={form.targetType}
              onValueChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  targetType: v as 'tariff' | 'employee',
                  tariffId: '',
                  employeeId: '',
                }))
              }
              className="flex gap-4"
              disabled={isSubmitting}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="tariff" id="tariff" />
                <Label htmlFor="tariff" className="font-normal">
                  {t('assignByTariff')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="employee" id="employee" />
                <Label htmlFor="employee" className="font-normal">
                  {t('assignByEmployee')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {form.targetType === 'tariff' && (
            <div className="space-y-2">
              <Label htmlFor="tariffId">{t('selectTariff')}</Label>
              <Select
                value={form.tariffId}
                onValueChange={(v) => setForm((prev) => ({ ...prev, tariffId: v }))}
                disabled={isSubmitting}
              >
                <SelectTrigger id="tariffId">
                  <SelectValue placeholder={t('selectTariff')} />
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

          {form.targetType === 'employee' && (
            <div className="space-y-2">
              <Label htmlFor="employeeId">{t('selectEmployee')}</Label>
              <Select
                value={form.employeeId}
                onValueChange={(v) => setForm((prev) => ({ ...prev, employeeId: v }))}
                disabled={isSubmitting}
              >
                <SelectTrigger id="employeeId">
                  <SelectValue placeholder={t('selectEmployee')} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.personnelNumber} - {employee.firstName} {employee.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="executionDay">{t('executionDay')}</Label>
            <Select
              value={String(form.executionDay)}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, executionDay: parseInt(v, 10) }))
              }
              disabled={isSubmitting}
            >
              <SelectTrigger id="executionDay">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {macroType === 'weekly'
                  ? DAYS_OF_WEEK.map((day) => (
                      <SelectItem key={day.value} value={String(day.value)}>
                        {day.label}
                      </SelectItem>
                    ))
                  : [...Array(31)].map((_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {i + 1}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('executionDayHelp')}</p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="isActive">{t('fieldActive')}</Label>
            <Switch
              id="isActive"
              checked={form.isActive}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, isActive: checked }))
              }
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('addAssignment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
