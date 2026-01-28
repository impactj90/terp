'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, ChevronUp, FileText, Loader2, AlertTriangle } from 'lucide-react'
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
import { formatBalanceDuration, formatDuration } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type DailyValue = components['schemas']['DailyValue']

interface TimesheetApprovalTableProps {
  dailyValues: DailyValue[]
  isLoading: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onApprove: (id: string) => void
  approvingId?: string | null
  showHistory?: boolean
}

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`)
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getEmployeeName(dv: DailyValue): string {
  if (dv.employee) {
    const first = dv.employee.first_name ?? ''
    const last = dv.employee.last_name ?? ''
    return `${first} ${last}`.trim()
  }
  return dv.employee_id
}

function getEmployeeMeta(dv: DailyValue): string | null {
  const personnel = dv.employee?.personnel_number
  return personnel ? `#${personnel}` : null
}

function isPendingStatus(status?: string | null): boolean {
  return status === 'pending' || status === 'calculated' || !status
}

function isErrorStatus(dv: DailyValue): boolean {
  return dv.has_errors === true || dv.status === 'error'
}

function getStatusLabel(status: string | null | undefined, t: (key: string) => string): string {
  switch (status) {
    case 'approved':
      return t('approved')
    case 'error':
      return t('error')
    case 'pending':
    case 'calculated':
    default:
      return t('pending')
  }
}

function getStatusVariant(
  status: string | null | undefined
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'approved':
      return 'default'
    case 'error':
      return 'destructive'
    case 'pending':
    case 'calculated':
    default:
      return 'secondary'
  }
}

export function TimesheetApprovalTable({
  dailyValues,
  isLoading,
  selectedIds,
  onToggleSelect,
  onApprove,
  approvingId,
  showHistory = false,
}: TimesheetApprovalTableProps) {
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

  if (isLoading) {
    return <TimesheetApprovalTableSkeleton />
  }

  if (dailyValues.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
        <h3 className="mt-4 text-lg font-medium">
          {showHistory ? t('noHistory') : t('noPendingTimesheets')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {showHistory ? t('historyEmptyDescription') : t('allTimesheetsProcessed')}
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
          <TableHead>{t('columnDate')}</TableHead>
          <TableHead>{t('timesheetHours')}</TableHead>
          <TableHead>{t('timesheetOvertime')}</TableHead>
          <TableHead>{t('timesheetErrors')}</TableHead>
          {showHistory ? (
            <TableHead>{t('columnStatus')}</TableHead>
          ) : (
            <TableHead className="text-right">{t('columnActions')}</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {dailyValues.map((dv) => {
          const isExpanded = expandedIds.has(dv.id)
          const isError = isErrorStatus(dv)
          const status = dv.status ?? (isError ? 'error' : 'calculated')
          const isPending = isPendingStatus(status)
          const isApprovable = isPending && !isError && status !== 'approved'
          const errorCount = dv.errors?.length ?? (dv.has_errors ? 1 : 0)
          const netMinutes = dv.net_minutes ?? 0
          const overtimeMinutes = dv.overtime_minutes ?? 0

          return (
            <React.Fragment key={dv.id}>
              <TableRow>
                {!showHistory && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(dv.id)}
                      onCheckedChange={() => onToggleSelect(dv.id)}
                      disabled={!isApprovable}
                      aria-label={t('selectRow')}
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(dv.id)}
                    className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
                    aria-label={t('toggleDetails')}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  {getEmployeeName(dv)}
                  {getEmployeeMeta(dv) && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {getEmployeeMeta(dv)}
                    </span>
                  )}
                </TableCell>
                <TableCell>{formatDate(dv.value_date)}</TableCell>
                <TableCell>{formatDuration(netMinutes)}</TableCell>
                <TableCell>{formatBalanceDuration(overtimeMinutes)}</TableCell>
                <TableCell>
                  {errorCount > 0 ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {t('timesheetErrorCount', { count: errorCount })}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t('timesheetNoErrors')}
                    </span>
                  )}
                </TableCell>
                {showHistory ? (
                  <TableCell>
                    <Badge variant={getStatusVariant(status)}>
                      {getStatusLabel(status, t)}
                    </Badge>
                  </TableCell>
                ) : (
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => onApprove(dv.id)}
                      disabled={!isApprovable || approvingId === dv.id}
                    >
                      {approvingId === dv.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      <span className="ml-1 hidden sm:inline">{t('approve')}</span>
                    </Button>
                  </TableCell>
                )}
              </TableRow>
              {isExpanded && (
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={showHistory ? 6 : 7}>
                    <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                      <div>
                        <span className="font-medium text-foreground">{t('timesheetGross')}:</span>{' '}
                        {formatDuration(dv.gross_minutes ?? 0)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">{t('timesheetNet')}:</span>{' '}
                        {formatDuration(netMinutes)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">{t('timesheetTarget')}:</span>{' '}
                        {formatDuration(dv.target_minutes ?? 0)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">{t('timesheetBreak')}:</span>{' '}
                        {formatDuration(dv.break_minutes ?? 0)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">{t('timesheetBalance')}:</span>{' '}
                        {formatBalanceDuration(dv.balance_minutes ?? 0)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">{t('columnStatus')}:</span>{' '}
                        {getStatusLabel(status, t)}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

function TimesheetApprovalTableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-5 w-6" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  )
}
