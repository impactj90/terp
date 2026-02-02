'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, AlertCircle } from 'lucide-react'
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
import { useCreateAccount, useUpdateAccount } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Account = components['schemas']['Account']

interface AccountFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  accountType: string
  unit: string
  yearCarryover: boolean
  isPayrollRelevant: boolean
  payrollCode: string
  sortOrder: number
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  accountType: 'tracking',
  unit: 'minutes',
  yearCarryover: true,
  isPayrollRelevant: false,
  payrollCode: '',
  sortOrder: 0,
  isActive: true,
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'bonus', labelKey: 'typeBonus' },
  { value: 'tracking', labelKey: 'typeTracking' },
  { value: 'balance', labelKey: 'typeBalance' },
] as const

const UNIT_OPTIONS = [
  { value: 'minutes', labelKey: 'unitMinutes' },
  { value: 'hours', labelKey: 'unitHours' },
  { value: 'days', labelKey: 'unitDays' },
] as const

export function AccountFormSheet({
  open,
  onOpenChange,
  account,
  onSuccess,
}: AccountFormSheetProps) {
  const t = useTranslations('adminAccounts')
  const isEdit = !!account
  const isSystem = account?.is_system ?? false
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Mutations
  const createMutation = useCreateAccount()
  const updateMutation = useUpdateAccount()

  // Reset form when opening/closing or account changes
  React.useEffect(() => {
    if (open) {
      if (account) {
        setForm({
          code: account.code || '',
          name: account.name || '',
          description: account.description || '',
          accountType: account.account_type || 'tracking',
          unit: (account as Record<string, unknown>).unit as string || 'minutes',
          yearCarryover: (account as Record<string, unknown>).year_carryover as boolean ?? true,
          isPayrollRelevant: account.is_payroll_relevant ?? false,
          payrollCode: account.payroll_code || '',
          sortOrder: account.sort_order ?? 0,
          isActive: account.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, account])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.code.trim()) errors.push(t('validationCodeRequired'))
    else if (form.code.length > 20) errors.push(t('validationCodeMaxLength'))
    if (!form.name.trim()) errors.push(t('validationNameRequired'))
    else if (form.name.length > 255) errors.push(t('validationNameMaxLength'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && account) {
        await updateMutation.mutateAsync({
          path: { id: account.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            is_payroll_relevant: form.isPayrollRelevant,
            payroll_code: form.payrollCode.trim() || undefined,
            sort_order: form.sortOrder,
            unit: form.unit as 'minutes' | 'hours' | 'days',
            year_carryover: form.yearCarryover,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            account_type: form.accountType as 'bonus' | 'day' | 'month',
            is_payroll_relevant: form.isPayrollRelevant,
            payroll_code: form.payrollCode.trim() || undefined,
            sort_order: form.sortOrder,
            unit: form.unit as 'minutes' | 'hours' | 'days',
            year_carryover: form.yearCarryover,
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
          <SheetTitle>{isEdit ? t('editAccount') : t('newAccount')}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? t('editDescription')
              : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* System account warning */}
            {isSystem && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('systemAccountWarning')}
                </AlertDescription>
              </Alert>
            )}

            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label htmlFor="code">{t('fieldCode')} *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  disabled={isSubmitting || isSystem || isEdit}
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

            {/* Account Type */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionAccountType')}</h3>

              <div className="space-y-2">
                <Label>{t('fieldType')} *</Label>
                <Select
                  value={form.accountType}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, accountType: value }))}
                  disabled={isSubmitting || isEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectAccountType')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey as Parameters<typeof t>[0])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isEdit && (
                  <p className="text-xs text-muted-foreground">
                    {t('typeCannotChange')}
                  </p>
                )}
              </div>
            </div>

            {/* Payroll */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionPayroll')}</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isPayrollRelevant">{t('fieldPayrollRelevant')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('fieldPayrollRelevantDescription')}
                  </p>
                </div>
                <Switch
                  id="isPayrollRelevant"
                  checked={form.isPayrollRelevant}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isPayrollRelevant: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payrollCode">{t('fieldPayrollCode')}</Label>
                <Input
                  id="payrollCode"
                  value={form.payrollCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, payrollCode: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('payrollCodePlaceholder')}
                />
              </div>
            </div>

            {/* Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionConfiguration')}</h3>

              <div className="space-y-2">
                <Label>{t('fieldUnit')}</Label>
                <Select
                  value={form.unit}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, unit: value }))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('fieldUnit')} />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey as Parameters<typeof t>[0])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="yearCarryover">{t('fieldYearCarryover')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('fieldYearCarryoverDescription')}
                  </p>
                </div>
                <Switch
                  id="yearCarryover"
                  checked={form.yearCarryover}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, yearCarryover: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Ordering */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionOrdering')}</h3>

              <div className="space-y-2">
                <Label htmlFor="sortOrder">{t('fieldSortOrder')}</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                  disabled={isSubmitting}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  {t('sortOrderHint')}
                </p>
              </div>
            </div>

            {/* Status (edit only) */}
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
