'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useWhArticlePrices } from '@/hooks'
import { useTranslations } from 'next-intl'

interface ArticlePriceTabProps {
  articleId: string
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '\u2014'
  return new Date(date).toLocaleDateString('de-DE')
}

export function ArticlePriceTab({ articleId }: ArticlePriceTabProps) {
  const t = useTranslations('warehousePrices')
  const { data: entries, isLoading } = useWhArticlePrices(articleId)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!entries || entries.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          {t('noPriceListEntries')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('priceListName')}</TableHead>
              <TableHead className="text-right">{t('unitPrice')}</TableHead>
              <TableHead className="text-right">{t('minQuantity')}</TableHead>
              <TableHead>{t('unit')}</TableHead>
              <TableHead>{t('validFrom')}</TableHead>
              <TableHead>{t('validTo')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry: {
              id: string
              unitPrice: number
              minQuantity: number | null
              unit: string | null
              validFrom: string | Date | null
              validTo: string | Date | null
              priceList: {
                id: string
                name: string
                isDefault: boolean
                isActive: boolean
              }
            }) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <span className="mr-2">{entry.priceList.name}</span>
                  {entry.priceList.isDefault && (
                    <Badge variant="secondary" className="text-xs">
                      {t('defaultBadge')}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(entry.unitPrice)}</TableCell>
                <TableCell className="text-right">{entry.minQuantity ?? '\u2014'}</TableCell>
                <TableCell>{entry.unit ?? '\u2014'}</TableCell>
                <TableCell>{formatDate(entry.validFrom)}</TableCell>
                <TableCell>{formatDate(entry.validTo)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  )
}
