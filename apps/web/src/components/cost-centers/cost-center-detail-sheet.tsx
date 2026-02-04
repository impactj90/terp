'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Edit, Trash2, Landmark } from 'lucide-react'
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
import { useCostCenter } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type CostCenter = components['schemas']['CostCenter']

interface CostCenterDetailSheetProps {
  costCenterId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (costCenter: CostCenter) => void
  onDelete: (costCenter: CostCenter) => void
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

export function CostCenterDetailSheet({
  costCenterId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: CostCenterDetailSheetProps) {
  const t = useTranslations('adminCostCenters')
  const { data: costCenter, isLoading } = useCostCenter(costCenterId || '', open && !!costCenterId)

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('costCenterDetails')}</SheetTitle>
          <SheetDescription>{t('viewCostCenterInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : costCenter ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Landmark className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{costCenter.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{costCenter.code}</p>
                </div>
                <Badge variant={costCenter.is_active ? 'default' : 'secondary'}>
                  {costCenter.is_active ? t('statusActive') : t('statusInactive')}
                </Badge>
              </div>

              {/* Description */}
              {costCenter.description && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('fieldDescription')}</h4>
                  <p className="text-sm">{costCenter.description}</p>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('detailsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldCode')} value={costCenter.code} />
                  <DetailRow label={t('fieldName')} value={costCenter.name} />
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('timestampsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDate(costCenter.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDate(costCenter.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {costCenter && (
            <>
              <Button variant="outline" onClick={() => onEdit(costCenter)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => onDelete(costCenter)}
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
