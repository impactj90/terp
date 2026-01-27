'use client'

import { useRouter } from 'next/navigation'
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

// Month names for display
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

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

function getStatusBadge(status?: string | null) {
  const statusConfig = {
    open: { label: 'Open', variant: 'outline' as const, className: '' },
    calculated: {
      label: 'Calculated',
      variant: 'secondary' as const,
      className: '',
    },
    closed: {
      label: 'Closed',
      variant: 'default' as const,
      className: 'bg-green-600 hover:bg-green-700',
    },
    exported: {
      label: 'Exported',
      variant: 'default' as const,
      className: 'bg-blue-600 hover:bg-blue-700',
    },
  }
  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.open
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
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
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Work Days</TableHead>
          <TableHead className="text-right">Target</TableHead>
          <TableHead className="text-right">Worked</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {MONTH_NAMES.map((monthName, index) => {
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
                  getStatusBadge(data.status)
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    No data
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
      <TableFooter>
        <TableRow className="font-medium">
          <TableCell>Total</TableCell>
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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Work Days</TableHead>
          <TableHead className="text-right">Target</TableHead>
          <TableHead className="text-right">Worked</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {MONTH_NAMES.map((monthName) => (
          <TableRow key={monthName}>
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
