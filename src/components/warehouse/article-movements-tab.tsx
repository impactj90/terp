'use client'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslations } from 'next-intl'
import { useWhArticleMovements } from '@/hooks/use-wh-stock-movements'
import {
  Building2, ClipboardList, FileText, Wrench, Package,
} from 'lucide-react'

type MovementType = 'GOODS_RECEIPT' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'INVENTORY' | 'RETURN' | 'DELIVERY_NOTE'

const typeVariants: Record<MovementType, 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'cyan'> = {
  GOODS_RECEIPT: 'green',
  WITHDRAWAL: 'red',
  ADJUSTMENT: 'yellow',
  INVENTORY: 'blue',
  RETURN: 'purple',
  DELIVERY_NOTE: 'cyan',
}

const typeKeys: Record<MovementType, string> = {
  GOODS_RECEIPT: 'typeGoodsReceipt',
  WITHDRAWAL: 'typeWithdrawal',
  ADJUSTMENT: 'typeAdjustment',
  INVENTORY: 'typeInventory',
  RETURN: 'typeReturn',
  DELIVERY_NOTE: 'typeDeliveryNote',
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

function ReferenceDisplay({ movement }: {
  movement: {
    purchaseOrder?: { id: string; number: string } | null
    serviceObjectId?: string | null
    serviceObject?: { id: string; number: string; name: string } | null
    orderId?: string | null
    documentId?: string | null
    machineId?: string | null
  }
}) {
  if (movement.purchaseOrder) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Package className="h-3.5 w-3.5 text-sky-500" />
        <span className="font-mono">{movement.purchaseOrder.number}</span>
      </div>
    )
  }
  if (movement.serviceObjectId) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Building2 className="h-3.5 w-3.5 text-emerald-500" />
        {movement.serviceObject ? (
          <span>
            <span className="font-mono">{movement.serviceObject.number}</span>{' '}
            <span className="text-muted-foreground">{movement.serviceObject.name}</span>
          </span>
        ) : (
          <span className="font-mono">{movement.serviceObjectId.slice(0, 8)}...</span>
        )}
      </div>
    )
  }
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
  return <span className="text-xs text-muted-foreground">{'—'}</span>
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
              <TableHead>{t('colCreatedBy')}</TableHead>
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
                    <ReferenceDisplay movement={movement} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {movement.reason || '\u2014'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {movement.createdBy?.displayName ?? '\u2014'}
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
