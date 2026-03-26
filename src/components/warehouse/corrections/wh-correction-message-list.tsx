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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { WhCorrectionSeverityBadge } from './wh-correction-severity-badge'
import { useWhCorrectionMessages, useResolveBulkWhCorrection } from '@/hooks'
import { Badge } from '@/components/ui/badge'

interface WhCorrectionMessageListProps {
  onSelectMessage: (id: string) => void
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function WhCorrectionMessageList({ onSelectMessage }: WhCorrectionMessageListProps) {
  const t = useTranslations('warehouseCorrections')

  const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: t('filterAllStatuses') },
    { value: 'OPEN', label: t('filterOpen') },
    { value: 'RESOLVED', label: t('filterResolved') },
    { value: 'DISMISSED', label: t('filterDismissed') },
  ]

  const SEVERITY_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: t('filterAllSeverities') },
    { value: 'ERROR', label: t('filterError') },
    { value: 'WARNING', label: t('filterWarning') },
    { value: 'INFO', label: t('filterInfo') },
  ]

  const CODE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: t('filterAllCodes') },
    { value: 'NEGATIVE_STOCK', label: t('codeNegativeStock') },
    { value: 'DUPLICATE_RECEIPT', label: t('codeDuplicateReceipt') },
    { value: 'OVERDUE_ORDER', label: t('codeOverdueOrder') },
    { value: 'UNMATCHED_RECEIPT', label: t('codeUnmatchedReceipt') },
    { value: 'STOCK_MISMATCH', label: t('codeStockMismatch') },
    { value: 'LOW_STOCK_NO_ORDER', label: t('codeLowStockNoOrder') },
  ]

  const statusKeys: Record<string, string> = {
    OPEN: 'statusOpen',
    RESOLVED: 'statusResolved',
    DISMISSED: 'statusDismissed',
    IGNORED: 'statusDismissed',
  }

  const [status, setStatus] = React.useState<string>('OPEN')
  const [severity, setSeverity] = React.useState<string>('ALL')
  const [code, setCode] = React.useState<string>('ALL')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  const resolveBulk = useResolveBulkWhCorrection()

  const { data, isLoading } = useWhCorrectionMessages({
    status: status === 'ALL' ? undefined : (status as 'OPEN' | 'RESOLVED' | 'DISMISSED' | 'IGNORED'),
    severity: severity === 'ALL' ? undefined : (severity as 'ERROR' | 'WARNING' | 'INFO'),
    code: code === 'ALL' ? undefined : code,
    page,
    pageSize,
  })

  const items: Array<{ id: string; severity: string; code: string; message: string; createdAt: string | Date; status: string }> = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map((m) => m.id)))
    }
  }

  function handleBulkResolve() {
    if (selectedIds.size === 0) return
    resolveBulk.mutate(
      { ids: Array.from(selectedIds) },
      { onSuccess: () => setSelectedIds(new Set()) }
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(1) }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={code} onValueChange={(v) => { setCode(v); setPage(1) }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CODE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">
            {t('selectedCount', { count: selectedIds.size })}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkResolve}
            disabled={resolveBulk.isPending}
          >
            {t('bulkResolve')}
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={items.length > 0 && selectedIds.size === items.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-24">{t('colSeverity')}</TableHead>
              <TableHead>{t('colCode')}</TableHead>
              <TableHead className="max-w-md">{t('colMessage')}</TableHead>
              <TableHead>{t('colDate')}</TableHead>
              <TableHead>{t('colStatus')}</TableHead>
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
                  {t('noMessages')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((msg) => (
                <TableRow
                  key={msg.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectMessage(msg.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(msg.id)}
                      onCheckedChange={() => toggleSelect(msg.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <WhCorrectionSeverityBadge severity={msg.severity} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{msg.code}</TableCell>
                  <TableCell className="max-w-md truncate">{msg.message}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(msg.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={msg.status === 'OPEN' ? 'default' : 'outline'}>
                      {t((statusKeys[msg.status] ?? 'statusOpen') as Parameters<typeof t>[0])}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
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
