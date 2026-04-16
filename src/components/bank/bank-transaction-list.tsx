'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useBankTransactions } from '@/hooks/useBankTransactions'

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

interface Props {
  status: 'unmatched' | 'matched' | 'ignored'
  onRowClick: (id: string) => void
}

export function BankTransactionList({ status, onRowClick }: Props) {
  const t = useTranslations('bankInbox')
  const { data, isLoading } = useBankTransactions(status)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data?.items ?? []) as any[]

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t(`list.empty.${status}`)}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('list.column.date')}</TableHead>
            <TableHead>{t('list.column.counterparty')}</TableHead>
            <TableHead>{t('list.column.remittance')}</TableHead>
            <TableHead>{t('list.column.direction')}</TableHead>
            <TableHead className="text-right">{t('list.column.amount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((tx) => (
            <TableRow
              key={tx.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onRowClick(tx.id)}
            >
              <TableCell>{formatDate(tx.valueDate)}</TableCell>
              <TableCell>
                <div>
                  <span className="font-medium">
                    {tx.counterpartyName ?? '-'}
                  </span>
                  {tx.suggestedAddress && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      → {tx.suggestedAddress.company}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="max-w-[300px] text-sm text-muted-foreground">
                <div className="truncate">{tx.remittanceInfo ?? '-'}</div>
                {status === 'ignored' && tx.ignoredReason && (
                  <div className="truncate text-xs italic mt-0.5">
                    {tx.ignoredReason}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {t(`direction.${tx.direction === 'CREDIT' ? 'credit' : 'debit'}`)}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(tx.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
