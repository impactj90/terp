'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Terminal, X } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useTerminalBookings,
  useEmployees,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { components } from '@/lib/api/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFn = (key: string, values?: Record<string, any>) => string

type RawTerminalBooking = components['schemas']['RawTerminalBooking']

const STATUS_BADGE_CONFIG: Record<string, { className: string; labelKey: string }> = {
  pending: {
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    labelKey: 'bookings.statusPending',
  },
  processed: {
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    labelKey: 'bookings.statusProcessed',
  },
  failed: {
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    labelKey: 'bookings.statusFailed',
  },
  skipped: {
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    labelKey: 'bookings.statusSkipped',
  },
}

function getDefaultDateRange() {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: format(firstDay, 'yyyy-MM-dd'),
    to: format(lastDay, 'yyyy-MM-dd'),
  }
}

export function BookingsTab() {
  const t = useTranslations('adminTerminalBookings')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['terminal_bookings.manage'])

  // Filter state
  const defaults = React.useMemo(() => getDefaultDateRange(), [])
  const [dateFrom, setDateFrom] = React.useState(defaults.from)
  const [dateTo, setDateTo] = React.useState(defaults.to)
  const [terminalId, setTerminalId] = React.useState('')
  const [employeeId, setEmployeeId] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [importBatchId, setImportBatchId] = React.useState('')

  // Data
  const { data: bookingsData, isLoading } = useTerminalBookings({
    from: dateFrom,
    to: dateTo,
    terminal_id: terminalId || undefined,
    employee_id: employeeId !== 'all' ? employeeId : undefined,
    status: status !== 'all' ? (status as 'pending' | 'processed' | 'failed' | 'skipped') : undefined,
    import_batch_id: importBatchId || undefined,
    enabled: !authLoading && !permLoading && canAccess && !!dateFrom && !!dateTo,
  })
  const { data: employeesData } = useEmployees({
    active: true,
    enabled: !authLoading && !permLoading && canAccess,
  })

  const bookings = (bookingsData?.data ?? []) as RawTerminalBooking[]
  const employees = employeesData?.data ?? []

  const hasFilters =
    terminalId !== '' ||
    employeeId !== 'all' ||
    status !== 'all' ||
    importBatchId !== '' ||
    dateFrom !== defaults.from ||
    dateTo !== defaults.to

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">{t('bookings.filterFrom')}</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('bookings.filterTo')}</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('bookings.filterTerminalId')}</Label>
          <Input
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            placeholder={t('bookings.filterTerminalId')}
            className="w-36"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('bookings.filterEmployee')}</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('bookings.filterAllEmployees')}</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('bookings.filterStatus')}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('bookings.filterAllStatuses')}</SelectItem>
              <SelectItem value="pending">{t('bookings.statusPending')}</SelectItem>
              <SelectItem value="processed">{t('bookings.statusProcessed')}</SelectItem>
              <SelectItem value="failed">{t('bookings.statusFailed')}</SelectItem>
              <SelectItem value="skipped">{t('bookings.statusSkipped')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('bookings.filterBatchId')}</Label>
          <Input
            value={importBatchId}
            onChange={(e) => setImportBatchId(e.target.value)}
            placeholder={t('bookings.filterBatchId')}
            className="w-36"
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDateFrom(defaults.from)
              setDateTo(defaults.to)
              setTerminalId('')
              setEmployeeId('all')
              setStatus('all')
              setImportBatchId('')
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('bookings.clearFilters')}
          </Button>
        )}
      </div>

      {/* Count */}
      <div className="text-sm text-muted-foreground">
        {bookings.length === 1
          ? (t as TranslationFn)('bookings.count', { count: bookings.length })
          : (t as TranslationFn)('bookings.countPlural', { count: bookings.length })}
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Terminal className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">{t('bookings.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {hasFilters ? t('bookings.emptyFilterHint') : t('bookings.emptyHint')}
              </p>
            </div>
          ) : (
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('bookings.columnTimestamp')}</TableHead>
                    <TableHead>{t('bookings.columnEmployeePin')}</TableHead>
                    <TableHead>{t('bookings.columnTerminalId')}</TableHead>
                    <TableHead>{t('bookings.columnBookingCode')}</TableHead>
                    <TableHead>{t('bookings.columnStatus')}</TableHead>
                    <TableHead>{t('bookings.columnEmployee')}</TableHead>
                    <TableHead>{t('bookings.columnError')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((booking) => {
                    const statusConfig = STATUS_BADGE_CONFIG[booking.status] || STATUS_BADGE_CONFIG.pending
                    return (
                      <TableRow key={booking.id}>
                        <TableCell className="whitespace-nowrap">
                          {booking.raw_timestamp
                            ? format(new Date(booking.raw_timestamp), 'dd.MM.yyyy HH:mm:ss')
                            : '-'}
                        </TableCell>
                        <TableCell>{booking.employee_pin}</TableCell>
                        <TableCell>{booking.terminal_id}</TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{booking.raw_booking_code}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{booking.raw_booking_code}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusConfig!.className}>
                            {t(statusConfig!.labelKey as Parameters<typeof t>[0])}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {booking.employee
                            ? `${booking.employee.first_name} ${booking.employee.last_name}`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {booking.status === 'failed' && booking.error_message ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-destructive cursor-help truncate max-w-[200px] inline-block">
                                  {booking.error_message}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                <p>{booking.error_message}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </>
  )
}
