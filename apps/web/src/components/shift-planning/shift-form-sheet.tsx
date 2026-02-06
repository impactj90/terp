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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useCreateShift,
  useUpdateShift,
  useDayPlans,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Shift = components['schemas']['Shift']

interface ShiftFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift?: Shift | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  dayPlanId: string
  color: string
  qualification: string
  sortOrder: number
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  dayPlanId: '',
  color: '#3B82F6',
  qualification: '',
  sortOrder: 0,
  isActive: true,
}

const DAY_PLAN_NONE_VALUE = '__none__'

export function ShiftFormSheet({
  open,
  onOpenChange,
  shift,
  onSuccess,
}: ShiftFormSheetProps) {
  const t = useTranslations('shiftPlanning')
  const isEdit = !!shift
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateShift()
  const updateMutation = useUpdateShift()
  const { data: dayPlansData } = useDayPlans({ active: true, enabled: open })
  const dayPlans = dayPlansData?.data ?? []

  React.useEffect(() => {
    if (!open) return

    if (shift) {
      setForm({
        code: shift.code || '',
        name: shift.name || '',
        description: shift.description || '',
        dayPlanId: shift.day_plan_id || '',
        color: shift.color || '#3B82F6',
        qualification: shift.qualification || '',
        sortOrder: shift.sort_order ?? 0,
        isActive: shift.is_active ?? true,
      })
    } else {
      setForm(INITIAL_STATE)
    }
    setError(null)
  }, [open, shift])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.code.trim()) errors.push(t('validationCodeRequired'))
    else if (form.code.trim().length > 50) errors.push(t('validationCodeMaxLength'))
    if (!form.name.trim()) errors.push(t('validationNameRequired'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && shift) {
        await updateMutation.mutateAsync({
          path: { id: shift.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            day_plan_id: form.dayPlanId || undefined,
            color: form.color || undefined,
            qualification: form.qualification.trim() || undefined,
            sort_order: form.sortOrder,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            day_plan_id: form.dayPlanId || undefined,
            color: form.color || undefined,
            qualification: form.qualification.trim() || undefined,
            sort_order: form.sortOrder,
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

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editShift') : t('createShift')}</SheetTitle>
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
                <p className="text-xs text-muted-foreground">{t('codeHint')}</p>
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
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            {/* Appearance */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionAppearance')}</h3>

              <div className="space-y-2">
                <Label htmlFor="color">{t('fieldColor')}</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="color"
                    type="color"
                    value={form.color}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, color: e.target.value }))
                    }
                    disabled={isSubmitting}
                    className="h-10 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  />
                  <span className="text-sm font-mono text-muted-foreground">
                    {form.color}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="qualification">{t('fieldQualification')}</Label>
                <Input
                  id="qualification"
                  value={form.qualification}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, qualification: e.target.value }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('qualificationPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sortOrder">{t('fieldSortOrder')}</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))
                  }
                  disabled={isSubmitting}
                  min={0}
                  step={1}
                />
              </div>
            </div>

            {/* Day Plan Assignment */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionDayPlan')}</h3>

              <div className="space-y-2">
                <Label htmlFor="dayPlanId">{t('fieldDayPlan')}</Label>
                <Select
                  value={form.dayPlanId || DAY_PLAN_NONE_VALUE}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, dayPlanId: value === DAY_PLAN_NONE_VALUE ? '' : value }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="dayPlanId">
                    <SelectValue placeholder={t('dayPlanPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DAY_PLAN_NONE_VALUE}>{t('dayPlanNone')}</SelectItem>
                    {dayPlans.map((dp) => (
                      <SelectItem key={dp.id} value={dp.id}>
                        {dp.code} - {dp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status (edit only) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionStatus')}</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">{t('fieldActiveDescription')}</p>
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
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
