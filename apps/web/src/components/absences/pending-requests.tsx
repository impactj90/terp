'use client'

import * as React from 'react'
import { Calendar, Edit, Ban } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeAbsences } from '@/hooks/api'
import { formatDate, parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface PendingRequestsProps {
  /** Employee ID to show absences for */
  employeeId?: string
  /** Callback when an absence is clicked */
  onSelect?: (absence: Absence) => void
  /** Callback when edit is clicked on an absence */
  onEdit?: (absence: Absence) => void
  /** Callback when cancel is clicked on an absence */
  onCancel?: (absence: Absence) => void
  /** Additional className */
  className?: string
}

const STATUS_COLORS: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; labelKey: string }> = {
  pending: { variant: 'secondary', labelKey: 'statusPending' },
  approved: { variant: 'default', labelKey: 'statusApproved' },
  rejected: { variant: 'destructive', labelKey: 'statusRejected' },
  cancelled: { variant: 'outline', labelKey: 'statusCancelled' },
}

function formatAbsenceDate(absence: Absence, locale: string): string {
  const date = parseISODate(absence.absence_date)
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function PendingRequests({
  employeeId,
  onSelect,
  onEdit,
  onCancel,
  className,
}: PendingRequestsProps) {
  const t = useTranslations('absences')
  const locale = useLocale()

  // Fetch absences for current year and next year
  const currentYear = new Date().getFullYear()
  const { data: absencesData, isLoading } = useEmployeeAbsences(
    employeeId ?? '',
    {
      from: formatDate(new Date(currentYear, 0, 1)),
      to: formatDate(new Date(currentYear + 1, 11, 31)),
      enabled: !!employeeId,
    }
  )

  const absences = absencesData?.data ?? []

  // Group absences by status
  const groupedAbsences = React.useMemo(() => {
    const pending: Absence[] = []
    const approved: Absence[] = []
    const rejected: Absence[] = []
    const cancelled: Absence[] = []

    for (const absence of absences) {
      const status = absence.status ?? 'pending'
      if (status === 'pending') {
        pending.push(absence)
      } else if (status === 'approved') {
        approved.push(absence)
      } else if (status === 'rejected') {
        rejected.push(absence)
      } else if (status === 'cancelled') {
        cancelled.push(absence)
      }
    }

    // Sort by date within each group
    const sortByDate = (a: Absence, b: Absence) =>
      a.absence_date.localeCompare(b.absence_date)

    pending.sort(sortByDate)
    approved.sort(sortByDate)
    rejected.sort(sortByDate)
    cancelled.sort(sortByDate)

    return { pending, approved, rejected, cancelled }
  }, [absences])

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (absences.length === 0) {
    return (
      <div className={cn('text-center py-8', className)}>
        <Calendar className="mx-auto h-12 w-12 mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">{t('noRequests')}</p>
        <p className="text-sm text-muted-foreground">
          {t('clickRequestToStart')}
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Pending */}
      {groupedAbsences.pending.length > 0 && (
        <AbsenceGroup
          title={t('statusPending')}
          count={groupedAbsences.pending.length}
          absences={groupedAbsences.pending}
          onSelect={onSelect}
          onEdit={onEdit}
          onCancel={onCancel}
          locale={locale}
        />
      )}

      {/* Approved (upcoming) */}
      {groupedAbsences.approved.length > 0 && (
        <AbsenceGroup
          title={t('statusApproved')}
          count={groupedAbsences.approved.length}
          absences={groupedAbsences.approved}
          onSelect={onSelect}
          onEdit={onEdit}
          onCancel={onCancel}
          locale={locale}
        />
      )}

      {/* Rejected (recent) */}
      {groupedAbsences.rejected.length > 0 && (
        <AbsenceGroup
          title={t('statusRejected')}
          count={groupedAbsences.rejected.length}
          absences={groupedAbsences.rejected}
          onSelect={onSelect}
          locale={locale}
        />
      )}

      {/* Cancelled */}
      {groupedAbsences.cancelled.length > 0 && (
        <AbsenceGroup
          title={t('statusCancelled')}
          count={groupedAbsences.cancelled.length}
          absences={groupedAbsences.cancelled}
          onSelect={onSelect}
          locale={locale}
        />
      )}

    </div>
  )
}

interface AbsenceGroupProps {
  title: string
  count: number
  absences: Absence[]
  onSelect?: (absence: Absence) => void
  onEdit?: (absence: Absence) => void
  onCancel?: (absence: Absence) => void
  locale: string
}

function AbsenceGroup({
  title,
  count,
  absences,
  onSelect,
  onEdit,
  onCancel,
  locale,
}: AbsenceGroupProps) {
  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground mb-2">
        {title} ({count})
      </h4>
      <div className="space-y-2">
        {absences.map((absence) => (
          <AbsenceCard
            key={absence.id}
            absence={absence}
            onClick={() => onSelect?.(absence)}
            onEdit={
              (absence.status === 'pending' || absence.status === 'approved')
                ? () => onEdit?.(absence)
                : undefined
            }
            onCancel={
              (absence.status === 'pending' || absence.status === 'approved')
                ? () => onCancel?.(absence)
                : undefined
            }
            locale={locale}
          />
        ))}
      </div>
    </div>
  )
}

interface AbsenceCardProps {
  absence: Absence
  onClick?: () => void
  onEdit?: () => void
  onCancel?: () => void
  locale: string
}

function AbsenceCard({ absence, onClick, onEdit, onCancel, locale }: AbsenceCardProps) {
  const t = useTranslations('absences')
  const tc = useTranslations('common')
  const status = absence.status ?? 'pending'
  const statusConfig = STATUS_COLORS[status] ?? { variant: 'secondary' as const, labelKey: status }

  return (
    <div
      className={cn(
        'relative rounded-lg border p-4 transition-colors',
        onClick && 'cursor-pointer hover:bg-muted/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Absence type */}
          <div className="flex items-center gap-2 mb-1">
            {absence.absence_type?.color && (
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: absence.absence_type.color }}
              />
            )}
            <span className="font-medium truncate">
              {absence.absence_type?.name ?? t('unknownType')}
            </span>
          </div>

          {/* Date */}
          <p className="text-sm text-muted-foreground">
            {formatAbsenceDate(absence, locale)}
            {absence.duration === 0.5 && ` (${t('halfDayLabel')})`}
          </p>

          {/* Notes */}
          {absence.notes && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
              &quot;{absence.notes}&quot;
            </p>
          )}
        </div>

        {/* Status and actions */}
        <div className="flex items-start gap-2">
          <Badge variant={statusConfig.variant}>
            {t(statusConfig.labelKey as Parameters<typeof t>[0])}
          </Badge>
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
            >
              <Edit className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">{tc('edit')}</span>
            </Button>
          )}
          {onCancel && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                onCancel()
              }}
            >
              <Ban className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">{t('cancelAbsence')}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
