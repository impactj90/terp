'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  useCreateWageGroup,
  useUpdateWageGroup,
} from '@/hooks/use-wage-groups'

interface WageGroup {
  id: string
  code: string
  name: string
  internalHourlyRate: number | null
  billingHourlyRate: number | null
  sortOrder: number
  isActive: boolean
}

interface WageGroupFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wageGroup?: WageGroup | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  internalHourlyRate: string
  billingHourlyRate: string
  sortOrder: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  internalHourlyRate: '',
  billingHourlyRate: '',
  sortOrder: '0',
  isActive: true,
}

export function WageGroupFormSheet({
  open,
  onOpenChange,
  wageGroup,
  onSuccess,
}: WageGroupFormSheetProps) {
  const t = useTranslations('adminWageGroups')
  const isEdit = !!wageGroup
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateWageGroup()
  const updateMutation = useUpdateWageGroup()

  React.useEffect(() => {
    if (open) {
      if (wageGroup) {
        setForm({
          code: wageGroup.code || '',
          name: wageGroup.name || '',
          internalHourlyRate:
            wageGroup.internalHourlyRate != null
              ? String(wageGroup.internalHourlyRate)
              : '',
          billingHourlyRate:
            wageGroup.billingHourlyRate != null
              ? String(wageGroup.billingHourlyRate)
              : '',
          sortOrder: String(wageGroup.sortOrder ?? 0),
          isActive: wageGroup.isActive ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, wageGroup])

  function parseDecimal(value: string): number | null | 'invalid' {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const num = Number(trimmed)
    if (Number.isNaN(num) || num < 0) return 'invalid'
    return num
  }

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.code.trim()) {
      errors.push(t('validationCodeRequired'))
    } else if (formData.code.length > 50) {
      errors.push(t('validationCodeMaxLength'))
    }

    if (!formData.name.trim()) {
      errors.push(t('validationNameRequired'))
    }

    if (parseDecimal(formData.internalHourlyRate) === 'invalid') {
      errors.push(t('validationInternalRateInvalid'))
    }

    if (parseDecimal(formData.billingHourlyRate) === 'invalid') {
      errors.push(t('validationBillingRateInvalid'))
    }

    const so = Number(formData.sortOrder)
    if (Number.isNaN(so) || so < 0 || !Number.isInteger(so)) {
      errors.push(t('validationSortOrderInvalid'))
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

    const internalRate = parseDecimal(form.internalHourlyRate)
    const billingRate = parseDecimal(form.billingHourlyRate)

    try {
      if (isEdit && wageGroup) {
        await updateMutation.mutateAsync({
          id: wageGroup.id,
          name: form.name.trim(),
          internalHourlyRate:
            internalRate === 'invalid' ? undefined : internalRate,
          billingHourlyRate:
            billingRate === 'invalid' ? undefined : billingRate,
          sortOrder: parseInt(form.sortOrder, 10),
          isActive: form.isActive,
        })
      } else {
        await createMutation.mutateAsync({
          code: form.code.trim(),
          name: form.name.trim(),
          internalHourlyRate:
            internalRate === 'invalid' ? null : internalRate,
          billingHourlyRate:
            billingRate === 'invalid' ? null : billingRate,
          sortOrder: parseInt(form.sortOrder, 10),
          isActive: form.isActive,
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
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editWageGroup') : t('newWageGroup')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label htmlFor="code">{t('fieldCode')} *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                  }
                  disabled={isSubmitting || isEdit}
                  placeholder={t('codePlaceholder')}
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground">
                  {t('codeHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('namePlaceholder')}
                  maxLength={255}
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionPricing')}</h3>

              <div className="space-y-2">
                <Label htmlFor="internalHourlyRate">{t('fieldInternalHourlyRate')}</Label>
                <Input
                  id="internalHourlyRate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.internalHourlyRate}
                  onChange={(e) => setForm((prev) => ({ ...prev, internalHourlyRate: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('internalHourlyRatePlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('internalHourlyRateHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="billingHourlyRate">{t('fieldBillingHourlyRate')}</Label>
                <Input
                  id="billingHourlyRate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.billingHourlyRate}
                  onChange={(e) => setForm((prev) => ({ ...prev, billingHourlyRate: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('billingHourlyRatePlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('billingHourlyRateHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sortOrder">{t('fieldSortOrder')}</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  min="0"
                  step="1"
                  value={form.sortOrder}
                  onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Status (only for edit) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionStatus')}</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('fieldActive')}</Label>
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
            )}

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
