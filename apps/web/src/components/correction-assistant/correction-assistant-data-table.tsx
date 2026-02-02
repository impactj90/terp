'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

export interface FlattenedCorrectionRow {
  daily_value_id: string
  employee_id: string
  employee_name: string
  department_id: string | null
  department_name: string | null
  value_date: string
  code: string
  severity: 'error' | 'hint'
  message: string
  error_type: string
}

interface CorrectionAssistantDataTableProps {
  items: FlattenedCorrectionRow[]
  isLoading: boolean
  onRowClick: (item: FlattenedCorrectionRow) => void
}

function formatDateDisplay(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

export function CorrectionAssistantDataTable({
  items,
  isLoading,
  onRowClick,
}: CorrectionAssistantDataTableProps) {
  const t = useTranslations('correctionAssistant')

  if (isLoading) {
    return <CorrectionAssistantDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('table.employee')}</TableHead>
          <TableHead>{t('table.department')}</TableHead>
          <TableHead className="w-28">{t('table.date')}</TableHead>
          <TableHead className="w-40">{t('table.errorCode')}</TableHead>
          <TableHead className="w-24">{t('table.severity')}</TableHead>
          <TableHead>{t('table.message')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, index) => (
          <TableRow
            key={`${item.daily_value_id}-${item.code}-${index}`}
            className="cursor-pointer"
            onClick={() => onRowClick(item)}
          >
            <TableCell className="font-medium">{item.employee_name}</TableCell>
            <TableCell>{item.department_name || '-'}</TableCell>
            <TableCell>{formatDateDisplay(item.value_date)}</TableCell>
            <TableCell className="font-mono text-sm">{item.code}</TableCell>
            <TableCell>
              <Badge variant={item.severity === 'error' ? 'destructive' : 'secondary'}>
                {t(`severity.${item.severity}` as 'severity.error' | 'severity.hint')}
              </Badge>
            </TableCell>
            <TableCell className="max-w-md truncate">{item.message}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function CorrectionAssistantDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-40"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-32" /></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
