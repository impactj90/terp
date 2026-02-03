'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useCreateMonthlyEvaluation,
  useUpdateMonthlyEvaluation,
} from '@/hooks/api/use-monthly-evaluations'
import { formatDuration } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type MonthlyEvaluation = components['schemas']['MonthlyEvaluation']

interface MonthlyEvaluationFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: MonthlyEvaluation | null
  onSuccess?: () => void
}

interface FormState {
  name: string
  description: string
  flextimeCapPositive: number | ''
  flextimeCapNegative: number | ''
  overtimeThreshold: number | ''
  maxCarryoverVacation: number | ''
  isDefault: boolean
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  flextimeCapPositive: '',
  flextimeCapNegative: '',
  overtimeThreshold: '',
  maxCarryoverVacation: '',
  isDefault: false,
  isActive: true,
}

export function MonthlyEvaluationFormSheet({
  open,
  onOpenChange,
  item,
  onSuccess,
}: MonthlyEvaluationFormSheetProps) {
  const t = useTranslations('adminMonthlyEvaluations')
  const isEdit = !!item
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Mutations
  const createMutation = useCreateMonthlyEvaluation()
  const updateMutation = useUpdateMonthlyEvaluation()

  // Reset form when opening/closing or item changes
  React.useEffect(() => {
    if (open) {
      if (item) {
        setForm({
          name: item.name || '',
          description: item.description || '',
          flextimeCapPositive: item.flextime_cap_positive ?? '',
          flextimeCapNegative: item.flextime_cap_negative ?? '',
          overtimeThreshold: item.overtime_threshold ?? '',
          maxCarryoverVacation: item.max_carryover_vacation ?? '',
          isDefault: item.is_default ?? false,
          isActive: item.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, item])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.name.trim()) {
      errors.push(t('validationNameRequired'))
    } else if (form.name.length > 100) {
      errors.push(t('validationNameMaxLength'))
    }
    if (form.flextimeCapPositive !== '' && Number(form.flextimeCapPositive) < 0) {
      errors.push(t('validationMinZero'))
    }
    if (form.flextimeCapNegative !== '' && Number(form.flextimeCapNegative) < 0) {
      errors.push(t('validationMinZero'))
    }
    if (form.overtimeThreshold !== '' && Number(form.overtimeThreshold) < 0) {
      errors.push(t('validationMinZero'))
    }
    if (form.maxCarryoverVacation !== '' && Number(form.maxCarryoverVacation) < 0) {
      errors.push(t('validationMinZero'))
    }

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && item) {
        await updateMutation.mutateAsync({
          path: { id: item.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            flextime_cap_positive: form.flextimeCapPositive !== '' ? Number(form.flextimeCapPositive) : undefined,
            flextime_cap_negative: form.flextimeCapNegative !== '' ? Number(form.flextimeCapNegative) : undefined,
            overtime_threshold: form.overtimeThreshold !== '' ? Number(form.overtimeThreshold) : undefined,
            max_carryover_vacation: form.maxCarryoverVacation !== '' ? Number(form.maxCarryoverVacation) : undefined,
            is_default: form.isDefault,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            flextime_cap_positive: form.flextimeCapPositive !== '' ? Number(form.flextimeCapPositive) : undefined,
            flextime_cap_negative: form.flextimeCapNegative !== '' ? Number(form.flextimeCapNegative) : undefined,
            overtime_threshold: form.overtimeThreshold !== '' ? Number(form.overtimeThreshold) : undefined,
            max_carryover_vacation: form.maxCarryoverVacation !== '' ? Number(form.maxCarryoverVacation) : undefined,
            is_default: form.isDefault,
            is_active: form.isActive,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? (isEdit ? t('failedUpdate') : t('failedCreate'))
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editTitle') : t('createTitle')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('namePlaceholder')}
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            {/* Time Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionTimeConfig')}</h3>

              <div className="space-y-2">
                <Label htmlFor="flextimeCapPositive">{t('fieldFlextimePositive')}</Label>
                <Input
                  id="flextimeCapPositive"
                  type="number"
                  value={form.flextimeCapPositive}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      flextimeCapPositive: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('minutesPlaceholder')}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  {form.flextimeCapPositive !== '' && Number(form.flextimeCapPositive) > 0
                    ? formatDuration(Number(form.flextimeCapPositive))
                    : ''}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="flextimeCapNegative">{t('fieldFlextimeNegative')}</Label>
                <Input
                  id="flextimeCapNegative"
                  type="number"
                  value={form.flextimeCapNegative}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      flextimeCapNegative: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('minutesPlaceholder')}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  {form.flextimeCapNegative !== '' && Number(form.flextimeCapNegative) > 0
                    ? formatDuration(Number(form.flextimeCapNegative))
                    : ''}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="overtimeThreshold">{t('fieldOvertimeThreshold')}</Label>
                <Input
                  id="overtimeThreshold"
                  type="number"
                  value={form.overtimeThreshold}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      overtimeThreshold: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('minutesPlaceholder')}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  {form.overtimeThreshold !== '' && Number(form.overtimeThreshold) > 0
                    ? formatDuration(Number(form.overtimeThreshold))
                    : ''}
                </p>
              </div>
            </div>

            {/* Vacation Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionVacationConfig')}</h3>

              <div className="space-y-2">
                <Label htmlFor="maxCarryoverVacation">{t('fieldMaxCarryover')}</Label>
                <Input
                  id="maxCarryoverVacation"
                  type="number"
                  value={form.maxCarryoverVacation}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      maxCarryoverVacation: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('daysPlaceholder')}
                  min={0}
                  step={0.5}
                />
              </div>
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionSettings')}</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isDefault">{t('fieldIsDefault')}</Label>
                  {form.isDefault && (
                    <p className="text-xs text-amber-600">
                      {t('defaultWarning')}
                    </p>
                  )}
                </div>
                <Switch
                  id="isDefault"
                  checked={form.isDefault}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isDefault: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">{t('fieldIsActive')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('fieldActiveDescription')}
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isActive: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Error */}
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
