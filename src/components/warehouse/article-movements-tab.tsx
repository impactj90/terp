'use client'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslations } from 'next-intl'
import { useWhArticleMovements } from '@/hooks/use-wh-stock-movements'

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

interface ArticleMovementsTabProps {
  articleId: string
}

export function ArticleMovementsTab({ articleId }: ArticleMovementsTabProps) {
  const t = useTranslations('warehouseStockMovements')
  const { data: movements, isLoading } = useWhArticleMovements(articleId)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!movements?.length) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          {t('articleTabEmpty')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('articleTabTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 sm:p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">{t('colDate')}</TableHead>
              <TableHead className="w-[140px]">{t('colType')}</TableHead>
              <TableHead className="w-[100px] text-right">{t('colQuantity')}</TableHead>
              <TableHead className="w-[100px] text-right">{t('colPreviousStock')}</TableHead>
              <TableHead className="w-[100px] text-right">{t('colNewStock')}</TableHead>
              <TableHead>{t('colReference')}</TableHead>
              <TableHead>{t('colReason')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.map((movement) => {
              const movType = movement.type as MovementType
              return (
                <TableRow key={movement.id}>
                  <TableCell className="text-sm">{formatDate(movement.date)}</TableCell>
                  <TableCell>
                    <Badge variant={typeVariants[movType]}>
                      {t(typeKeys[movType] as Parameters<typeof t>[0])}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono ${movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
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
      </CardContent>
    </Card>
  )
}
