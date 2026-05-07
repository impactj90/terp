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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCreateActivity,
  useUpdateActivity,
} from '@/hooks'

type PricingType = 'HOURLY' | 'FLAT_RATE' | 'PER_UNIT'

interface Activity {
  id: string
  code: string
  name: string
  description: string | null
  isActive?: boolean
  is_active?: boolean
  pricingType?: PricingType
  flatRate?: number | null
  hourlyRate?: number | null
  unit?: string | null
  calculatedHourEquivalent?: number | null
}

interface ActivityFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activity?: Activity | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  isActive: boolean
  pricingType: PricingType
  flatRate: string
  hourlyRate: string
  unit: string
  calculatedHourEquivalent: string
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  isActive: true,
  pricingType: 'HOURLY',
  flatRate: '',
  hourlyRate: '',
  unit: '',
  calculatedHourEquivalent: '',
}

function parseDecimal(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const num = Number(trimmed)
  if (Number.isNaN(num) || num < 0) return 'invalid'
  return num
}

export function ActivityFormSheet({
  open,
  onOpenChange,
  activity,
  onSuccess,
}: ActivityFormSheetProps) {
  const t = useTranslations('adminActivities')
  const isEdit = !!activity
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateActivity()
  const updateMutation = useUpdateActivity()

  React.useEffect(() => {
    if (open) {
      if (activity) {
        setForm({
          code: activity.code || '',
          name: activity.name || '',
          description: activity.description || '',
          isActive: activity.isActive ?? activity.is_active ?? true,
          pricingType: (activity.pricingType ?? 'HOURLY') as PricingType,
          flatRate:
            activity.flatRate != null ? String(activity.flatRate) : '',
          hourlyRate:
            activity.hourlyRate != null ? String(activity.hourlyRate) : '',
          unit: activity.unit ?? '',
          calculatedHourEquivalent:
            activity.calculatedHourEquivalent != null
              ? String(activity.calculatedHourEquivalent)
              : '',
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, activity])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.code.trim()) {
      errors.push(t('validationCodeRequired'))
    }

    if (!formData.name.trim()) {
      errors.push(t('validationNameRequired'))
    }

    if (formData.pricingType === 'FLAT_RATE') {
      const flatRate = parseDecimal(formData.flatRate)
      if (flatRate === null) {
        errors.push(t('validationFlatRateRequired'))
      } else if (flatRate === 'invalid') {
        errors.push(t('validationFlatRateNonNegative'))
      }
    }

    if (formData.pricingType === 'HOURLY') {
      const hourlyRate = parseDecimal(formData.hourlyRate)
      if (hourlyRate === 'invalid') {
        errors.push(t('validationHourlyRateNonNegative'))
      }
    }

    if (formData.pricingType === 'PER_UNIT') {
      if (!formData.unit.trim()) {
        errors.push(t('validationUnitRequired'))
      }
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

    const flatRate = parseDecimal(form.flatRate)
    const hourlyRate = parseDecimal(form.hourlyRate)
    const calc = parseDecimal(form.calculatedHourEquivalent)

    const pricingPayload = {
      pricingType: form.pricingType,
      flatRate:
        form.pricingType === 'FLAT_RATE'
          ? flatRate === 'invalid'
            ? null
            : flatRate
          : null,
      hourlyRate:
        form.pricingType === 'HOURLY'
          ? hourlyRate === 'invalid'
            ? null
            : hourlyRate
          : null,
      unit: form.pricingType === 'PER_UNIT' ? form.unit.trim() : null,
      calculatedHourEquivalent: calc === 'invalid' ? null : calc,
    }

    try {
      if (isEdit && activity) {
        await updateMutation.mutateAsync({
          id: activity.id,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          isActive: form.isActive,
          ...pricingPayload,
        })
      } else {
        await createMutation.mutateAsync({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          ...pricingPayload,
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
          <SheetTitle>{isEdit ? t('editActivity') : t('newActivity')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            <div className="space-y-4">
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

            {/* Pricing */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionPricing')}</h3>

              <div className="space-y-2">
                <Label htmlFor="pricingType">{t('fieldPricingType')}</Label>
                <Select
                  value={form.pricingType}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, pricingType: value as PricingType }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="pricingType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOURLY">{t('pricingTypeHourly')}</SelectItem>
                    <SelectItem value="FLAT_RATE">{t('pricingTypeFlatRate')}</SelectItem>
                    <SelectItem value="PER_UNIT">{t('pricingTypePerUnit')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.pricingType === 'HOURLY' && (
                <div className="space-y-2">
                  <Label htmlFor="hourlyRate">{t('fieldHourlyRate')}</Label>
                  <Input
                    id="hourlyRate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.hourlyRate}
                    onChange={(e) => setForm((prev) => ({ ...prev, hourlyRate: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder="0.00"
                  />
                </div>
              )}

              {form.pricingType === 'FLAT_RATE' && (
                <div className="space-y-2">
                  <Label htmlFor="flatRate">{t('fieldFlatRate')} *</Label>
                  <Input
                    id="flatRate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.flatRate}
                    onChange={(e) => setForm((prev) => ({ ...prev, flatRate: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder="0.00"
                  />
                </div>
              )}

              {form.pricingType === 'PER_UNIT' && (
                <div className="space-y-2">
                  <Label htmlFor="unit">{t('fieldUnit')} *</Label>
                  <Input
                    id="unit"
                    value={form.unit}
                    onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder={t('unitPlaceholder')}
                    maxLength={20}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="calculatedHourEquivalent">
                  {t('fieldCalculatedHourEquivalent')}
                </Label>
                <Input
                  id="calculatedHourEquivalent"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.calculatedHourEquivalent}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, calculatedHourEquivalent: e.target.value }))
                  }
                  disabled={isSubmitting}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  {t('calculatedHourEquivalentHint')}
                </p>
              </div>
            </div>

            {isEdit && (
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
            )}

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
