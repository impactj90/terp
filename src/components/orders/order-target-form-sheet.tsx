'use client'

import * as React from 'react'
import { Loader2, Plus, X } from 'lucide-react'
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
import { useUpsertOrderTarget } from '@/hooks/use-order-targets'
import { useActivities } from '@/hooks'

interface OrderTarget {
  id: string
  version: number
  validFrom: string | Date
  validTo: string | Date | null
  targetHours: number | null
  targetMaterialCost: number | null
  targetTravelMinutes: number | null
  targetExternalCost: number | null
  targetRevenue: number | null
  targetUnitItems: Array<{ activityId: string; quantity: number }> | null
  changeReason: string | null
  notes: string | null
}

interface OrderTargetFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  /** If non-null, this is a re-plan operation (closes active version, creates new one). */
  activeTarget?: OrderTarget | null
  onSuccess?: () => void
}

interface UnitItemRow {
  id: string // local row id
  activityId: string
  quantity: string
}

interface FormState {
  validFrom: string
  targetHours: string
  targetMaterialCost: string
  targetTravelMinutes: string
  targetExternalCost: string
  targetRevenue: string
  changeReason: string
  notes: string
  unitItems: UnitItemRow[]
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0] ?? ''
}

const INITIAL_STATE: FormState = {
  validFrom: todayIso(),
  targetHours: '',
  targetMaterialCost: '',
  targetTravelMinutes: '',
  targetExternalCost: '',
  targetRevenue: '',
  changeReason: '',
  notes: '',
  unitItems: [],
}

function nextRowId(): string {
  return Math.random().toString(36).slice(2, 11)
}

function parseDecimal(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const num = Number(trimmed)
  if (Number.isNaN(num) || num < 0) return 'invalid'
  return num
}

function parseInteger(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const num = Number(trimmed)
  if (Number.isNaN(num) || num < 0 || !Number.isInteger(num)) return 'invalid'
  return num
}

