'use client'

import * as React from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useTranslations } from 'next-intl'
import { useWhStockMovements } from '@/hooks/use-wh-stock-movements'

type MovementType = 'GOODS_RECEIPT' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'INVENTORY' | 'RETURN'

const typeVariants: Record<MovementType, 'green' | 'red' | 'yellow' | 'blue' | 'purple'> = {
  GOODS_RECEIPT: 'green',
  WITHDRAWAL: 'red',
  ADJUSTMENT: 'yellow',
  INVENTORY: 'blue',
  RETURN: 'purple',
}

const typeKeys: Record<MovementType, string> = {
  GOODS_RECEIPT: 'typeGoodsReceipt',
  WITHDRAWAL: 'typeWithdrawal',
  ADJUSTMENT: 'typeAdjustment',
  INVENTORY: 'typeInventory',
  RETURN: 'typeReturn',
}

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

export function StockMovementList() {
  const t = useTranslations('warehouseStockMovements')

  const [typeFilter, setTypeFilter] = React.useState<string>('ALL')
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useWhStockMovements({
    type: typeFilter !== 'ALL' ? typeFilter as MovementType : undefined,
    page,
    pageSize: 25,
  })

  return (
    <div className="space-y-4">
      {/* Page heading */}
      <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t('filterAllTypes')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('filterAllTypes')}</SelectItem>
            <SelectItem value="GOODS_RECEIPT">{t('typeGoodsReceipt')}</SelectItem>
            <SelectItem value="WITHDRAWAL">{t('typeWithdrawal')}</SelectItem>
            <SelectItem value="ADJUSTMENT">{t('typeAdjustment')}</SelectItem>
            <SelectItem value="INVENTORY">{t('typeInventory')}</SelectItem>
            <SelectItem value="RETURN">{t('typeReturn')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <div className="text-center py-8 text-muted-foreground">
          {t('noMovementsFound')}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">{t('colDate')}</TableHead>
                <TableHead>{t('colArticle')}</TableHead>
                <TableHead className="w-[140px]">{t('colType')}</TableHead>
                <TableHead className="w-[100px] text-right">{t('colQuantity')}</TableHead>
                <TableHead className="w-[120px] text-right">{t('colPreviousStock')}</TableHead>
                <TableHead className="w-[120px] text-right">{t('colNewStock')}</TableHead>
                <TableHead className="w-[120px]">{t('colReference')}</TableHead>
                <TableHead>{t('colReason')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((movement) => {
                const movType = movement.type as MovementType
                return (
                  <TableRow key={movement.id}>
                    <TableCell className="text-sm">{formatDate(movement.date)}</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {movement.article?.number}
                        </span>
                        <span className="ml-2">{movement.article?.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeVariants[movType]}>
                        {t(typeKeys[movType] as Parameters<typeof t>[0])}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-mono ${movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatQuantity(movement.quantity)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {movement.previousStock}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {movement.newStock}
                    </TableCell>
                    <TableCell>
                      {movement.purchaseOrder ? (
                        <span className="text-sm font-mono">
                          {movement.purchaseOrder.number}
                        </span>
                      ) : (
                        '\u2014'
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {movement.reason || '\u2014'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          {data.total > 25 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                &laquo;
              </Button>
              <span className="text-sm leading-8">
                {page} / {Math.ceil(data.total / 25)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(data.total / 25)}
                onClick={() => setPage(page + 1)}
              >
                &raquo;
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
