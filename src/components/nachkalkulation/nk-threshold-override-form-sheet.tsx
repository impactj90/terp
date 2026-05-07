'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
import { useUpsertNkThresholdOverride } from '@/hooks/use-nk-thresholds'
import { useOrderTypes } from '@/hooks/use-order-types'

interface ThresholdOverride {
  id: string
  orderTypeId: string
  marginAmberFromPercent: number
  marginRedFromPercent: number
  productivityAmberFromPercent: number
  productivityRedFromPercent: number
}

interface NkThresholdOverrideFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  override?: ThresholdOverride | null
  onSuccess?: () => void
}

interface FormState {
  orderTypeId: string
  marginAmberFromPercent: string
  marginRedFromPercent: string
  productivityAmberFromPercent: string
  productivityRedFromPercent: string
}

const INITIAL_STATE: FormState = {
  orderTypeId: '',
  marginAmberFromPercent: '5',
  marginRedFromPercent: '0',
  productivityAmberFromPercent: '70',
  productivityRedFromPercent: '50',
}

export function NkThresholdOverrideFormSheet({
  open,
  onOpenChange,
  override,
  onSuccess,
}: NkThresholdOverrideFormSheetProps) {
  const t = useTranslations('adminSettingsNachkalkulation')
  const isEdit = !!override
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const upsertMutation = useUpsertNkThresholdOverride()
  const { data: orderTypesData } = useOrderTypes({ enabled: open, isActive: true })
  const orderTypes = orderTypesData?.data ?? []

  React.useEffect(() => {
    if (open) {
      if (override) {
        setForm({
          orderTypeId: override.orderTypeId,
          marginAmberFromPercent: String(override.marginAmberFromPercent),
          marginRedFromPercent: String(override.marginRedFromPercent),
          productivityAmberFromPercent: String(override.productivityAmberFromPercent),
          productivityRedFromPercent: String(override.productivityRedFromPercent),
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, override])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.orderTypeId) {
      errors.push(t('validationOrderTypeRequired'))
    }

    const ma = Number(formData.marginAmberFromPercent)
    const mr = Number(formData.marginRedFromPercent)
    const pa = Number(formData.productivityAmberFromPercent)
    const pr = Number(formData.productivityRedFromPercent)

    if (
      Number.isNaN(ma) ||
      Number.isNaN(mr) ||
      Number.isNaN(pa) ||
      Number.isNaN(pr)
    ) {
      errors.push(t('validationNumberRequired'))
    } else {
      if (ma <= mr) {
        errors.push(t('validationMarginAmberGreaterRed'))
      }
      if (pa <= pr) {
        errors.push(t('validationProductivityAmberGreaterRed'))
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

    try {
      await upsertMutation.mutateAsync({
        orderTypeId: form.orderTypeId,
        marginAmberFromPercent: Number(form.marginAmberFromPercent),
        marginRedFromPercent: Number(form.marginRedFromPercent),
        productivityAmberFromPercent: Number(form.productivityAmberFromPercent),
        productivityRedFromPercent: Number(form.productivityRedFromPercent),
      })
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('failedOverride'))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? t('editOverrideTitle') : t('newOverrideTitle')}
          </SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="orderType">{t('fieldOrderType')} *</Label>
              <Select
                value={form.orderTypeId}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, orderTypeId: value }))
                }
                disabled={upsertMutation.isPending || isEdit}
              >
                <SelectTrigger id="orderType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orderTypes.map((ot) => (
                    <SelectItem key={ot.id} value={ot.id}>
                      {ot.code} - {ot.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('fieldMarginAmber')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="marginAmber">{t('fieldMarginAmber')}</Label>
                  <Input
                    id="marginAmber"
                    type="number"
                    step="0.1"
                    value={form.marginAmberFromPercent}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        marginAmberFromPercent: e.target.value,
                      }))
                    }
                    disabled={upsertMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marginRed">{t('fieldMarginRed')}</Label>
                  <Input
                    id="marginRed"
                    type="number"
                    step="0.1"
                    value={form.marginRedFromPercent}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        marginRedFromPercent: e.target.value,
                      }))
                    }
                    disabled={upsertMutation.isPending}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('marginHint')}</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('fieldProductivityAmber')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productivityAmber">
                    {t('fieldProductivityAmber')}
                  </Label>
                  <Input
                    id="productivityAmber"
                    type="number"
                    step="0.1"
                    value={form.productivityAmberFromPercent}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        productivityAmberFromPercent: e.target.value,
                      }))
                    }
                    disabled={upsertMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productivityRed">
                    {t('fieldProductivityRed')}
                  </Label>
                  <Input
                    id="productivityRed"
                    type="number"
                    step="0.1"
                    value={form.productivityRedFromPercent}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        productivityRedFromPercent: e.target.value,
                      }))
                    }
                    disabled={upsertMutation.isPending}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('productivityHint')}</p>
            </div>

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
            disabled={upsertMutation.isPending}
            className="flex-1"
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={upsertMutation.isPending} className="flex-1">
            {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {upsertMutation.isPending ? t('saving') : t('saveOverride')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
