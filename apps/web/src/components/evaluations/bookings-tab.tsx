'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useEvaluationBookings, useBookingTypes } from '@/hooks/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatTime } from '@/lib/time-utils'

interface BookingsTabProps {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
}

const sourceColorMap: Record<string, string> = {
  web: 'border-blue-500 text-blue-700',
  terminal: 'border-orange-500 text-orange-700',
  api: 'border-purple-500 text-purple-700',
  import: 'border-green-500 text-green-700',
  correction: 'border-yellow-500 text-yellow-700',
}

export function BookingsTab({ from, to, employeeId, departmentId }: BookingsTabProps) {
  const t = useTranslations('evaluations')
  const locale = useLocale()

  // Tab-specific filter state
  const [bookingTypeId, setBookingTypeId] = React.useState<string | null>(null)
  const [source, setSource] = React.useState<string | null>(null)
  const [direction, setDirection] = React.useState<string | null>(null)
  const [page, setPage] = React.useState(1)
  const [limit, setLimit] = React.useState(50)

  // Reset page when any filter changes
  React.useEffect(() => {
    setPage(1)
  }, [from, to, employeeId, departmentId, bookingTypeId, source, direction])

  // Booking types for filter dropdown
  const { data: bookingTypesData } = useBookingTypes({ enabled: !!from && !!to })
  const bookingTypes = (bookingTypesData as { data?: Array<{ id: string; name: string; code: string }> })?.data ?? []

  const { data, isLoading } = useEvaluationBookings({
    from,
    to,
    employee_id: employeeId,
    department_id: departmentId,
    booking_type_id: bookingTypeId ?? undefined,
    source: (source as 'web' | 'terminal' | 'api' | 'import' | 'correction') ?? undefined,
    direction: (direction as 'in' | 'out') ?? undefined,
    limit,
    page,
    enabled: !!from && !!to,
  })

  const items = data?.data ?? []
  const total = data?.meta?.total ?? 0
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

  return (
    <div className="space-y-4">
      {/* Tab-specific filters */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 md:items-end">
        <div className="space-y-2">
          <Label>{t('filters.bookingType')}</Label>
          <Select
            value={bookingTypeId ?? 'all'}
            onValueChange={(value) => setBookingTypeId(value === 'all' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allBookingTypes')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allBookingTypes')}</SelectItem>
              {bookingTypes.map((bt) => (
                <SelectItem key={bt.id} value={bt.id}>
                  {bt.code} - {bt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('filters.source')}</Label>
          <Select
            value={source ?? 'all'}
            onValueChange={(value) => setSource(value === 'all' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allSources')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allSources')}</SelectItem>
              {['web', 'terminal', 'api', 'import', 'correction'].map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`sources.${s}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('filters.direction')}</Label>
          <Select
            value={direction ?? 'all'}
            onValueChange={(value) => setDirection(value === 'all' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allDirections')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allDirections')}</SelectItem>
              <SelectItem value="in">{t('filters.directionIn')}</SelectItem>
              <SelectItem value="out">{t('filters.directionOut')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

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
            <BookingsDataTableSkeleton />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">{t('empty.bookings')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('bookings.date')}</TableHead>
                  <TableHead>{t('bookings.employee')}</TableHead>
                  <TableHead>{t('bookings.time')}</TableHead>
                  <TableHead>{t('bookings.bookingType')}</TableHead>
                  <TableHead>{t('bookings.source')}</TableHead>
                  <TableHead>{t('bookings.direction')}</TableHead>
                  <TableHead>{t('bookings.notes')}</TableHead>
                  <TableHead>{t('bookings.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDateDisplay(item.booking_date)}</TableCell>
                    <TableCell className="font-medium">
                      {item.employee
                        ? `${item.employee.first_name} ${item.employee.last_name}`
                        : '-'}
                    </TableCell>
                    <TableCell className="font-mono">
                      {item.time_string ?? formatTime(item.edited_time ?? 0)}
                    </TableCell>
                    <TableCell>
                      {item.booking_type?.name ?? '-'}
                    </TableCell>
                    <TableCell>
                      {item.source ? (
                        <Badge
                          variant="outline"
                          className={sourceColorMap[item.source] ?? ''}
                        >
                          {t(`sources.${item.source}` as Parameters<typeof t>[0])}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {item.source === 'terminal' || item.pair_id !== undefined
                        ? '-'
                        : '-'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {item.notes ?? '-'}
                    </TableCell>
                    <TableCell>{formatDateTime(item.created_at)}</TableCell>
                  </TableRow>
                ))}
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

function BookingsDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            {Array.from({ length: 8 }).map((_, j) => (
              <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
