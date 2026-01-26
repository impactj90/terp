'use client'

import * as React from 'react'
import { Calendar, Loader2, Trash2 } from 'lucide-react'
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

const STATUS_COLORS: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  pending: { variant: 'secondary', label: 'Pending' },
  approved: { variant: 'default', label: 'Approved' },
  rejected: { variant: 'destructive', label: 'Rejected' },
}

function formatAbsenceDate(absence: Absence): string {
  const date = parseISODate(absence.absence_date)
  return date.toLocaleDateString('en-US', {
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
        <p className="text-muted-foreground">No absence requests</p>
        <p className="text-sm text-muted-foreground">
          Click &quot;Request Absence&quot; to get started
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Pending */}
      {groupedAbsences.pending.length > 0 && (
        <AbsenceGroup
          title="Pending"
          count={groupedAbsences.pending.length}
          absences={groupedAbsences.pending}
          onSelect={onSelect}
          onDelete={handleDeleteClick}
          canDelete
        />
      )}

      {/* Approved (upcoming) */}
      {groupedAbsences.approved.length > 0 && (
        <AbsenceGroup
          title="Approved"
          count={groupedAbsences.approved.length}
          absences={groupedAbsences.approved}
          onSelect={onSelect}
        />
      )}

      {/* Rejected (recent) */}
      {groupedAbsences.rejected.length > 0 && (
        <AbsenceGroup
          title="Rejected"
          count={groupedAbsences.rejected.length}
          absences={groupedAbsences.rejected}
          onSelect={onSelect}
        />
      )}

      {/* Delete confirmation dialog */}
      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side="bottom" className="sm:max-w-md mx-auto">
          <SheetHeader>
            <SheetTitle>Delete Absence Request</SheetTitle>
            <SheetDescription>
              Are you sure you want to delete this absence request? This action
              cannot be undone.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="flex-row gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              Cancel
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
              Delete
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
}

function AbsenceGroup({
  title,
  count,
  absences,
  onSelect,
  onDelete,
  canDelete,
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
}

function AbsenceCard({ absence, onClick, onDelete }: AbsenceCardProps) {
  const status = absence.status ?? 'pending'
  const statusConfig = STATUS_COLORS[status] ?? { variant: 'secondary' as const, label: status }

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
              {absence.absence_type?.name ?? 'Unknown type'}
            </span>
          </div>

          {/* Date */}
          <p className="text-sm text-muted-foreground">
            {formatAbsenceDate(absence)}
            {absence.duration === 0.5 && ' (half day)'}
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
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
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
              <span className="sr-only">Delete</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
