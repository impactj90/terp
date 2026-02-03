'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { Edit, Ban, CalendarOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface AbsenceDetailSheetProps {
  absence: Absence | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (absence: Absence) => void
  onCancel: (absence: Absence) => void
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

const STATUS_BADGE_CONFIG: Record<
  string,
  {
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
    labelKey: string
  }
> = {
  pending: { variant: 'secondary', labelKey: 'statusPending' },
  approved: { variant: 'default', labelKey: 'statusApproved' },
  rejected: { variant: 'destructive', labelKey: 'statusRejected' },
  cancelled: { variant: 'outline', labelKey: 'statusCancelled' },
}

export function AbsenceDetailSheet({
  absence,
  open,
  onOpenChange,
  onEdit,
  onCancel,
}: AbsenceDetailSheetProps) {
  const t = useTranslations('absences')
  const tc = useTranslations('common')
  const locale = useLocale()

  const status = absence?.status ?? 'pending'
  const canEdit = status === 'pending' || status === 'approved'
  const canCancel = status === 'pending' || status === 'approved'

  const statusConfig = STATUS_BADGE_CONFIG[status] ?? {
    variant: 'secondary' as const,
    labelKey: status,
  }

  const formatDateTime = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  const formattedDate = absence
    ? parseISODate(absence.absence_date).toLocaleDateString(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('absenceDetails')}</SheetTitle>
          <SheetDescription>{t('viewAbsenceInfo')}</SheetDescription>
        </SheetHeader>

        {absence ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with type color, name, and status */}
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg border"
                  style={{
                    backgroundColor:
                      absence.absence_type?.color || '#808080',
                  }}
                >
                  <CalendarOff className="h-6 w-6 text-white drop-shadow" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">
                    {absence.absence_type?.name ?? t('unknownType')}
                  </h3>
                </div>
                <Badge variant={statusConfig.variant}>
                  {t(statusConfig.labelKey as Parameters<typeof t>[0])}
                </Badge>
              </div>

              {/* Rejection reason alert */}
              {status === 'rejected' && absence.rejection_reason && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <span className="font-medium">
                      {t('rejectionReasonLabel')}:
                    </span>{' '}
                    {absence.rejection_reason}
                  </AlertDescription>
                </Alert>
              )}

              {/* Cancellation info */}
              {status === 'cancelled' && (
                <Alert>
                  <Ban className="h-4 w-4" />
                  <AlertDescription>{t('absenceCancelled')}</AlertDescription>
                </Alert>
              )}

              {/* Details section */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {tc('details')}
                </h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('dateLabel')} value={formattedDate} />
                  <DetailRow
                    label={t('duration')}
                    value={
                      <Badge variant="outline">
                        {absence.duration === 0.5
                          ? t('halfDay')
                          : t('fullDay')}
                      </Badge>
                    }
                  />
                  <DetailRow
                    label={t('statusLabel')}
                    value={
                      <Badge variant={statusConfig.variant}>
                        {t(
                          statusConfig.labelKey as Parameters<typeof t>[0]
                        )}
                      </Badge>
                    }
                  />
                  <DetailRow
                    label={t('notesLabel')}
                    value={absence.notes || '-'}
                  />
                </div>
              </div>

              {/* Timestamps section */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('timestampsSection')}
                </h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('labelCreated')}
                    value={formatDateTime(absence.created_at)}
                  />
                  <DetailRow
                    label={t('labelLastUpdated')}
                    value={formatDateTime(absence.updated_at)}
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            {tc('close')}
          </Button>
          {absence && (
            <>
              {canEdit && (
                <Button
                  variant="outline"
                  onClick={() => onEdit(absence)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {tc('edit')}
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="destructive"
                  onClick={() => onCancel(absence)}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  {t('cancelAbsence')}
                </Button>
              )}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
