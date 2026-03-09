'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { MoreHorizontal, Download, Trash2, Loader2 } from 'lucide-react'
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

export interface ReportRow {
  id: string
  name?: string
  report_type: string
  format?: string
  status: string
  row_count?: number | null
  file_size?: number | null
  requested_at?: string
  completed_at?: string | null
  error_message?: string | null
}

interface ReportDataTableProps {
  items: ReportRow[]
  isLoading: boolean
  onRowClick: (item: ReportRow) => void
  onDownload: (item: ReportRow) => void
  onDelete: (item: ReportRow) => void
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

function getReportTypeBadge(reportType: string, t: (key: string) => string) {
  const typeColorMap: Record<string, string> = {
    // Master data types - blue
    daily_overview: 'border-blue-500 text-blue-700',
    weekly_overview: 'border-blue-500 text-blue-700',
    employee_timesheet: 'border-blue-500 text-blue-700',
    // Monthly types - green
    monthly_overview: 'border-green-500 text-green-700',
    department_summary: 'border-green-500 text-green-700',
    // Absence types - purple
    absence_report: 'border-purple-500 text-purple-700',
    vacation_report: 'border-purple-500 text-purple-700',
    // Time types - orange
    overtime_report: 'border-orange-500 text-orange-700',
    account_balances: 'border-orange-500 text-orange-700',
    // Custom - default gray
    custom: '',
  }
  const colorClass = typeColorMap[reportType] ?? ''
  return (
    <Badge variant="outline" className={colorClass}>
      {t(`types.${reportType}` as Parameters<typeof t>[0])}
    </Badge>
  )
}

function formatFileSize(bytes?: number | null) {
  if (bytes == null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ReportDataTable({
  items,
  isLoading,
  onRowClick,
  onDownload,
  onDelete,
}: ReportDataTableProps) {
  const t = useTranslations('reports')
  const locale = useLocale()

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

  if (isLoading) {
    return <ReportDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('table.name')}</TableHead>
          <TableHead className="w-36">{t('table.reportType')}</TableHead>
          <TableHead className="w-20">{t('table.format')}</TableHead>
          <TableHead className="w-32">{t('table.status')}</TableHead>
          <TableHead className="w-20 text-right">{t('table.rowCount')}</TableHead>
          <TableHead className="w-24 text-right">{t('table.fileSize')}</TableHead>
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
              <TableCell className="font-medium truncate max-w-[200px]">
                {item.name ?? '-'}
              </TableCell>
              <TableCell>
                {getReportTypeBadge(item.report_type, t as unknown as (key: string) => string)}
              </TableCell>
              <TableCell className="font-mono text-sm uppercase">
                {item.format ?? '-'}
              </TableCell>
              <TableCell>
                {getStatusBadge(item.status, t as unknown as (key: string) => string)}
              </TableCell>
              <TableCell className="text-right">
                {item.row_count ?? '-'}
              </TableCell>
              <TableCell className="text-right">
                {formatFileSize(item.file_size)}
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

function ReportDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-32" /></TableHead>
          <TableHead className="w-36"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-36"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
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
