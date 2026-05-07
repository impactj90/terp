'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Edit, Trash2, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useWageGroup } from '@/hooks/use-wage-groups'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WageGroup = any

interface WageGroupDetailSheetProps {
  wageGroupId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (wageGroup: WageGroup) => void
  onDelete: (wageGroup: WageGroup) => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

function formatRate(rate: number | null | undefined): string {
  if (rate == null) return '-'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(rate)
}

export function WageGroupDetailSheet({
  wageGroupId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: WageGroupDetailSheetProps) {
  const t = useTranslations('adminWageGroups')
  const { data: wageGroup, isLoading } = useWageGroup(wageGroupId || '', open && !!wageGroupId)

  const formatDate = (date: string | undefined | null | Date) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('wageGroupDetails')}</SheetTitle>
          <SheetDescription>{t('viewWageGroupInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : wageGroup ? (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Header with icon and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Users className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{wageGroup.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{wageGroup.code}</p>
                </div>
                <Badge variant={wageGroup.isActive ? 'default' : 'secondary'}>
                  {wageGroup.isActive ? t('statusActive') : t('statusInactive')}
                </Badge>
              </div>

              {/* Pricing */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionPricing')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldInternalHourlyRate')} value={formatRate(wageGroup.internalHourlyRate)} />
                  <DetailRow label={t('fieldBillingHourlyRate')} value={formatRate(wageGroup.billingHourlyRate)} />
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('detailsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldCode')} value={wageGroup.code} />
                  <DetailRow label={t('fieldName')} value={wageGroup.name} />
                  <DetailRow label={t('fieldSortOrder')} value={String(wageGroup.sortOrder ?? 0)} />
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('timestampsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDate(wageGroup.createdAt)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDate(wageGroup.updatedAt)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {wageGroup && (
            <>
              <Button variant="outline" onClick={() => onEdit(wageGroup)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => onDelete(wageGroup)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('delete')}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
