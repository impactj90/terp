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
  useCreateEmploymentType,
  useUpdateEmploymentType,
  useVacationCalculationGroups,
} from '@/hooks/api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { components } from '@/lib/api/types'

type EmploymentType = components['schemas']['EmploymentType']

interface EmploymentTypeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employmentType?: EmploymentType | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  defaultWeeklyHours: string
  isActive: boolean
  vacationCalcGroupId: string
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  defaultWeeklyHours: '40.00',
  isActive: true,
  vacationCalcGroupId: '',
}

export function EmploymentTypeFormSheet({
  open,
  onOpenChange,
  employmentType,
  onSuccess,
}: EmploymentTypeFormSheetProps) {
  const t = useTranslations('adminEmploymentTypes')
  const isEdit = !!employmentType
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateEmploymentType()
  const updateMutation = useUpdateEmploymentType()

  // Fetch vacation calculation groups for dropdown
  const { data: calcGroupsData } = useVacationCalculationGroups({ enabled: open })
  const calcGroups = calcGroupsData?.data ?? []

  React.useEffect(() => {
    if (open) {
      if (employmentType) {
        setForm({
          code: employmentType.code || '',
          name: employmentType.name || '',
          description: employmentType.description || '',
          defaultWeeklyHours: employmentType.default_weekly_hours != null
            ? Number(employmentType.default_weekly_hours).toFixed(2)
            : '40.00',
          isActive: employmentType.is_active ?? true,
          vacationCalcGroupId: employmentType.vacation_calc_group_id ?? '',
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, employmentType])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.code.trim()) {
      errors.push(t('validationCodeRequired'))
    } else if (formData.code.length > 20) {
      errors.push(t('validationCodeMaxLength'))
    }

    if (!formData.name.trim()) {
      errors.push(t('validationNameRequired'))
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

    try {
      if (isEdit && employmentType) {
        await updateMutation.mutateAsync({
          path: { id: employmentType.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            default_weekly_hours: form.defaultWeeklyHours ? parseFloat(form.defaultWeeklyHours) : undefined,
            is_active: form.isActive,
            vacation_calc_group_id: form.vacationCalcGroupId || undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            default_weekly_hours: form.defaultWeeklyHours ? parseFloat(form.defaultWeeklyHours) : undefined,
            vacation_calc_group_id: form.vacationCalcGroupId || undefined,
          },
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
          <SheetTitle>{isEdit ? t('editEmploymentType') : t('newEmploymentType')}</SheetTitle>
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
                  maxLength={20}
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

            {/* Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionConfiguration')}</h3>

              <div className="space-y-2">
                <Label htmlFor="defaultWeeklyHours">{t('fieldDefaultWeeklyHours')}</Label>
                <Input
                  id="defaultWeeklyHours"
                  type="number"
                  step="0.01"
                  min="0"
                  max="168"
                  value={form.defaultWeeklyHours}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, defaultWeeklyHours: e.target.value }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('weeklyHoursPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('weeklyHoursHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vacationCalcGroupId">{t('fieldVacationCalcGroup')}</Label>
                <Select
                  value={form.vacationCalcGroupId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, vacationCalcGroupId: value === '__none__' ? '' : value }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="vacationCalcGroupId">
                    <SelectValue placeholder={t('selectVacationCalcGroup')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('noVacationCalcGroup')}</SelectItem>
                    {calcGroups.map((cg) => (
                      <SelectItem key={cg.id} value={cg.id}>
                        {cg.code} - {cg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('vacationCalcGroupHint')}
                </p>
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
