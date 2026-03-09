'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
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
import { TimeDisplay } from '@/components/timesheet'

// Enriched row type (after frontend join with employees data)
export interface MonthlyValueRow {
  id: string
  employee_id: string
  employee_name: string
  personnel_number: string
  year: number
  month: number
  status: 'open' | 'calculated' | 'closed' | 'exported'
  target_minutes: number
  net_minutes: number
  overtime_minutes: number
  balance_minutes: number
  absence_days: number
  working_days: number
  worked_days: number
  closed_at: string | null
}

interface MonthlyValuesDataTableProps {
  items: MonthlyValueRow[]
  isLoading: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onRowClick: (item: MonthlyValueRow) => void
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const statusConfig = {
    open: { labelKey: 'status.open', variant: 'outline' as const, className: '' },
    calculated: { labelKey: 'status.calculated', variant: 'secondary' as const, className: '' },
    closed: {
      labelKey: 'status.closed',
      variant: 'default' as const,
      className: 'bg-green-600 hover:bg-green-700',
    },
    exported: {
      labelKey: 'status.exported',
      variant: 'default' as const,
      className: 'bg-blue-600 hover:bg-blue-700',
    },
  }
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open
  return (
    <Badge variant={config.variant} className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}

export function MonthlyValuesDataTable({
  items,
  isLoading,
  selectedIds,
  onToggleSelect,
  onRowClick,
}: MonthlyValuesDataTableProps) {
  const t = useTranslations('monthlyValues')

  if (isLoading) {
    return <MonthlyValuesDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead>{t('table.employee')}</TableHead>
          <TableHead className="w-24">{t('table.personnelNumber')}</TableHead>
          <TableHead className="w-28">{t('table.status')}</TableHead>
          <TableHead className="w-24 text-right">{t('table.target')}</TableHead>
          <TableHead className="w-24 text-right">{t('table.net')}</TableHead>
          <TableHead className="w-24 text-right">{t('table.overtime')}</TableHead>
          <TableHead className="w-24 text-right">{t('table.balance')}</TableHead>
          <TableHead className="w-24 text-right">{t('table.absenceDays')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            className="cursor-pointer"
            onClick={() => onRowClick(item)}
          >
            <TableCell
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              <Checkbox
                checked={selectedIds.has(item.id)}
                onCheckedChange={() => onToggleSelect(item.id)}
                aria-label={`Select ${item.employee_name}`}
              />
            </TableCell>
            <TableCell className="font-medium">{item.employee_name}</TableCell>
            <TableCell className="font-mono text-sm">{item.personnel_number}</TableCell>
            <TableCell>{getStatusBadge(item.status, t as unknown as (key: string) => string)}</TableCell>
            <TableCell className="text-right">
              <TimeDisplay value={item.target_minutes} format="duration" />
            </TableCell>
            <TableCell className="text-right">
              <TimeDisplay value={item.net_minutes} format="duration" />
            </TableCell>
            <TableCell className="text-right">
              <TimeDisplay value={item.overtime_minutes} format="duration" />
            </TableCell>
            <TableCell className="text-right">
              <TimeDisplay value={item.balance_minutes} format="balance" />
            </TableCell>
            <TableCell className="text-right">{item.absence_days}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function MonthlyValuesDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Skeleton className="h-4 w-4" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-24" />
          </TableHead>
          <TableHead className="w-24">
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead className="w-28">
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead className="w-24">
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead className="w-24">
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead className="w-24">
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead className="w-24">
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead className="w-24">
            <Skeleton className="h-4 w-16" />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 10 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-4" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-20 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-16 ml-auto" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-16 ml-auto" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-16 ml-auto" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-16 ml-auto" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-12 ml-auto" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
