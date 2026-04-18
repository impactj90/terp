'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useAdjustBillingPrices, useBillingPriceListEntries } from '@/hooks'
import { useTranslations } from 'next-intl'

interface PriceListBulkAdjustDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  priceListId: string
}

export function PriceListBulkAdjustDialog({
  open,
  onOpenChange,
  priceListId,
}: PriceListBulkAdjustDialogProps) {
  const t = useTranslations('billingPriceLists')
  const adjustPrices = useAdjustBillingPrices()
  const { data: entries } = useBillingPriceListEntries(priceListId, undefined, open)

  const [percent, setPercent] = React.useState('0')

  const entryCount = entries?.length ?? 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedPercent = parseFloat(percent)
    if (isNaN(parsedPercent)) {
      toast.error(t('invalidPercent'))
      return
    }

    adjustPrices.mutate(
      { priceListId, adjustmentPercent: parsedPercent },
      {
        onSuccess: (result) => {
          toast.success(`${t('pricesAdjusted')}: ${result?.adjustedCount ?? 0} ${t('affectedEntries')}`)
          onOpenChange(false)
          setPercent('0')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('adjustPrices')}</DialogTitle>
          <DialogDescription>{t('adjustPricesDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="adjustPercent">{t('adjustmentPercent')}</Label>
            <Input
              id="adjustPercent"
              type="number"
              step="0.1"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder={t('adjustPercentPlaceholder')}
              className="mt-1"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('affectedEntriesCount', { count: entryCount })}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={adjustPrices.isPending || entryCount === 0}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
