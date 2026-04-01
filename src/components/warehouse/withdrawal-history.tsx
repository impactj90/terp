'use client'

import * as React from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ClipboardList, FileText, Wrench, PackageMinus, Undo2, History, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { useWhWithdrawals } from '@/hooks/use-wh-withdrawals'
import { WithdrawalCancelDialog } from './withdrawal-cancel-dialog'

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '\u2014'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function formatQuantity(qty: number): string {
  if (qty > 0) return `+${qty}`
  return `${qty}`
}

function ReferenceDisplay({ movement }: {
  movement: { orderId?: string | null; documentId?: string | null; machineId?: string | null }
}) {
  if (movement.orderId) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <ClipboardList className="h-3.5 w-3.5 text-blue-500" />
        <span className="font-mono">{movement.orderId.slice(0, 8)}...</span>
      </div>
    )
  }
  if (movement.documentId) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <FileText className="h-3.5 w-3.5 text-violet-500" />
        <span className="font-mono">{movement.documentId.slice(0, 8)}...</span>
      </div>
    )
  }
  if (movement.machineId) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Wrench className="h-3.5 w-3.5 text-amber-500" />
        <span className="font-mono">{movement.machineId}</span>
      </div>
    )
  }
  return <span className="text-xs text-muted-foreground">{'\u2014'}</span>
}

export function WithdrawalHistory() {
  const t = useTranslations('warehouseWithdrawals')

  const [page, setPage] = React.useState(1)
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [cancelMovementId, setCancelMovementId] = React.useState<string | null>(null)

  const { data, isLoading } = useWhWithdrawals({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize: 25,
  })

  const totalPages = data?.total ? Math.ceil(data.total / 25) : 0

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('filterDateFrom')}</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="w-[160px] h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('filterDateTo')}</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="w-[160px] h-9"
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-muted-foreground"
            onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
          >
            {t('actionCancel')}
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <History className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">{t('historyEmpty')}</p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="divide-y rounded-lg border sm:hidden">
            {data.items.map((movement) => {
              const isReversal = movement.quantity > 0
              return (
                <div key={movement.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{movement.article?.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-muted-foreground">{movement.article?.number}</span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium whitespace-nowrap [&>svg]:size-2.5',
                            isReversal
                              ? 'text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                              : 'text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                          )}
                        >
                          {isReversal ? (
                            <><Undo2 /> {t('reversalLabel')}</>
                          ) : (
                            <><PackageMinus /> {t('withdrawalLabel')}</>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className={cn(
                        'text-sm font-mono font-semibold',
                        movement.quantity > 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      )}>
                        {formatQuantity(movement.quantity)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">{formatDate(movement.date)}</span>
                    {!isReversal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600"
                        onClick={() => setCancelMovementId(movement.id)}
                      >
                        {t('actionCancelWithdrawal')}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[160px]">{t('colDate')}</TableHead>
                  <TableHead>{t('colArticle')}</TableHead>
                  <TableHead className="w-[100px] text-right">{t('colQuantity')}</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                  <TableHead className="w-[160px]">{t('colReference')}</TableHead>
                  <TableHead className="w-[100px]">{t('colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((movement) => {
                  const isReversal = movement.quantity > 0
                  return (
                    <TableRow key={movement.id} className="group">
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {formatDate(movement.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs shrink-0">
                            {movement.article?.number}
                          </Badge>
                          <span className="text-sm">{movement.article?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          'font-mono font-semibold tabular-nums',
                          movement.quantity > 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        )}>
                          {formatQuantity(movement.quantity)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3',
                            isReversal
                              ? 'text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                              : 'text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                          )}
                        >
                          {isReversal ? (
                            <><Undo2 className="h-3 w-3" /> {t('reversalLabel')}</>
                          ) : (
                            <><PackageMinus className="h-3 w-3" /> {t('withdrawalLabel')}</>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ReferenceDisplay movement={movement} />
                      </TableCell>
                      <TableCell>
                        {!isReversal && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setCancelMovementId(movement.id)}
                          >
                            {t('actionCancelWithdrawal')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Cancel Dialog */}
      {cancelMovementId && (
        <WithdrawalCancelDialog
          movementId={cancelMovementId}
          open={!!cancelMovementId}
          onOpenChange={(open) => { if (!open) setCancelMovementId(null) }}
          onSuccess={() => setCancelMovementId(null)}
        />
      )}
    </div>
  )
}
