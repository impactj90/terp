'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Check, X, Loader2, CalendarOff, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface AbsenceApprovalTableProps {
  absences: Absence[]
  isLoading: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
  approvingId?: string | null
  rejectingId?: string | null
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  /** When true, show the history view (approved/rejected) instead of pending */
  showHistory?: boolean
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getEmployeeName(absence: Absence): string {
  if (absence.employee) {
    return `${absence.employee.first_name} ${absence.employee.last_name}`
  }
  return absence.employee_id
}

function getAbsenceTypeName(absence: Absence): string {
  return absence.absence_type?.name ?? 'Unknown'
}

function getAbsenceTypeColor(absence: Absence): string | undefined {
  return absence.absence_type?.color ?? undefined
}

function getNoteValue(absence: Absence): string {
  if (absence.status === 'rejected' && absence.rejection_reason) {
    return absence.rejection_reason
  }
  return absence.notes ?? '-'
}

function getStatusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'approved':
      return 'default'
    case 'rejected':
      return 'destructive'
    case 'pending':
      return 'secondary'
    case 'cancelled':
      return 'outline'
    default:
      return 'outline'
  }
}

/**
 * Table component for displaying absence requests with approve/reject actions.
 * Used in both the pending approvals view and the history view.
 */
export function AbsenceApprovalTable({
  absences,
  isLoading,
  onApprove,
  onReject,
  approvingId,
  rejectingId,
  selectedIds,
  onToggleSelect,
  showHistory = false,
}: AbsenceApprovalTableProps) {
  const t = useTranslations('adminApprovals')
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const statusLabels: Record<string, string> = {
    approved: t('approved'),
    rejected: t('rejected'),
    pending: t('pending'),
    cancelled: t('cancelled'),
  }

  if (isLoading) {
    return <AbsenceApprovalTableSkeleton />
  }

  if (absences.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <CalendarOff className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
        <h3 className="mt-4 text-lg font-medium">
          {showHistory ? t('noHistory') : t('noPendingRequests')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {showHistory
            ? t('historyEmptyDescription')
            : t('allProcessedDescription')}
        </p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {!showHistory && <TableHead className="w-10" />}
          <TableHead>{t('columnEmployee')}</TableHead>
          <TableHead>{t('columnType')}</TableHead>
          <TableHead>{t('columnDate')}</TableHead>
          <TableHead>{t('columnDuration')}</TableHead>
          <TableHead>{t('columnNotes')}</TableHead>
          {showHistory ? <TableHead>{t('columnStatus')}</TableHead> : <TableHead>{t('columnSubmitted')}</TableHead>}
          {!showHistory && <TableHead className="text-right">{t('columnActions')}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {absences.map((absence) => (
          <React.Fragment key={absence.id}>
            <TableRow>
              {!showHistory && (
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(absence.id)}
                    onCheckedChange={() => onToggleSelect(absence.id)}
                    disabled={absence.status !== 'pending'}
                    aria-label={t('selectRow')}
                  />
                </TableCell>
              )}
              <TableCell className="font-medium">
                <button
                  type="button"
                  onClick={() => toggleExpanded(absence.id)}
                  className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
                  aria-label={t('toggleDetails')}
                >
                  {expandedIds.has(absence.id) ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {getEmployeeName(absence)}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  style={
                    getAbsenceTypeColor(absence)
                      ? {
                          borderColor: getAbsenceTypeColor(absence),
                          color: getAbsenceTypeColor(absence),
                        }
                      : undefined
                  }
                >
                  {getAbsenceTypeName(absence)}
                </Badge>
              </TableCell>
              <TableCell>{formatDate(absence.absence_date)}</TableCell>
              <TableCell>
                {absence.duration === 1
                  ? t('fullDay')
                  : absence.duration === 0.5
                    ? t('halfDay')
                    : t('durationDays', { count: absence.duration })}
              </TableCell>
              <TableCell className="max-w-[200px] truncate text-muted-foreground">
                {getNoteValue(absence)}
              </TableCell>
              {showHistory ? (
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(absence.status ?? 'pending')}>
                    {statusLabels[absence.status ?? 'pending'] ?? absence.status}
                  </Badge>
                </TableCell>
              ) : (
                <TableCell className="text-muted-foreground">
                  {absence.created_at
                    ? new Date(absence.created_at).toLocaleDateString('de-DE')
                    : '-'}
                </TableCell>
              )}
              {!showHistory && (
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => onApprove(absence.id)}
                      disabled={approvingId === absence.id || rejectingId === absence.id || absence.status !== 'pending'}
                    >
                      {approvingId === absence.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      <span className="ml-1 hidden sm:inline">{t('approve')}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => onReject(absence.id)}
                      disabled={approvingId === absence.id || rejectingId === absence.id || absence.status !== 'pending'}
                    >
                      {rejectingId === absence.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      <span className="ml-1 hidden sm:inline">{t('reject')}</span>
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
            {expandedIds.has(absence.id) && (
              <TableRow className="bg-muted/40">
                <TableCell colSpan={showHistory ? 6 : 8}>
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <div>
                      <span className="font-medium text-foreground">{t('columnStatus')}:</span>{' '}
                      {statusLabels[absence.status ?? 'pending'] ?? absence.status}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">{t('columnSubmitted')}:</span>{' '}
                      {absence.created_at
                        ? new Date(absence.created_at).toLocaleDateString('de-DE')
                        : '-'}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        {absence.status === 'rejected'
                          ? t('rejectionReason')
                          : t('columnNotes')}
                        :
                      </span>{' '}
                      {getNoteValue(absence)}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
  )
}

function AbsenceApprovalTableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}
