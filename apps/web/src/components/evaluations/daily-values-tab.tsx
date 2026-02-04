'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useEvaluationDailyValues } from '@/hooks/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { formatMinutes, formatBalance } from '@/lib/time-utils'

interface DailyValuesTabProps {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
}

const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  pending: { variant: 'outline', className: 'border-yellow-500 text-yellow-700' },
  calculated: { variant: 'secondary', className: '' },
  error: { variant: 'destructive', className: '' },
  approved: { variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  no_data: { variant: 'outline', className: 'text-muted-foreground' },
}

export function DailyValuesTab({ from, to, employeeId, departmentId }: DailyValuesTabProps) {
  const t = useTranslations('evaluations')
  const locale = useLocale()

  // Tab-specific filter state
  const [hasErrors, setHasErrors] = React.useState(false)
  const [includeNoBookings, setIncludeNoBookings] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [limit, setLimit] = React.useState(50)

  // Reset page when any filter changes
  React.useEffect(() => {
    setPage(1)
  }, [from, to, employeeId, departmentId, hasErrors, includeNoBookings])

  const { data, isLoading } = useEvaluationDailyValues({
    from,
    to,
    employee_id: employeeId,
    department_id: departmentId,
    has_errors: hasErrors || undefined,
    include_no_bookings: includeNoBookings || undefined,
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

  return (
    <div className="space-y-4">
      {/* Tab-specific filters */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id="has-errors"
            checked={hasErrors}
            onCheckedChange={setHasErrors}
          />
          <Label htmlFor="has-errors">{t('filters.hasErrors')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="include-no-bookings"
            checked={includeNoBookings}
            onCheckedChange={setIncludeNoBookings}
          />
          <Label htmlFor="include-no-bookings">{t('filters.includeNoBookings')}</Label>
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
            <DailyValuesDataTableSkeleton />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">{t('empty.dailyValues')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('dailyValues.date')}</TableHead>
                  <TableHead>{t('dailyValues.employee')}</TableHead>
                  <TableHead>{t('dailyValues.status')}</TableHead>
                  <TableHead className="text-right">{t('dailyValues.target')}</TableHead>
                  <TableHead className="text-right">{t('dailyValues.gross')}</TableHead>
                  <TableHead className="text-right">{t('dailyValues.net')}</TableHead>
                  <TableHead className="text-right">{t('dailyValues.break')}</TableHead>
                  <TableHead className="text-right">{t('dailyValues.overtime')}</TableHead>
                  <TableHead className="text-right">{t('dailyValues.balance')}</TableHead>
                  <TableHead>{t('dailyValues.firstCome')}</TableHead>
                  <TableHead>{t('dailyValues.lastGo')}</TableHead>
                  <TableHead className="text-right">{t('dailyValues.bookings')}</TableHead>
                  <TableHead className="w-16">{t('dailyValues.errors')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => {
                  const statusKey = item.status ?? 'pending'
                  const config = statusConfig[statusKey] ?? { variant: 'outline' as const, className: '' }
                  const balanceMinutes = item.balance_minutes ?? 0
                  return (
                    <TableRow key={item.id ?? `${item.employee_id}-${item.date}-${index}`}>
                      <TableCell>{formatDateDisplay(item.date)}</TableCell>
                      <TableCell className="font-medium">
                        {item.employee
                          ? `${item.employee.first_name} ${item.employee.last_name}`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant} className={config.className}>
                          {t(`status.${item.status ?? 'pending'}` as Parameters<typeof t>[0])}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMinutes(item.target_minutes ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMinutes(item.gross_minutes ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMinutes(item.net_minutes ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMinutes(item.break_minutes ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMinutes(item.overtime_minutes ?? 0)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          balanceMinutes > 0
                            ? 'text-green-600'
                            : balanceMinutes < 0
                              ? 'text-red-600'
                              : ''
                        }`}
                      >
                        {formatBalance(balanceMinutes)}
                      </TableCell>
                      <TableCell className="font-mono">{item.first_come ?? '-'}</TableCell>
                      <TableCell className="font-mono">{item.last_go ?? '-'}</TableCell>
                      <TableCell className="text-right">{item.booking_count ?? 0}</TableCell>
                      <TableCell>
                        {item.has_errors && (
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" title="Has errors" />
                        )}
                      </TableCell>
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

function DailyValuesDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: 13 }).map((_, i) => (
            <TableHead key={i}><Skeleton className="h-4 w-16" /></TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            {Array.from({ length: 13 }).map((_, j) => (
              <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
