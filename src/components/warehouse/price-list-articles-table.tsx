'use client'

import * as React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchInput } from '@/components/ui/search-input'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useWhPriceListArticles, useSetWhArticlePrice } from '@/hooks'
import { ArticleSearchPopover } from './article-search-popover'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

interface PriceListArticlesTableProps {
  priceListId: string | null
  selectedArticleId: string | null
  onSelectArticle: (articleId: string) => void
  canManage?: boolean
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

export function PriceListArticlesTable({
  priceListId,
  selectedArticleId,
  onSelectArticle,
  canManage = false,
}: PriceListArticlesTableProps) {
  const t = useTranslations('warehousePrices')
  const [search, setSearch] = React.useState('')
  const [showAddArticle, setShowAddArticle] = React.useState(false)

  const { data: entries, isLoading } = useWhPriceListArticles(
    priceListId || '',
    search || undefined,
    !!priceListId
  )
  const setPrice = useSetWhArticlePrice()

  function handleAddArticle(articleId: string, _name: string) {
    if (!priceListId) return
    setPrice.mutate(
      { priceListId, articleId, unitPrice: 0 },
      {
        onSuccess: () => {
          toast.success(t('priceSaved'))
          setShowAddArticle(false)
          onSelectArticle(articleId)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  if (!priceListId) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full text-muted-foreground text-sm py-12">
          {t('selectPriceList')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">{t('title')}</CardTitle>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddArticle(!showAddArticle)}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('addArticle')}
            </Button>
          )}
        </div>
        {showAddArticle && (
          <div className="mt-2">
            <ArticleSearchPopover
              value={null}
              onSelect={handleAddArticle}
              placeholder={t('addArticle')}
            />
          </div>
        )}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="mt-2"
        />
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0">
        {isLoading ? (
          <div className="space-y-2 px-6 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !entries || entries.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            {t('noEntries')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('articleNumber')}</TableHead>
                <TableHead>{t('articleName')}</TableHead>
                <TableHead className="text-right">{t('unitPrice')}</TableHead>
                <TableHead>{t('unit')}</TableHead>
                <TableHead className="text-right">{t('minQuantity')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry: { id: string; articleId: string | null; unitPrice: number; unit: string | null; minQuantity: number | null; article: { id: string; number: string; name: string; unit: string } }) => (
                <TableRow
                  key={entry.id}
                  onClick={() => entry.articleId && onSelectArticle(entry.articleId)}
                  className={cn(
                    'cursor-pointer',
                    selectedArticleId === entry.articleId && 'bg-accent'
                  )}
                >
                  <TableCell className="font-mono text-xs">{entry.article.number}</TableCell>
                  <TableCell>{entry.article.name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(entry.unitPrice)}</TableCell>
                  <TableCell>{entry.unit || entry.article.unit}</TableCell>
                  <TableCell className="text-right">{entry.minQuantity ?? '\u2014'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
