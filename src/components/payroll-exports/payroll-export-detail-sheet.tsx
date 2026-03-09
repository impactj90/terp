'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Eye, Download, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { PayrollExportRow } from './payroll-export-data-table'

interface PayrollExportDetailSheetProps {
  item: PayrollExportRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPreview: (item: PayrollExportRow) => void
  onDownload: (item: PayrollExportRow) => void
  onDelete: (item: PayrollExportRow) => void
  /** Additional metadata loaded from usePayrollExport(id) */
  fullExport?: {
    export_interface_id?: string | null
    file_size?: number | null
    row_count?: number | null
    total_overtime?: number
    started_at?: string | null
    requested_at?: string
    parameters?: {
      employee_ids?: string[]
      department_ids?: string[]
      include_accounts?: string[]
    } | null
  } | null
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const statusConfig = {
    pending: { labelKey: 'status.pending', variant: 'outline' as const, className: 'border-yellow-500 text-yellow-700' },
    generating: { labelKey: 'status.generating', variant: 'secondary' as const, className: 'animate-pulse' },
    completed: { labelKey: 'status.completed', variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' },
    failed: { labelKey: 'status.failed', variant: 'destructive' as const, className: '' },
  }
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
  return (
    <Badge variant={config.variant} className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}

export function PayrollExportDetailSheet({
  item,
  open,
  onOpenChange,
  onPreview,
  onDownload,
  onDelete,
  fullExport,
}: PayrollExportDetailSheetProps) {
  const t = useTranslations('payrollExports')
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

  const formatPeriod = (year: number, month: number) => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return formatter.format(new Date(year, month - 1, 1))
  }

  const formatFileSize = (bytes?: number | null) => {
    if (bytes == null) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isCompleted = item?.status === 'completed'
  const isFailed = item?.status === 'failed'
  const isGenerating = item?.status === 'generating' || item?.status === 'pending'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('detail.title')}</SheetTitle>
          <SheetDescription>
            {item ? formatPeriod(item.year, item.month) : ''}
          </SheetDescription>
        </SheetHeader>

        {item ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Error message for failed exports */}
              {isFailed && item.error_message && (
                <Alert variant="destructive">
                  <AlertDescription>{item.error_message}</AlertDescription>
                </Alert>
              )}

              {/* Export Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.exportInfo')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.type')}</span>
                    <span className="text-sm font-medium">
                      {t(`exportType.${item.export_type ?? 'standard'}` as Parameters<typeof t>[0])}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.format')}</span>
                    <span className="text-sm font-medium uppercase">{item.format ?? '-'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.period')}</span>
                    <span className="text-sm font-medium">
                      {formatPeriod(item.year, item.month)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.statusInfo')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.status')}</span>
                    {getStatusBadge(item.status, t as unknown as (key: string) => string)}
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.requestedAt')}</span>
                    <span className="text-sm font-medium">
                      {formatDate(item.requested_at ?? fullExport?.requested_at)}
                    </span>
                  </div>
                  {fullExport?.started_at && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-muted-foreground">{t('detail.startedAt')}</span>
                      <span className="text-sm font-medium">{formatDate(fullExport.started_at)}</span>
                    </div>
                  )}
                  {item.completed_at && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-muted-foreground">{t('detail.completedAt')}</span>
                      <span className="text-sm font-medium">{formatDate(item.completed_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.summary')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.employeeCount')}</span>
                    <span className="text-sm font-medium">{item.employee_count ?? '-'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.totalHours')}</span>
                    <span className="text-sm font-medium">
                      {item.total_hours != null ? item.total_hours.toFixed(2) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.totalOvertime')}</span>
                    <span className="text-sm font-medium">
                      {fullExport?.total_overtime != null ? fullExport.total_overtime.toFixed(2) : '-'}
                    </span>
                  </div>
                  {fullExport?.row_count != null && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-muted-foreground">{t('detail.rowCount')}</span>
                      <span className="text-sm font-medium">{fullExport.row_count}</span>
                    </div>
                  )}
                  {fullExport?.file_size != null && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-muted-foreground">{t('detail.fileSize')}</span>
                      <span className="text-sm font-medium">{formatFileSize(fullExport.file_size)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('detail.close')}
          </Button>
          {isCompleted && (
            <>
              <Button
                variant="outline"
                onClick={() => item && onPreview(item)}
                className="flex-1"
              >
                <Eye className="mr-2 h-4 w-4" />
                {t('detail.preview')}
              </Button>
              <Button
                onClick={() => item && onDownload(item)}
                className="flex-1"
              >
                <Download className="mr-2 h-4 w-4" />
                {t('detail.download')}
              </Button>
            </>
          )}
          {!isGenerating && (
            <Button
              variant="destructive"
              onClick={() => item && onDelete(item)}
              className="flex-1"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('detail.delete')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
