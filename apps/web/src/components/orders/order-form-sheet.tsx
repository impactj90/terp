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
  useCreateOrder,
  useUpdateOrder,
  useCostCenters,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Order = components['schemas']['Order']

interface OrderFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: Order | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  status: 'planned' | 'active' | 'completed' | 'cancelled'
  customer: string
  costCenterId: string
  billingRatePerHour: string
  validFrom: string
  validTo: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  status: 'planned',
  customer: '',
  costCenterId: '',
  billingRatePerHour: '',
  validFrom: '',
  validTo: '',
  isActive: true,
}

export function OrderFormSheet({
  open,
  onOpenChange,
  order,
  onSuccess,
}: OrderFormSheetProps) {
  const t = useTranslations('adminOrders')
  const isEdit = !!order
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateOrder()
  const updateMutation = useUpdateOrder()
  const { data: costCentersData } = useCostCenters({ enabled: open })
  const costCenters = costCentersData?.data ?? []

  React.useEffect(() => {
    if (open) {
      if (order) {
        setForm({
          code: order.code || '',
          name: order.name || '',
          description: order.description || '',
          status: order.status || 'planned',
          customer: order.customer || '',
          costCenterId: order.cost_center_id || '',
          billingRatePerHour: order.billing_rate_per_hour?.toString() || '',
          validFrom: order.valid_from?.split('T')[0] || '',
          validTo: order.valid_to?.split('T')[0] || '',
          isActive: order.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, order])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.code.trim()) {
      errors.push(t('validationCodeRequired'))
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
      if (isEdit && order) {
        await updateMutation.mutateAsync({
          path: { id: order.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            status: form.status,
            customer: form.customer.trim() || undefined,
            cost_center_id: form.costCenterId || undefined,
            billing_rate_per_hour: form.billingRatePerHour ? parseFloat(form.billingRatePerHour) : undefined,
            valid_from: form.validFrom || undefined,
            valid_to: form.validTo || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            status: form.status,
            customer: form.customer.trim() || undefined,
            cost_center_id: form.costCenterId || undefined,
            billing_rate_per_hour: form.billingRatePerHour ? parseFloat(form.billingRatePerHour) : undefined,
            valid_from: form.validFrom || undefined,
            valid_to: form.validTo || undefined,
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
          <SheetTitle>{isEdit ? t('editOrder') : t('newOrder')}</SheetTitle>
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

              <div className="space-y-2">
                <Label htmlFor="status">{t('fieldStatus')}</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, status: value as FormState['status'] }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">{t('statusPlanned')}</SelectItem>
                    <SelectItem value="active">{t('statusActive')}</SelectItem>
                    <SelectItem value="completed">{t('statusCompleted')}</SelectItem>
                    <SelectItem value="cancelled">{t('statusCancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer">{t('fieldCustomer')}</Label>
                <Input
                  id="customer"
                  value={form.customer}
                  onChange={(e) => setForm((prev) => ({ ...prev, customer: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('customerPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="costCenter">{t('fieldCostCenter')}</Label>
                <Select
                  value={form.costCenterId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, costCenterId: value === '__none__' ? '' : value }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="costCenter">
                    <SelectValue placeholder={t('costCenterPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('noCostCenter')}</SelectItem>
                    {costCenters.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        {cc.code} - {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Billing */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBilling')}</h3>

              <div className="space-y-2">
                <Label htmlFor="billingRate">{t('fieldBillingRate')}</Label>
                <Input
                  id="billingRate"
                  type="number"
                  step="0.01"
                  value={form.billingRatePerHour}
                  onChange={(e) => setForm((prev) => ({ ...prev, billingRatePerHour: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Validity Period */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionValidity')}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="validFrom">{t('fieldValidFrom')}</Label>
                  <Input
                    id="validFrom"
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validTo">{t('fieldValidTo')}</Label>
                  <Input
                    id="validTo"
                    type="date"
                    value={form.validTo}
                    onChange={(e) => setForm((prev) => ({ ...prev, validTo: e.target.value }))}
                    disabled={isSubmitting}
                  />
                </div>
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
