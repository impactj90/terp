'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useInboundEmailLog } from '@/hooks/useInboundEmailLog'

const PAGE_SIZE = 25

const STATUS_OPTIONS = [
  'all',
  'processed',
  'failed',
  'skipped_no_attachment',
  'skipped_no_pdf',
  'skipped_duplicate',
  'pending',
] as const

type EmailLogStatus = (typeof STATUS_OPTIONS)[number]

const STATUS_BADGE_VARIANT: Record<string, string> = {
  processed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  skipped_no_attachment: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  skipped_no_pdf: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  skipped_duplicate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

const formatDateTime = (d: string | Date | null | undefined) => {
  if (!d) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d))
}

export function InboundEmailLog() {
  const t = useTranslations('inboundInvoices')
  const locale = useLocale()
  const router = useRouter()

  const [statusFilter, setStatusFilter] = React.useState<EmailLogStatus>('all')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [debouncedSearch, setDebouncedSearch] = React.useState('')

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading } = useInboundEmailLog(
    {
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: debouncedSearch || undefined,
      page,
      pageSize: PAGE_SIZE,
    },
  )

  const entries = data?.items ?? []
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  function handleStatusChange(value: string) {
    setStatusFilter(value as EmailLogStatus)
    setPage(1)
  }

  if (isLoading && page === 1) {
    return (
      <div className="space-y-3">
        <div className="flex gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 flex-1" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`emailLog.status_${status}` as Parameters<typeof t>[0])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder={t('emailLog.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {t('emailLog.emptyState')}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('emailLog.colReceivedAt')}</TableHead>
                <TableHead>{t('emailLog.colFrom')}</TableHead>
                <TableHead>{t('emailLog.colSubject')}</TableHead>
                <TableHead>{t('emailLog.colStatus')}</TableHead>
                <TableHead className="text-right">{t('emailLog.colAttachments')}</TableHead>
                <TableHead>{t('emailLog.colInvoice')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(entry.receivedAt ?? entry.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {entry.fromEmail ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-[250px] truncate">
                    {entry.subject ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_BADGE_VARIANT[entry.status] ?? ''}
                    >
                      {t(`emailLog.status_${entry.status}` as Parameters<typeof t>[0])}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.attachmentCount ?? 0}
                  </TableCell>
                  <TableCell>
                    {entry.invoiceId ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() =>
                          router.push(`/${locale}/invoices/inbound/${entry.invoiceId}`)
                        }
                      >
                        {t('emailLog.viewInvoice')}
                      </Button>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('emailLog.pageInfo', { page, totalPages })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
            >
              {t('emailLog.previousPage')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
            >
              {t('emailLog.nextPage')}
            </Button>
          </div>
        </div>
      )}

      {isLoading && page > 1 && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
