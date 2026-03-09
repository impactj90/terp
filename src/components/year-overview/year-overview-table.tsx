'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TimeDisplay } from '@/components/timesheet'
import { cn } from '@/lib/utils'

interface MonthlyValueData {
  id: string
  month?: number | null
  net_minutes?: number | null
  target_minutes?: number | null
  balance_minutes?: number | null
  working_days?: number | null
  worked_days?: number | null
  status?: string | null
  account_balances?: Record<string, number> | null
}

interface YearOverviewTableProps {
  year: number
  monthlyValues: MonthlyValueData[]
  isLoading: boolean
  onMonthClick?: (month: number) => void
}

function getStatusBadge(status: string | null | undefined, t: (key: string) => string) {
  const statusConfig = {
    open: { labelKey: 'statusOpen', variant: 'outline' as const, className: '' },
    calculated: {
      labelKey: 'statusCalculated',
      variant: 'secondary' as const,
      className: '',
    },
    closed: {
      labelKey: 'statusClosed',
      variant: 'default' as const,
      className: 'bg-green-600 hover:bg-green-700',
    },
    exported: {
      labelKey: 'statusExported',
      variant: 'default' as const,
      className: 'bg-blue-600 hover:bg-blue-700',
    },
  }
  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.open
  return (
    <Badge variant={config.variant} className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}

export function YearOverviewTable({
  year,
  monthlyValues,
  isLoading,
  onMonthClick,
}: YearOverviewTableProps) {
  const router = useRouter()
  const t = useTranslations('yearOverview')
  const locale = useLocale()

  const monthNames = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long' })
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(2024, i, 1)
      return formatter.format(date)
    })
  }, [locale])

  // Create a map for quick lookup
  const monthDataMap = new Map(
    monthlyValues.map((mv) => [mv.month, mv])
  )

  // Calculate totals
  const totals = monthlyValues.reduce(
    (acc, mv) => ({
      targetMinutes: acc.targetMinutes + (mv.target_minutes ?? 0),
      netMinutes: acc.netMinutes + (mv.net_minutes ?? 0),
      balanceMinutes: acc.balanceMinutes + (mv.balance_minutes ?? 0),
      workingDays: acc.workingDays + (mv.working_days ?? 0),
      workedDays: acc.workedDays + (mv.worked_days ?? 0),
    }),
    {
      targetMinutes: 0,
      netMinutes: 0,
      balanceMinutes: 0,
      workingDays: 0,
      workedDays: 0,
    }
  )

  const handleRowClick = (month: number) => {
    if (onMonthClick) {
      onMonthClick(month)
    } else {
      router.push(`/monthly-evaluation?year=${year}&month=${month}`)
    }
  }

  if (isLoading) {
    return <YearOverviewTableSkeleton />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('month')}</TableHead>
          <TableHead className="text-right">{t('workDays')}</TableHead>
          <TableHead className="text-right">{t('target')}</TableHead>
          <TableHead className="text-right">{t('worked')}</TableHead>
          <TableHead className="text-right">{t('balance')}</TableHead>
          <TableHead className="text-right">{t('status')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {monthNames.map((monthName, index) => {
          const month = index + 1
          const data = monthDataMap.get(month)
          const hasData = !!data

          return (
            <TableRow
              key={month}
              className={cn(
                'cursor-pointer hover:bg-muted/50 transition-colors',
                !hasData && 'text-muted-foreground'
              )}
              onClick={() => handleRowClick(month)}
            >
              <TableCell className="font-medium">{monthName}</TableCell>
              <TableCell className="text-right">
                {hasData ? (
                  <span>
                    {data.worked_days ?? 0}{' '}
                    <span className="text-muted-foreground">
                      / {data.working_days ?? 0}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {hasData ? (
                  <TimeDisplay
                    value={data.target_minutes ?? 0}
                    format="duration"
                  />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {hasData ? (
                  <TimeDisplay
                    value={data.net_minutes ?? 0}
                    format="duration"
                  />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {hasData ? (
                  <TimeDisplay
                    value={data.balance_minutes ?? 0}
                    format="balance"
                  />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {hasData ? (
                  getStatusBadge(data.status, t as unknown as (key: string) => string)
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t('noData')}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
      <TableFooter>
        <TableRow className="font-medium">
          <TableCell>{t('total')}</TableCell>
          <TableCell className="text-right">
            {totals.workedDays}{' '}
            <span className="text-muted-foreground">/ {totals.workingDays}</span>
          </TableCell>
          <TableCell className="text-right">
            <TimeDisplay value={totals.targetMinutes} format="duration" />
          </TableCell>
          <TableCell className="text-right">
            <TimeDisplay value={totals.netMinutes} format="duration" />
          </TableCell>
          <TableCell className="text-right">
            <TimeDisplay value={totals.balanceMinutes} format="balance" />
          </TableCell>
          <TableCell className="text-right" />
        </TableRow>
      </TableFooter>
    </Table>
  )
}

function YearOverviewTableSkeleton() {
  const t = useTranslations('yearOverview')

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('month')}</TableHead>
          <TableHead className="text-right">{t('workDays')}</TableHead>
          <TableHead className="text-right">{t('target')}</TableHead>
          <TableHead className="text-right">{t('worked')}</TableHead>
          <TableHead className="text-right">{t('balance')}</TableHead>
          <TableHead className="text-right">{t('status')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 12 }, (_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell className="text-right">
              <Skeleton className="h-4 w-16 ml-auto" />
            </TableCell>
            <TableCell className="text-right">
              <Skeleton className="h-4 w-12 ml-auto" />
            </TableCell>
            <TableCell className="text-right">
              <Skeleton className="h-4 w-12 ml-auto" />
            </TableCell>
            <TableCell className="text-right">
              <Skeleton className="h-4 w-12 ml-auto" />
            </TableCell>
            <TableCell className="text-right">
              <Skeleton className="h-6 w-16 ml-auto" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
