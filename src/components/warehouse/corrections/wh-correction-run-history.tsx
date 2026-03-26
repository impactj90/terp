'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { useWhCorrectionRuns } from '@/hooks'

function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(startedAt: string | Date, completedAt: string | Date | null): string | null {
  if (!completedAt) return null
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function WhCorrectionRunHistory() {
  const t = useTranslations('warehouseCorrections')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  const { data, isLoading } = useWhCorrectionRuns({ page, pageSize })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colStarted')}</TableHead>
              <TableHead>{t('colCompleted')}</TableHead>
              <TableHead>{t('colTrigger')}</TableHead>
              <TableHead className="text-right">{t('colChecks')}</TableHead>
              <TableHead className="text-right">{t('colIssues')}</TableHead>
              <TableHead className="text-right">{t('colDuration')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t('loading')}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t('noRuns')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(run.startedAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {run.completedAt ? formatDateTime(run.completedAt) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={run.trigger === 'MANUAL' ? 'default' : 'secondary'}>
                      {run.trigger === 'MANUAL' ? t('triggerManual') : t('triggerAutomatic')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{run.checksRun}</TableCell>
                  <TableCell className="text-right">
                    <span className={run.issuesFound > 0 ? 'font-medium text-destructive' : ''}>
                      {run.issuesFound}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatDuration(run.startedAt, run.completedAt) ?? t('running')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={pageSize}
          onPageChange={setPage}
          onLimitChange={(v) => { setPageSize(v); setPage(1) }}
        />
      )}
    </div>
  )
}
