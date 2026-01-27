'use client'

import * as React from 'react'
import { Calendar, Loader2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useEmployeeAbsences, useDeleteAbsence } from '@/hooks/api'
import { formatDate, parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface PendingRequestsProps {
  /** Employee ID to show absences for */
  employeeId?: string
  /** Callback when an absence is clicked */
  onSelect?: (absence: Absence) => void
  /** Additional className */
  className?: string
}

const STATUS_COLORS: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; labelKey: string }> = {
  pending: { variant: 'secondary', labelKey: 'statusPending' },
  approved: { variant: 'default', labelKey: 'statusApproved' },
  rejected: { variant: 'destructive', labelKey: 'statusRejected' },
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
  className,
}: PendingRequestsProps) {
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const t = useTranslations('absences')
  const tc = useTranslations('common')
  const locale = useLocale()

  // Fetch absences for current year and next year
  const currentYear = new Date().getFullYear()
  const { data: absencesData, isLoading, refetch } = useEmployeeAbsences(
    employeeId ?? '',
    {
      from: formatDate(new Date(currentYear, 0, 1)),
      to: formatDate(new Date(currentYear + 1, 11, 31)),
      enabled: !!employeeId,
    }
  )

  const deleteMutation = useDeleteAbsence()

  const absences = absencesData?.data ?? []

  // Group absences by status
  const groupedAbsences = React.useMemo(() => {
    const pending: Absence[] = []
    const approved: Absence[] = []
    const rejected: Absence[] = []

    for (const absence of absences) {
      const status = absence.status ?? 'pending'
      if (status === 'pending') {
        pending.push(absence)
      } else if (status === 'approved') {
        approved.push(absence)
      } else if (status === 'rejected') {
        rejected.push(absence)
      }
    }

    // Sort by date within each group
    const sortByDate = (a: Absence, b: Absence) =>
      a.absence_date.localeCompare(b.absence_date)

    pending.sort(sortByDate)
    approved.sort(sortByDate)
    rejected.sort(sortByDate)

    return { pending, approved, rejected }
  }, [absences])

  const handleDeleteClick = (absenceId: string) => {
    setDeleteId(absenceId)
    setConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteId) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteId },
      })
      refetch()
    } finally {
      setConfirmOpen(false)
      setDeleteId(null)
    }
  }

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
          onDelete={handleDeleteClick}
          canDelete
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

      {/* Delete confirmation dialog */}
      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side="bottom" className="sm:max-w-md mx-auto">
          <SheetHeader>
            <SheetTitle>{t('deleteRequest')}</SheetTitle>
            <SheetDescription>
              {t('deleteConfirmation')}
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="flex-row gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              {tc('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {tc('delete')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

interface AbsenceGroupProps {
  title: string
  count: number
  absences: Absence[]
  onSelect?: (absence: Absence) => void
  onDelete?: (id: string) => void
  canDelete?: boolean
  locale: string
}

function AbsenceGroup({
  title,
  count,
  absences,
  onSelect,
  onDelete,
  canDelete,
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
            onDelete={canDelete ? () => onDelete?.(absence.id) : undefined}
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
  onDelete?: () => void
  locale: string
}

function AbsenceCard({ absence, onClick, onDelete, locale }: AbsenceCardProps) {
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
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">{tc('delete')}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
