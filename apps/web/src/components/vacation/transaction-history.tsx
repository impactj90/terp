'use client'

import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeAbsences } from '@/hooks/api'
import { formatDisplayDate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface TransactionHistoryProps {
  employeeId: string
  year: number
  className?: string
}

const statusStyles: Record<string, string> = {
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn('capitalize', statusStyles[status] ?? '')}
    >
      {status}
    </Badge>
  )
}

export function TransactionHistory({
  employeeId,
  year,
  className,
}: TransactionHistoryProps) {
  const from = year + '-01-01'
  const to = year + '-12-31'

  const { data, isLoading, error } = useEmployeeAbsences(employeeId, {
    from,
    to,
    enabled: !!employeeId,
  })

  // Filter to vacation-related absences only
  const vacationAbsences = (data?.data ?? []).filter(
    (absence: Absence) => absence.absence_type?.category === 'vacation'
  )

  // Sort by date descending (most recent first)
  const sortedAbsences = [...vacationAbsences].sort((a, b) => {
    const dateA = a.absence_date ? new Date(a.absence_date).getTime() : 0
    const dateB = b.absence_date ? new Date(b.absence_date).getTime() : 0
    return dateB - dateA
  })

  if (isLoading) {
    return <TransactionHistorySkeleton className={className} />
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Vacation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load vacation history
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Vacation History {year}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedAbsences.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            No vacation records for {year}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAbsences.map((absence: Absence) => (
                <TableRow key={absence.id}>
                  <TableCell className="font-medium">
                    {absence.absence_date
                      ? formatDisplayDate(new Date(absence.absence_date), 'short')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {absence.absence_type?.name ?? 'Vacation'}
                  </TableCell>
                  <TableCell className="text-right">
                    {absence.duration === 1
                      ? '1 day'
                      : absence.duration === 0.5
                        ? 'Half day'
                        : absence.duration + ' days'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={absence.status ?? 'pending'} />
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {absence.notes ?? '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function TransactionHistorySkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 flex-1" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
