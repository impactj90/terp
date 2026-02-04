'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  useCreateVacationBalance,
  useUpdateVacationBalance,
  useEmployees,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type VacationBalance = components['schemas']['VacationBalance']

interface VacationBalanceFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  balance?: VacationBalance | null
  onSuccess?: () => void
}

interface FormState {
  employeeId: string
  year: number
  baseEntitlement: string
  additionalEntitlement: string
  carryoverFromPrevious: string
  manualAdjustment: string
  carryoverToNext: string
  carryoverExpiresAt: string
}

const INITIAL_STATE: FormState = {
  employeeId: '',
  year: new Date().getFullYear(),
  baseEntitlement: '0',
  additionalEntitlement: '0',
  carryoverFromPrevious: '0',
  manualAdjustment: '0',
  carryoverToNext: '',
  carryoverExpiresAt: '',
}

export function VacationBalanceFormSheet({
  open,
  onOpenChange,
  balance,
  onSuccess,
}: VacationBalanceFormSheetProps) {
  const t = useTranslations('adminVacationBalances')
  const tCommon = useTranslations('common')
  const isEdit = !!balance

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateVacationBalance()
  const updateMutation = useUpdateVacationBalance()

  const { data: employeesData } = useEmployees({ limit: 200, active: true, enabled: open })
  const employees = employeesData?.data ?? []

  // Reset form when opening/closing or balance changes
  React.useEffect(() => {
    if (!open) return

    if (balance) {
      setForm({
        employeeId: balance.employee_id,
        year: balance.year,
        baseEntitlement: String(balance.base_entitlement ?? 0),
        additionalEntitlement: String(balance.additional_entitlement ?? 0),
        carryoverFromPrevious: String(balance.carryover_from_previous ?? 0),
        manualAdjustment: String(balance.manual_adjustment ?? 0),
        carryoverToNext: String(balance.carryover_to_next ?? ''),
        carryoverExpiresAt: balance.carryover_expires_at ?? '',
      })
    } else {
      setForm(INITIAL_STATE)
    }

    setError(null)
  }, [open, balance])

  const totalPreview =
    parseFloat(form.baseEntitlement || '0') +
    parseFloat(form.additionalEntitlement || '0') +
    parseFloat(form.carryoverFromPrevious || '0') +
    parseFloat(form.manualAdjustment || '0')

  const handleSubmit = async () => {
    setError(null)

    if (!isEdit && !form.employeeId) {
      setError(t('failedCreate'))
      return
    }

    try {
      if (isEdit && balance) {
        await updateMutation.mutateAsync({
          path: { id: balance.id },
          body: {
            base_entitlement: parseFloat(form.baseEntitlement || '0'),
            additional_entitlement: parseFloat(form.additionalEntitlement || '0'),
            carryover_from_previous: parseFloat(form.carryoverFromPrevious || '0'),
            manual_adjustment: parseFloat(form.manualAdjustment || '0'),
            carryover_to_next: form.carryoverToNext ? parseFloat(form.carryoverToNext) : undefined,
            carryover_expires_at: form.carryoverExpiresAt || undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            employee_id: form.employeeId,
            year: form.year,
            base_entitlement: parseFloat(form.baseEntitlement || '0'),
            additional_entitlement: parseFloat(form.additionalEntitlement || '0'),
            carryover_from_previous: parseFloat(form.carryoverFromPrevious || '0'),
            manual_adjustment: parseFloat(form.manualAdjustment || '0'),
            carryover_expires_at: form.carryoverExpiresAt || undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string; status?: number }
      if (apiError.status === 409 || apiError.detail?.includes('already exists')) {
        setError(t('errorDuplicate'))
      } else {
        setError(
          apiError.detail ?? apiError.message ?? (isEdit ? t('failedUpdate') : t('failedCreate'))
        )
      }
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex h-full flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editBalance') : t('newBalance')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Employee */}
            <div className="space-y-2">
              <Label>{t('fieldEmployee')} {!isEdit && '*'}</Label>
              <Select
                value={form.employeeId || '__none__'}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    employeeId: value === '__none__' ? '' : value,
                  }))
                }
                disabled={isSubmitting || isEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectEmployee')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('selectEmployee')}</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.personnel_number} - {emp.first_name} {emp.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year */}
            <div className="space-y-2">
              <Label htmlFor="year">{t('fieldYear')} {!isEdit && '*'}</Label>
              <Input
                id="year"
                type="number"
                value={form.year}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, year: parseInt(e.target.value) || new Date().getFullYear() }))
                }
                disabled={isSubmitting || isEdit}
              />
            </div>

            {/* Base Entitlement */}
            <div className="space-y-2">
              <Label htmlFor="baseEntitlement">{t('fieldBaseEntitlement')} *</Label>
              <Input
                id="baseEntitlement"
                type="number"
                step="0.5"
                value={form.baseEntitlement}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, baseEntitlement: e.target.value }))
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Additional Entitlement */}
            <div className="space-y-2">
              <Label htmlFor="additionalEntitlement">{t('fieldAdditionalEntitlement')}</Label>
              <Input
                id="additionalEntitlement"
                type="number"
                step="0.5"
                value={form.additionalEntitlement}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, additionalEntitlement: e.target.value }))
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Carryover from Previous Year */}
            <div className="space-y-2">
              <Label htmlFor="carryoverFromPrevious">{t('fieldCarryoverFromPrevious')}</Label>
              <Input
                id="carryoverFromPrevious"
                type="number"
                step="0.5"
                value={form.carryoverFromPrevious}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, carryoverFromPrevious: e.target.value }))
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Manual Adjustment */}
            <div className="space-y-2">
              <Label htmlFor="manualAdjustment">{t('fieldManualAdjustment')}</Label>
              <Input
                id="manualAdjustment"
                type="number"
                step="0.5"
                value={form.manualAdjustment}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, manualAdjustment: e.target.value }))
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Carryover to Next Year (edit only) */}
            {isEdit && (
              <div className="space-y-2">
                <Label htmlFor="carryoverToNext">{t('fieldCarryoverToNext')}</Label>
                <Input
                  id="carryoverToNext"
                  type="number"
                  step="0.5"
                  value={form.carryoverToNext}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, carryoverToNext: e.target.value }))
                  }
                  disabled={isSubmitting}
                />
              </div>
            )}

            {/* Carryover Expires At */}
            <div className="space-y-2">
              <Label htmlFor="carryoverExpiresAt">{t('fieldCarryoverExpiresAt')}</Label>
              <Input
                id="carryoverExpiresAt"
                type="date"
                value={form.carryoverExpiresAt ? form.carryoverExpiresAt.split('T')[0] : ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, carryoverExpiresAt: e.target.value }))
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Total Entitlement Preview */}
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('totalEntitlementPreview')}</span>
                <span className="font-medium">{totalPreview.toFixed(1)}</span>
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('createBalance')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
