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

type MovementType = 'WITHDRAWAL' | 'RETURN' | 'DELIVERY_NOTE'

type StockMovementHistoryItem = {
  id: string
  articleNumber: string
  articleName: string
  type: MovementType
  quantity: number
  date: Date | string
  createdBy: { userId: string; displayName: string } | null
  reason: string | null
  notes: string | null
}

interface Props {
  items: StockMovementHistoryItem[]
}

const typeVariants: Record<
  MovementType,
  'red' | 'purple' | 'cyan'
> = {
  WITHDRAWAL: 'red',
  RETURN: 'purple',
  DELIVERY_NOTE: 'cyan',
}

const typeKeys: Record<MovementType, 'typeWithdrawal' | 'typeReturn' | 'typeDeliveryNote'> =
  {
    WITHDRAWAL: 'typeWithdrawal',
    RETURN: 'typeReturn',
    DELIVERY_NOTE: 'typeDeliveryNote',
  }

function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function formatQty(qty: number): string {
  if (qty > 0) return `+${qty}`
  return `${qty}`
}

export function ServiceObjectHistoryMovementsTable({ items }: Props) {
  const t = useTranslations('serviceObjects.history')
  const tMov = useTranslations('warehouseStockMovements')

  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        {t('emptyMovements')}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[160px]">{t('colDate')}</TableHead>
            <TableHead className="w-[140px]">{t('colType')}</TableHead>
            <TableHead>{t('colArticle')}</TableHead>
            <TableHead className="w-[100px] text-right">
              {t('colQuantity')}
            </TableHead>
            <TableHead>{t('colUser')}</TableHead>
            <TableHead>{t('colReason')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="text-sm">
                {formatDateTime(m.date)}
              </TableCell>
              <TableCell>
                <Badge variant={typeVariants[m.type]}>
                  {tMov(typeKeys[m.type])}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {m.articleNumber}
                </span>{' '}
                <span>{m.articleName}</span>
              </TableCell>
              <TableCell
                className={`text-right font-mono text-sm ${
                  m.quantity > 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {formatQty(m.quantity)}
              </TableCell>
              <TableCell className="text-sm">
                {m.createdBy?.displayName ?? '—'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {[m.reason, m.notes].filter(Boolean).join(' — ') || '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
