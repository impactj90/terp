'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useEvaluationTerminalBookings } from '@/hooks'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatTime } from '@/lib/time-utils'

interface TerminalBookingsTabProps {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
}

export function TerminalBookingsTab({ from, to, employeeId, departmentId }: TerminalBookingsTabProps) {
  const t = useTranslations('evaluations')
  const locale = useLocale()

  const [page, setPage] = React.useState(1)
  const [limit, setLimit] = React.useState(50)

  // Reset page when shared filters change
  React.useEffect(() => {
    setPage(1)
  }, [from, to, employeeId, departmentId])

  const { data, isLoading } = useEvaluationTerminalBookings({
    from,
    to,
    employee_id: employeeId,
    department_id: departmentId,
    limit,
    page,
    enabled: !!from && !!to,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  const formatDateDisplay = (dateStr: string) => {
    try {
      const parts = dateStr.split('T')[0]?.split('-') ?? dateStr.split('-')
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(dateStr))
    } catch {
      return dateStr
    }
  }

  const truncateUuid = (uuid?: string | null) => {
    if (!uuid) return '-'
    return uuid.length > 8 ? `${uuid.slice(0, 8)}...` : uuid
  }

  return (
    <div className="space-y-4">
      {/* Result count */}
      <div className="text-sm text-muted-foreground">
        {total === 1
          ? t('count.item', { count: total })
          : t('count.items', { count: total })}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TerminalBookingsDataTableSkeleton />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">{t('empty.terminalBookings')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('terminalBookings.date')}</TableHead>
                  <TableHead>{t('terminalBookings.employee')}</TableHead>
                  <TableHead>{t('terminalBookings.originalTime')}</TableHead>
                  <TableHead>{t('terminalBookings.editedTime')}</TableHead>
                  <TableHead>{t('terminalBookings.wasEdited')}</TableHead>
                  <TableHead>{t('terminalBookings.bookingType')}</TableHead>
                  <TableHead>{t('terminalBookings.terminalId')}</TableHead>
                  <TableHead>{t('terminalBookings.source')}</TableHead>
                  <TableHead>{t('terminalBookings.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const bookingDateStr = String(item.bookingDate).split('T')[0] ?? String(item.bookingDate)
                  const createdAtStr = String(item.createdAt)
                  return (
                    <TableRow
                      key={item.id}
                      className={item.wasEdited ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}
                    >
                      <TableCell>{formatDateDisplay(bookingDateStr)}</TableCell>
                      <TableCell className="font-medium">
                        {item.employee
                          ? `${item.employee.firstName} ${item.employee.lastName}`
                          : '-'}
                      </TableCell>
                      <TableCell className="font-mono">
                        {item.originalTimeString ?? formatTime(item.originalTime ?? 0)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {item.editedTimeString ?? formatTime(item.editedTime ?? 0)}
                      </TableCell>
                      <TableCell>
                        {item.wasEdited ? (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                            {t('terminalBookings.editedBadge')}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>{item.bookingType?.name ?? '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{truncateUuid(item.terminalId)}</TableCell>
                      <TableCell>{item.source ?? '-'}</TableCell>
                      <TableCell>{formatDateTime(createdAtStr)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(newLimit) => {
            setLimit(newLimit)
            setPage(1)
          }}
        />
      )}
    </div>
  )
}

function TerminalBookingsDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: 9 }).map((_, i) => (
            <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            {Array.from({ length: 9 }).map((_, j) => (
              <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
