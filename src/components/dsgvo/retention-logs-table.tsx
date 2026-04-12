'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useDsgvoLogs } from '@/hooks'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 20

export function RetentionLogsTable() {
  const t = useTranslations('dsgvo')
  const [page, setPage] = React.useState(1)
  const { data, isLoading } = useDsgvoLogs({ page, pageSize: PAGE_SIZE })

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data?.items ?? []) as Array<Record<string, any>>

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {t('logs.noLogs')}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('logs.executedAt')}</TableHead>
              <TableHead>{t('logs.dataType')}</TableHead>
              <TableHead>{t('logs.action')}</TableHead>
              <TableHead className="text-right">{t('logs.recordCount')}</TableHead>
              <TableHead>{t('logs.cutoffDate')}</TableHead>
              <TableHead>{t('logs.durationMs')}</TableHead>
              <TableHead>{t('logs.executedBy')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(log.executedAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  {t(`dataTypes.${log.dataType}` as Parameters<typeof t>[0])}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={log.action === 'DELETE' ? 'destructive' : 'secondary'}
                  >
                    {t(`actions.${log.action}` as Parameters<typeof t>[0])}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {log.recordCount.toLocaleString()}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {new Date(log.cutoffDate).toLocaleDateString()}
                </TableCell>
                <TableCell className="tabular-nums">
                  {log.durationMs != null ? `${log.durationMs}ms` : '-'}
                </TableCell>
                <TableCell>
                  {log.executedBy ? (
                    <span className="text-xs font-mono">{log.executedBy.slice(0, 8)}...</span>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {t('logs.cron')}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {data.total} {t('logs.recordCount')}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
