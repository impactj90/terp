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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useCopyBillingPriceList, useBillingPriceLists } from '@/hooks'
import { useTranslations } from 'next-intl'

interface PriceListCopyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceId: string
  sourceName: string
}

export function PriceListCopyDialog({
  open,
  onOpenChange,
  sourceId,
  sourceName,
}: PriceListCopyDialogProps) {
  const t = useTranslations('billingPriceLists')
  const copyPriceList = useCopyBillingPriceList()
  const { data: priceListsData } = useBillingPriceLists({
    type: 'sales',
    isActive: true,
    pageSize: 100,
    enabled: open,
  })

  const [targetId, setTargetId] = React.useState('')
  const [overwrite, setOverwrite] = React.useState(false)

  const targets = (priceListsData?.items ?? []).filter((pl) => pl.id !== sourceId)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!targetId) {
      toast.error(t('selectTargetPriceList'))
      return
    }

    copyPriceList.mutate(
      { sourceId, targetId, overwrite },
      {
        onSuccess: (result) => {
          toast.success(
            `${t('pricesCopied')}: ${result?.copied ?? 0} ${t('copied')}, ${result?.skipped ?? 0} ${t('skipped')}`
          )
          onOpenChange(false)
          setTargetId('')
          setOverwrite(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('copyPriceList')}</DialogTitle>
          <DialogDescription>{t('copyPriceListDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>{t('copyFrom')}</Label>
            <div className="mt-1 px-3 py-2 text-sm border rounded-md bg-muted">
              {sourceName}
            </div>
          </div>
          <div>
            <Label>{t('copyTo')}</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={t('selectTargetPriceList')} />
              </SelectTrigger>
              <SelectContent>
                {targets.map((pl) => (
                  <SelectItem key={pl.id} value={pl.id}>
                    {pl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="overwrite"
              checked={overwrite}
              onCheckedChange={setOverwrite}
            />
            <Label htmlFor="overwrite" className="text-sm">
              {t('overwriteExisting')}
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={copyPriceList.isPending || !targetId}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
