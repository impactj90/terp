'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useOrderTargetVersions } from '@/hooks/use-order-targets'

interface OrderTargetHistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  return format(new Date(date), 'dd.MM.yyyy')
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value)
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

export function OrderTargetHistorySheet({
  open,
  onOpenChange,
  orderId,
}: OrderTargetHistorySheetProps) {
  const t = useTranslations('nachkalkulation.target')
  const { data, isLoading } = useOrderTargetVersions(orderId, open && !!orderId)

  const versions = (data?.data ?? []) as Array<{
    id: string
    version: number
    validFrom: string | Date
    validTo: string | Date | null
    targetHours: number | null
    targetMaterialCost: number | null
    targetTravelMinutes: number | null
    targetExternalCost: number | null
    targetRevenue: number | null
    changeReason: string | null
    notes: string | null
  }>

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('historyTitle')}</SheetTitle>
          <SheetDescription>{t('historySubtitle')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">-</p>
            ) : (
              versions
                .slice()
                .reverse()
                .map((v) => {
                  const isActive = v.validTo == null
                  return (
                    <div
                      key={v.id}
                      className={`rounded-lg border p-4 ${isActive ? 'border-primary' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">
                          {t('historyVersion', { version: v.version })}
                        </div>
                        {isActive && (
                          <Badge variant="default">{t('historyActive')}</Badge>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">{t('historyValidFrom')}:</span>{' '}
                          <span className="font-medium">{formatDate(v.validFrom)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('historyValidTo')}:</span>{' '}
                          <span className="font-medium">{formatDate(v.validTo)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('fieldTargetHours')}:</span>{' '}
                          <span className="font-medium">{formatNumber(v.targetHours)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t('fieldTargetTravelMinutes')}:
                          </span>{' '}
                          <span className="font-medium">{formatNumber(v.targetTravelMinutes)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t('fieldTargetMaterialCost')}:
                          </span>{' '}
                          <span className="font-medium">{formatCurrency(v.targetMaterialCost)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t('fieldTargetExternalCost')}:
                          </span>{' '}
                          <span className="font-medium">{formatCurrency(v.targetExternalCost)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('fieldTargetRevenue')}:</span>{' '}
                          <span className="font-medium">{formatCurrency(v.targetRevenue)}</span>
                        </div>
                        {v.changeReason && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">{t('historyChangeReason')}:</span>{' '}
                            <span className="font-medium">{v.changeReason}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('cancel')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
