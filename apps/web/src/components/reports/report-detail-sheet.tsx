'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Download, Trash2, Loader2 } from 'lucide-react'
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
import type { ReportRow } from './report-data-table'
import type { components } from '@/lib/api/types'

interface ReportDetailSheetProps {
  item: ReportRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDownload: (item: ReportRow) => void
  onDelete: (item: ReportRow) => void
  fullReport?: components['schemas']['Report'] | null
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
      {status === 'generating' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {t(config.labelKey)}
    </Badge>
  )
}

function formatFileSize(bytes?: number | null) {
  if (bytes == null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ReportDetailSheet({
  item,
  open,
  onOpenChange,
  onDownload,
  onDelete,
  fullReport,
}: ReportDetailSheetProps) {
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

  const isCompleted = item?.status === 'completed'
  const isFailed = item?.status === 'failed'
  const isGenerating = item?.status === 'generating' || item?.status === 'pending'

  const params = fullReport?.parameters
  const hasParams = params && (
    params.from_date ||
    params.to_date ||
    (params.employee_ids && params.employee_ids.length > 0) ||
    (params.department_ids && params.department_ids.length > 0) ||
    (params.cost_center_ids && params.cost_center_ids.length > 0) ||
    (params.team_ids && params.team_ids.length > 0)
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('detail.title')}</SheetTitle>
          <SheetDescription>
            {item?.name ?? '-'}
          </SheetDescription>
        </SheetHeader>

        {item ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Error message for failed reports */}
              {isFailed && item.error_message && (
                <Alert variant="destructive">
                  <AlertDescription>{item.error_message}</AlertDescription>
                </Alert>
              )}

              {/* Report Information */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.reportInfo')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.name')}</span>
                    <span className="text-sm font-medium">{item.name ?? '-'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.type')}</span>
                    <span className="text-sm font-medium">
                      {t(`types.${item.report_type}` as Parameters<typeof t>[0])}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.format')}</span>
                    <span className="text-sm font-medium uppercase">{item.format ?? '-'}</span>
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
                      {formatDate(item.requested_at ?? fullReport?.requested_at)}
                    </span>
                  </div>
                  {fullReport?.started_at && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-muted-foreground">{t('detail.startedAt')}</span>
                      <span className="text-sm font-medium">{formatDate(fullReport.started_at)}</span>
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

              {/* Results (if completed) */}
              {isCompleted && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {t('detail.results')}
                  </h4>
                  <div className="rounded-lg border p-4 space-y-2">
                    {fullReport?.row_count != null && (
                      <div className="flex justify-between py-1">
                        <span className="text-sm text-muted-foreground">{t('detail.rowCount')}</span>
                        <span className="text-sm font-medium">{fullReport.row_count}</span>
                      </div>
                    )}
                    {fullReport?.file_size != null && (
                      <div className="flex justify-between py-1">
                        <span className="text-sm text-muted-foreground">{t('detail.fileSize')}</span>
                        <span className="text-sm font-medium">{formatFileSize(fullReport.file_size)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Parameters */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.parameters')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  {hasParams ? (
                    <>
                      {params.from_date && params.to_date && (
                        <div className="flex justify-between py-1">
                          <span className="text-sm text-muted-foreground">{t('detail.dateRange')}</span>
                          <span className="text-sm font-medium">
                            {params.from_date} - {params.to_date}
                          </span>
                        </div>
                      )}
                      {params.employee_ids && params.employee_ids.length > 0 && (
                        <div className="flex justify-between py-1">
                          <span className="text-sm text-muted-foreground">{t('detail.employees')}</span>
                          <span className="text-sm font-medium">{params.employee_ids.length}</span>
                        </div>
                      )}
                      {params.department_ids && params.department_ids.length > 0 && (
                        <div className="flex justify-between py-1">
                          <span className="text-sm text-muted-foreground">{t('detail.departments')}</span>
                          <span className="text-sm font-medium">{params.department_ids.length}</span>
                        </div>
                      )}
                      {params.cost_center_ids && params.cost_center_ids.length > 0 && (
                        <div className="flex justify-between py-1">
                          <span className="text-sm text-muted-foreground">{t('detail.costCenters')}</span>
                          <span className="text-sm font-medium">{params.cost_center_ids.length}</span>
                        </div>
                      )}
                      {params.team_ids && params.team_ids.length > 0 && (
                        <div className="flex justify-between py-1">
                          <span className="text-sm text-muted-foreground">{t('detail.teams')}</span>
                          <span className="text-sm font-medium">{params.team_ids.length}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('detail.noParameters')}</p>
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
            <Button
              onClick={() => item && onDownload(item)}
              className="flex-1"
            >
              <Download className="mr-2 h-4 w-4" />
              {t('detail.download')}
            </Button>
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
