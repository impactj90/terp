'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { Edit, Trash2, Star, FileText } from 'lucide-react'
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
import {
  useMonthlyEvaluation,
} from '@/hooks/api/use-monthly-evaluations'
import { formatDuration } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type MonthlyEvaluation = components['schemas']['MonthlyEvaluation']

interface MonthlyEvaluationDetailSheetProps {
  itemId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: MonthlyEvaluation) => void
  onSetDefault: (item: MonthlyEvaluation) => void
  onDelete: (item: MonthlyEvaluation) => void
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

export function MonthlyEvaluationDetailSheet({
  itemId,
  open,
  onOpenChange,
  onEdit,
  onSetDefault,
  onDelete,
}: MonthlyEvaluationDetailSheetProps) {
  const t = useTranslations('adminMonthlyEvaluations')
  const { data: item, isLoading } = useMonthlyEvaluation(itemId || '', open && !!itemId)

  const formatDateTime = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  const formatMinuteValue = (value: number | undefined | null): string => {
    if (value === undefined || value === null || value === 0) return '-'
    return `${formatDuration(value)} (${value} min)`
  }

  const formatCarryoverValue = (value: number | undefined | null): string => {
    if (value === undefined || value === null) return '-'
    return t('labelDays', { value: String(value) })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>{t('templateDetails')}</SheetTitle>
          <SheetDescription>{t('viewTemplateInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-12 w-12" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : item ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon, name, and badges */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-6 w-6 text-foreground/70" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{item.name}</h3>
                  {item.description && (
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {item.is_default && (
                    <Badge variant="outline" className="border-amber-500 text-amber-600">
                      <Star className="mr-1 h-3 w-3 fill-amber-500" />
                      {t('defaultBadge')}
                    </Badge>
                  )}
                  <Badge variant={item.is_active ? 'default' : 'secondary'}>
                    {item.is_active ? t('statusActive') : t('statusInactive')}
                  </Badge>
                </div>
              </div>

              {/* Basic Information */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldName')} value={item.name} />
                  <DetailRow label={t('fieldDescription')} value={item.description} />
                </div>
              </div>

              {/* Time Configuration */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionTimeConfig')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('fieldFlextimePositive')}
                    value={formatMinuteValue(item.flextime_cap_positive)}
                  />
                  <DetailRow
                    label={t('fieldFlextimeNegative')}
                    value={formatMinuteValue(item.flextime_cap_negative)}
                  />
                  <DetailRow
                    label={t('fieldOvertimeThreshold')}
                    value={formatMinuteValue(item.overtime_threshold)}
                  />
                </div>
              </div>

              {/* Vacation Configuration */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionVacationConfig')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('fieldMaxCarryover')}
                    value={formatCarryoverValue(item.max_carryover_vacation)}
                  />
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionSettings')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('fieldIsDefault')}
                    value={item.is_default ? t('labelYes') : t('labelNo')}
                  />
                  <DetailRow
                    label={t('fieldIsActive')}
                    value={
                      <Badge variant={item.is_active ? 'default' : 'secondary'}>
                        {item.is_active ? t('statusActive') : t('statusInactive')}
                      </Badge>
                    }
                  />
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionTimestamps')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDateTime(item.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDateTime(item.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {item && (
            <>
              {!item.is_default && item.is_active && (
                <Button variant="outline" onClick={() => onSetDefault(item)}>
                  <Star className="mr-2 h-4 w-4" />
                  {t('setDefault')}
                </Button>
              )}
              <Button variant="outline" onClick={() => onEdit(item)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              <Button variant="destructive" onClick={() => onDelete(item)}>
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
