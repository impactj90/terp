'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Edit, Trash2, Briefcase } from 'lucide-react'
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
import { useEmploymentType } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type EmploymentType = components['schemas']['EmploymentType']

interface EmploymentTypeDetailSheetProps {
  employmentTypeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (employmentType: EmploymentType) => void
  onDelete: (employmentType: EmploymentType) => void
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

export function EmploymentTypeDetailSheet({
  employmentTypeId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: EmploymentTypeDetailSheetProps) {
  const t = useTranslations('adminEmploymentTypes')
  const { data: employmentType, isLoading } = useEmploymentType(employmentTypeId || '', open && !!employmentTypeId)

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('employmentTypeDetails')}</SheetTitle>
          <SheetDescription>{t('viewEmploymentTypeInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : employmentType ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Briefcase className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{employmentType.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{employmentType.code}</p>
                </div>
                <Badge variant={employmentType.is_active ? 'default' : 'secondary'}>
                  {employmentType.is_active ? t('statusActive') : t('statusInactive')}
                </Badge>
              </div>

              {/* Description */}
              {employmentType.description && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('fieldDescription')}</h4>
                  <p className="text-sm">{employmentType.description}</p>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('detailsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldCode')} value={employmentType.code} />
                  <DetailRow label={t('fieldName')} value={employmentType.name} />
                </div>
              </div>

              {/* Configuration */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionConfiguration')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('fieldDefaultWeeklyHours')}
                    value={
                      employmentType.default_weekly_hours != null
                        ? `${Number(employmentType.default_weekly_hours).toFixed(2)} ${t('hrsPerWeek')}`
                        : '-'
                    }
                  />
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('timestampsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDate(employmentType.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDate(employmentType.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {employmentType && (
            <>
              <Button variant="outline" onClick={() => onEdit(employmentType)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => onDelete(employmentType)}
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
