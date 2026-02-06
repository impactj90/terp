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
  useCreateCalculationRule,
  useUpdateCalculationRule,
  useAccounts,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type CalculationRule = components['schemas']['CalculationRule']

interface CalculationRuleFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: CalculationRule | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  value: number
  factor: number
  accountId: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  value: 0,
  factor: 1.0,
  accountId: '',
  isActive: true,
}

const ACCOUNT_NONE_VALUE = '__none__'

export function CalculationRuleFormSheet({
  open,
  onOpenChange,
  rule,
  onSuccess,
}: CalculationRuleFormSheetProps) {
  const t = useTranslations('adminCalculationRules')
  const isEdit = !!rule
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateCalculationRule()
  const updateMutation = useUpdateCalculationRule()
  const { data: accountsData } = useAccounts({ active: true, enabled: open })
  const accounts = accountsData?.data ?? []

  React.useEffect(() => {
    if (!open) return

    if (rule) {
      setForm({
        code: rule.code || '',
        name: rule.name || '',
        description: rule.description || '',
        value: rule.value ?? 0,
        factor: rule.factor ?? 1.0,
        accountId: rule.account_id || '',
        isActive: rule.is_active ?? true,
      })
    } else {
      setForm(INITIAL_STATE)
    }
    setError(null)
  }, [open, rule])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.code.trim()) errors.push(t('validationCodeRequired'))
    else if (form.code.trim().length > 50) errors.push(t('validationCodeMaxLength'))
    if (!form.name.trim()) errors.push(t('validationNameRequired'))
    if (form.value < 0 || !Number.isFinite(form.value)) errors.push(t('validationValueRequired'))
    if (form.factor <= 0 || !Number.isFinite(form.factor)) errors.push(t('validationFactorRequired'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && rule) {
        await updateMutation.mutateAsync({
          path: { id: rule.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            value: form.value,
            factor: form.factor,
            account_id: form.accountId || null,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            value: form.value,
            factor: form.factor,
            account_id: form.accountId || undefined,
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
          <SheetTitle>{isEdit ? t('editRule') : t('newRule')}</SheetTitle>
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

            {/* Calculation Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionCalculation')}</h3>

              <div className="space-y-2">
                <Label htmlFor="value">{t('fieldValue')} *</Label>
                <Input
                  id="value"
                  type="number"
                  value={form.value}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, value: parseInt(e.target.value) || 0 }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('valuePlaceholder')}
                  min={0}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">{t('valueHint')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="factor">{t('fieldFactor')} *</Label>
                <Input
                  id="factor"
                  type="number"
                  value={form.factor}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, factor: parseFloat(e.target.value) || 0 }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('factorPlaceholder')}
                  min={0.01}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">{t('factorHint')}</p>
              </div>
            </div>

            {/* Account Assignment */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionAccount')}</h3>

              <div className="space-y-2">
                <Label htmlFor="accountId">{t('fieldAccount')}</Label>
                <Select
                  value={form.accountId || ACCOUNT_NONE_VALUE}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, accountId: value === ACCOUNT_NONE_VALUE ? '' : value }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="accountId">
                    <SelectValue placeholder={t('accountPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ACCOUNT_NONE_VALUE}>{t('accountNone')}</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
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
