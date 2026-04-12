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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useAdjustWhPrices, useWhArticleGroups } from '@/hooks'
import { useTranslations } from 'next-intl'

interface PriceBulkAdjustDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  priceListId: string
}

export function PriceBulkAdjustDialog({
  open,
  onOpenChange,
  priceListId,
}: PriceBulkAdjustDialogProps) {
  const t = useTranslations('warehousePrices')
  const adjustPrices = useAdjustWhPrices()
  const { data: groups } = useWhArticleGroups()

  const [percent, setPercent] = React.useState('0')
  const [groupId, setGroupId] = React.useState<string>('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedPercent = parseFloat(percent)
    if (isNaN(parsedPercent)) {
      toast.error(t('invalidPercent'))
      return
    }

    adjustPrices.mutate(
      {
        priceListId,
        adjustmentPercent: parsedPercent,
        articleGroupId: groupId || undefined,
      },
      {
        onSuccess: (result) => {
          toast.success(`${t('pricesAdjusted')}: ${result?.adjustedCount ?? 0} ${t('affectedEntries')}`)
          onOpenChange(false)
          setPercent('0')
          setGroupId('')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  // Flatten group tree for select
  type GroupNode = { group: { id: string; name: string }; children: GroupNode[] }
  function flattenGroups(nodes: GroupNode[], depth = 0): Array<{ id: string; name: string; depth: number }> {
    const result: Array<{ id: string; name: string; depth: number }> = []
    for (const node of nodes) {
      result.push({ id: node.group.id, name: node.group.name, depth })
      result.push(...flattenGroups(node.children, depth + 1))
    }
    return result
  }

  const flatGroups = groups ? flattenGroups(groups as GroupNode[]) : []

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
          <div>
            <Label>{t('filterByGroup')}</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={t('allGroups')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('allGroups')}</SelectItem>
                {flatGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {'  '.repeat(g.depth)}{g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={adjustPrices.isPending}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
