'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { MoreHorizontal, Eye, Download, Trash2, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

export interface PayrollExportRow {
  id: string
  year: number
  month: number
  export_type?: string
  format?: string
  status: string
  employee_count?: number
  total_hours?: number
  requested_at?: string | null
  completed_at?: string | null
  error_message?: string | null
}

interface PayrollExportDataTableProps {
  items: PayrollExportRow[]
  isLoading: boolean
  onRowClick: (item: PayrollExportRow) => void
  onPreview: (item: PayrollExportRow) => void
  onDownload: (item: PayrollExportRow) => void
  onDelete: (item: PayrollExportRow) => void
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const statusConfig = {
    pending: {
      labelKey: 'status.pending',
      variant: 'outline' as const,
      className: 'border-yellow-500 text-yellow-700',
    },
    generating: {
      labelKey: 'status.generating',
      variant: 'secondary' as const,
      className: 'animate-pulse',
    },
    completed: {
      labelKey: 'status.completed',
      variant: 'default' as const,
      className: 'bg-green-600 hover:bg-green-700',
    },
    failed: {
      labelKey: 'status.failed',
      variant: 'destructive' as const,
      className: '',
    },
  }
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
  return (
    <Badge variant={config.variant} className={config.className}>
      {status === 'generating' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {t(config.labelKey)}
    </Badge>
  )
}

export function PayrollExportDataTable({
  items,
  isLoading,
  onRowClick,
  onPreview,
  onDownload,
  onDelete,
}: PayrollExportDataTableProps) {
  const t = useTranslations('payrollExports')
  const locale = useLocale()

  const formatPeriod = (year: number, month: number) => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' })
    return formatter.format(new Date(year, month - 1, 1))
  }

  const formatDate = (dateStr?: string | null) => {
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

  const formatHours = (hours?: number) => {
    if (hours == null) return '-'
    return hours.toFixed(2)
  }

  if (isLoading) {
    return <PayrollExportDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('table.yearMonth')}</TableHead>
          <TableHead className="w-28">{t('table.exportType')}</TableHead>
          <TableHead className="w-20">{t('table.format')}</TableHead>
          <TableHead className="w-32">{t('table.status')}</TableHead>
          <TableHead className="w-24 text-right">{t('table.employeeCount')}</TableHead>
          <TableHead className="w-28 text-right">{t('table.totalHours')}</TableHead>
          <TableHead className="w-36">{t('table.generatedAt')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('table.actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const isCompleted = item.status === 'completed'
          const isGenerating = item.status === 'generating' || item.status === 'pending'

          return (
            <TableRow
              key={item.id}
              className="cursor-pointer"
              onClick={() => onRowClick(item)}
            >
              <TableCell className="font-medium">
                {formatPeriod(item.year, item.month)}
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {t(`exportType.${item.export_type ?? 'standard'}` as Parameters<typeof t>[0])}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-sm uppercase">
                {item.format ?? '-'}
              </TableCell>
              <TableCell>
                {getStatusBadge(item.status, t as unknown as (key: string) => string)}
              </TableCell>
              <TableCell className="text-right">
                {item.employee_count ?? '-'}
              </TableCell>
              <TableCell className="text-right">
                {formatHours(item.total_hours)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(item.completed_at ?? item.requested_at)}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">{t('table.actions')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => onPreview(item)}
                      disabled={!isCompleted}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t('actions.preview')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDownload(item)}
                      disabled={!isCompleted}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t('actions.download')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(item)}
                      disabled={isGenerating}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('actions.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function PayrollExportDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-36"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