export function OrderTargetFormSheet({
  open,
  onOpenChange,
  orderId,
  activeTarget,
  onSuccess,
}: OrderTargetFormSheetProps) {
  const t = useTranslations('nachkalkulation.target')
  const isReplan = !!activeTarget
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const upsertMutation = useUpsertOrderTarget()
  const { data: activitiesData } = useActivities({ isActive: true, enabled: open })
  const activities = activitiesData?.data ?? []
  // Filter PER_UNIT activities defensively — accept both upper- and lower-case
  // and a few legacy alias values, so the dropdown also surfaces older data
  // from before the pricingType migration ran.
  const perUnitActivities = activities.filter((a) => {
    const pt = (a as { pricingType?: unknown }).pricingType
    if (typeof pt !== 'string') return false
    return pt.toUpperCase() === 'PER_UNIT'
  })

  // Dev-only diagnostic: surface why the PER_UNIT dropdown might be empty.
  // Removable once the OrderTarget UI has shipped with sample data.
  React.useEffect(() => {
    if (!open) return
    if (activities.length === 0) {
      // eslint-disable-next-line no-console
      console.debug('[NK-OrderTarget] activities list is empty', {
        activitiesData,
      })
      return
    }
    if (perUnitActivities.length === 0) {
      // eslint-disable-next-line no-console
      console.debug(
        '[NK-OrderTarget] no PER_UNIT activities found; pricingTypes seen:',
        activities.map((a) => (a as { code?: string; pricingType?: unknown }).pricingType),
      )
    }
  }, [open, activities, perUnitActivities.length, activitiesData])

  React.useEffect(() => {
    if (open) {
      if (activeTarget) {
        // Re-plan mode: pre-fill from current active version. The new
        // version's validFrom must be strictly after the active version's
        // validFrom (service-side rule). Default to max(today, active+1).
        const activeValidFrom = new Date(activeTarget.validFrom)
        const nextDay = new Date(activeValidFrom)
        nextDay.setDate(nextDay.getDate() + 1)
        const todayDate = new Date(todayIso())
        const defaultValidFrom = (
          nextDay > todayDate ? nextDay : todayDate
        )
          .toISOString()
          .split('T')[0] ?? todayIso()
        const unitItems: UnitItemRow[] = (activeTarget.targetUnitItems ?? []).map((u) => ({
          id: nextRowId(),
          activityId: u.activityId,
          quantity: String(u.quantity),
        }))
        setForm({
          validFrom: defaultValidFrom,
          targetHours: activeTarget.targetHours != null ? String(activeTarget.targetHours) : '',
          targetMaterialCost:
            activeTarget.targetMaterialCost != null
              ? String(activeTarget.targetMaterialCost)
              : '',
          targetTravelMinutes:
            activeTarget.targetTravelMinutes != null
              ? String(activeTarget.targetTravelMinutes)
              : '',
          targetExternalCost:
            activeTarget.targetExternalCost != null
              ? String(activeTarget.targetExternalCost)
              : '',
          targetRevenue: activeTarget.targetRevenue != null ? String(activeTarget.targetRevenue) : '',
          changeReason: '',
          notes: activeTarget.notes ?? '',
          unitItems,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, activeTarget])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.validFrom.trim()) {
      errors.push(t('validationFromRequired'))
    }

    // Re-plan: validFrom muss strikt nach der aktiven Version liegen
    if (activeTarget && formData.validFrom) {
      const newFrom = new Date(formData.validFrom)
      const activeFrom = new Date(activeTarget.validFrom)
      if (
        !Number.isNaN(newFrom.getTime()) &&
        !Number.isNaN(activeFrom.getTime()) &&
        newFrom <= activeFrom
      ) {
        errors.push(t('validationFromPast'))
      }
    }

    const decimalFields: Array<keyof FormState> = [
      'targetHours',
      'targetMaterialCost',
      'targetExternalCost',
      'targetRevenue',
    ]
    for (const f of decimalFields) {
      const v = parseDecimal(formData[f] as string)
      if (v === 'invalid') {
        errors.push(t('validationNonNegative'))
        break
      }
    }
    if (parseInteger(formData.targetTravelMinutes) === 'invalid') {
      errors.push(t('validationNonNegative'))
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

    const targetHours = parseDecimal(form.targetHours)
    const targetMaterialCost = parseDecimal(form.targetMaterialCost)
    const targetExternalCost = parseDecimal(form.targetExternalCost)
    const targetRevenue = parseDecimal(form.targetRevenue)
    const targetTravelMinutes = parseInteger(form.targetTravelMinutes)

    const unitItems = form.unitItems
      .filter((u) => u.activityId && u.quantity)
      .map((u) => ({ activityId: u.activityId, quantity: Number(u.quantity) }))
      .filter((u) => !Number.isNaN(u.quantity) && u.quantity > 0)

    try {
      await upsertMutation.mutateAsync({
        orderId,
        validFrom: form.validFrom,
        targetHours: targetHours === 'invalid' ? null : targetHours,
        targetMaterialCost: targetMaterialCost === 'invalid' ? null : targetMaterialCost,
        targetTravelMinutes: targetTravelMinutes === 'invalid' ? null : targetTravelMinutes,
        targetExternalCost: targetExternalCost === 'invalid' ? null : targetExternalCost,
        targetRevenue: targetRevenue === 'invalid' ? null : targetRevenue,
        targetUnitItems: unitItems.length > 0 ? unitItems : null,
        changeReason: form.changeReason.trim() || undefined,
        notes: form.notes.trim() || undefined,
      })

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('failed'))
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = upsertMutation.isPending

  const handleAddUnitItem = () => {
    setForm((prev) => ({
      ...prev,
      unitItems: [
        ...prev.unitItems,
        { id: nextRowId(), activityId: '', quantity: '' },
      ],
    }))
  }

  const handleRemoveUnitItem = (rowId: string) => {
    setForm((prev) => ({
      ...prev,
      unitItems: prev.unitItems.filter((u) => u.id !== rowId),
    }))
  }

  const handleUpdateUnitItem = (rowId: string, key: 'activityId' | 'quantity', value: string) => {
    setForm((prev) => ({
      ...prev,
      unitItems: prev.unitItems.map((u) =>
        u.id === rowId ? { ...u, [key]: value } : u,
      ),
    }))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {isReplan ? t('replanTitle') : t('newTitle')}
          </SheetTitle>
          <SheetDescription>
            {isReplan ? t('replanBanner') : t('newTitle')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {isReplan && (
              <Alert>
                <AlertDescription>{t('replanBanner')}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="validFrom">{t('fieldValidFrom')} *</Label>
                <Input
                  id="validFrom"
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                  disabled={isSubmitting}
                  min={
                    isReplan && activeTarget
                      ? (() => {
                          const next = new Date(activeTarget.validFrom)
                          next.setDate(next.getDate() + 1)
                          return next.toISOString().split('T')[0] ?? ''
                        })()
                      : undefined
                  }
                />
                {isReplan && (
                  <p className="text-xs text-muted-foreground">
                    {t('validationFromPast')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="targetHours">{t('fieldTargetHours')}</Label>
                  <Input
                    id="targetHours"
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.targetHours}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, targetHours: e.target.value }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetTravelMinutes">{t('fieldTargetTravelMinutes')}</Label>
                  <Input
                    id="targetTravelMinutes"
                    type="number"
                    min="0"
                    step="1"
                    value={form.targetTravelMinutes}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, targetTravelMinutes: e.target.value }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="targetMaterialCost">{t('fieldTargetMaterialCost')}</Label>
                  <Input
                    id="targetMaterialCost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.targetMaterialCost}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, targetMaterialCost: e.target.value }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetExternalCost">{t('fieldTargetExternalCost')}</Label>
                  <Input
                    id="targetExternalCost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.targetExternalCost}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, targetExternalCost: e.target.value }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetRevenue">{t('fieldTargetRevenue')}</Label>
                <Input
                  id="targetRevenue"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.targetRevenue}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, targetRevenue: e.target.value }))
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Unit items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('fieldUnitItems')}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddUnitItem}
                  disabled={isSubmitting}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {t('addUnitItem')}
                </Button>
              </div>
              {form.unitItems.length > 0 && (
                <div className="space-y-2 rounded-lg border p-3">
                  {form.unitItems.map((item) => {
                    const selected = perUnitActivities.find((a) => a.id === item.activityId)
                    const unit = (selected as { unit?: string | null } | undefined)?.unit ?? ''
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        <Select
                          value={item.activityId || ''}
                          onValueChange={(value) => handleUpdateUnitItem(item.id, 'activityId', value)}
                          disabled={isSubmitting}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={t('selectActivity')} />
                          </SelectTrigger>
                          <SelectContent>
                            {perUnitActivities.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.code} - {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="w-24"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => handleUpdateUnitItem(item.id, 'quantity', e.target.value)}
                          disabled={isSubmitting}
                          placeholder={t('fieldQuantity')}
                        />
                        {unit && (
                          <span className="w-12 text-xs text-muted-foreground">{unit}</span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemoveUnitItem(item.id)}
                          disabled={isSubmitting}
                          aria-label={t('removeUnitItem')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Reason / notes */}
            {isReplan && (
              <div className="space-y-2">
                <Label htmlFor="changeReason">{t('fieldChangeReason')}</Label>
                <Input
                  id="changeReason"
                  value={form.changeReason}
                  onChange={(e) => setForm((prev) => ({ ...prev, changeReason: e.target.value }))}
                  disabled={isSubmitting}
                  maxLength={50}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">{t('fieldNotes')}</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                disabled={isSubmitting}
                rows={3}
                maxLength={2000}
              />
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
            {isSubmitting ? t('saving') : t('save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
