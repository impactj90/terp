'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { Edit, Trash2, CalendarOff, Check, X, Lock } from 'lucide-react'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAbsenceType } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type AbsenceType = components['schemas']['AbsenceType']

interface AbsenceTypeDetailSheetProps {
  absenceTypeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (type: AbsenceType) => void
  onDelete: (type: AbsenceType) => void
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

function BooleanBadge({ value, trueLabel, falseLabel }: { value: boolean | undefined; trueLabel: string; falseLabel: string }) {
  return value ? (
    <Badge variant="default" className="text-xs">
      <Check className="mr-1 h-3 w-3" />
      {trueLabel}
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-xs">
      <X className="mr-1 h-3 w-3" />
      {falseLabel}
    </Badge>
  )
}

const categoryLabelKeys: Record<string, string> = {
  vacation: 'categoryVacation',
  sick: 'categorySick',
  personal: 'categoryPersonal',
  unpaid: 'categoryUnpaid',
  holiday: 'categoryHoliday',
  other: 'categoryOther',
}

export function AbsenceTypeDetailSheet({
  absenceTypeId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: AbsenceTypeDetailSheetProps) {
  const t = useTranslations('adminAbsenceTypes')
  const { data: absenceType, isLoading } = useAbsenceType(absenceTypeId || '', open && !!absenceTypeId)

  const formatDateTime = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  const isSystem = absenceType?.is_system ?? false

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('absenceTypeDetails')}</SheetTitle>
          <SheetDescription>{t('viewAbsenceTypeInfo')}</SheetDescription>
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
        ) : absenceType ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with color, name, and status */}
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg border"
                  style={{ backgroundColor: absenceType.color || '#808080' }}
                >
                  <CalendarOff className="h-6 w-6 text-white drop-shadow" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{absenceType.name}</h3>
                    {isSystem && (
                      <Badge variant="outline" className="text-xs">
                        <Lock className="mr-1 h-3 w-3" />
                        {t('statusSystem')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground font-mono">
                    {absenceType.code}
                  </p>
                </div>
                <Badge variant={absenceType.is_active ? 'default' : 'secondary'}>
                  {absenceType.is_active ? t('statusActive') : t('statusInactive')}
                </Badge>
              </div>

              {/* Description */}
              {absenceType.description && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('fieldDescription')}</h4>
                  <p className="text-sm">{absenceType.description}</p>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('detailsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldCode')} value={<span className="font-mono">{absenceType.code}</span>} />
                  <DetailRow label={t('fieldName')} value={absenceType.name} />
                  <DetailRow label={t('fieldCategory')} value={t(categoryLabelKeys[absenceType.category || 'other'] as Parameters<typeof t>[0])} />
                  <DetailRow
                    label={t('fieldColor')}
                    value={
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 rounded border"
                          style={{ backgroundColor: absenceType.color || '#808080' }}
                        />
                        <span className="font-mono text-xs">{absenceType.color || '#808080'}</span>
                      </div>
                    }
                  />
                </div>
              </div>

              {/* Behavior */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionBehavior')}</h4>
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('fieldPaid')}</span>
                    <BooleanBadge value={absenceType.is_paid} trueLabel={t('paidLabel')} falseLabel={t('unpaidLabel')} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('fieldAffectsVacation')}</span>
                    <BooleanBadge value={absenceType.affects_vacation_balance} trueLabel={t('yes')} falseLabel={t('no')} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('fieldRequiresApproval')}</span>
                    <BooleanBadge value={absenceType.requires_approval} trueLabel={t('requiredLabel')} falseLabel={t('notRequiredLabel')} />
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('timestampsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDateTime(absenceType.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDateTime(absenceType.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {absenceType && (
            <>
              {isSystem ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" disabled>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('edit')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('systemCannotModify')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button variant="outline" onClick={() => onEdit(absenceType)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t('edit')}
                </Button>
              )}
              {isSystem ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="destructive" disabled>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('delete')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('systemCannotDelete')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button variant="destructive" onClick={() => onDelete(absenceType)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('delete')}
                </Button>
              )}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
