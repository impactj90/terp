'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MoreHorizontal, Eye, Edit, Trash2, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface WhArticleRow {
  id: string
  number: string
  name: string
  unit: string
  sellPrice: number | null
  currentStock: number
  stockTracking: boolean
  isActive: boolean
  group?: { id: string; name: string } | null
}

interface ArticleListProps {
  articles: WhArticleRow[]
  isLoading: boolean
  onView: (article: WhArticleRow) => void
  onEdit: (article: WhArticleRow) => void
  onDelete: (article: WhArticleRow) => void
  onRestore?: (article: WhArticleRow) => void
}

function formatPrice(price: number | null): string {
  if (price === null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(price)
}

export function ArticleList({
  articles,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onRestore,
}: ArticleListProps) {
  const t = useTranslations('warehouseArticles')

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('noArticlesFound')}
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">{t('colNumber')}</TableHead>
          <TableHead>{t('colName')}</TableHead>
          <TableHead>{t('colGroup')}</TableHead>
          <TableHead className="w-[80px]">{t('colUnit')}</TableHead>
          <TableHead className="w-[120px] text-right">{t('colSellPrice')}</TableHead>
          <TableHead className="w-[100px] text-right">{t('colStock')}</TableHead>
          <TableHead className="w-[80px]">{t('colStatus')}</TableHead>
          <TableHead className="w-[60px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {articles.map((article) => (
          <TableRow
            key={article.id}
            className="cursor-pointer"
            onClick={() => onView(article)}
          >
            <TableCell className="font-mono text-sm">{article.number}</TableCell>
            <TableCell className="font-medium">{article.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {article.group?.name || '—'}
            </TableCell>
            <TableCell>{article.unit}</TableCell>
            <TableCell className="text-right">{formatPrice(article.sellPrice)}</TableCell>
            <TableCell className="text-right">
              {article.stockTracking ? article.currentStock : '—'}
            </TableCell>
            <TableCell>
              {article.isActive ? (
                <Badge variant="default">{t('statusActive')}</Badge>
              ) : (
                <Badge variant="secondary">{t('statusInactive')}</Badge>
              )}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(article)}>
                    <Eye className="h-4 w-4 mr-2" />
                    {t('actionView')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(article)}>
                    <Edit className="h-4 w-4 mr-2" />
                    {t('actionEdit')}
                  </DropdownMenuItem>
                  {article.isActive ? (
                    <DropdownMenuItem
                      onClick={() => onDelete(article)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('actionDeactivate')}
                    </DropdownMenuItem>
                  ) : (
                    onRestore && (
                      <DropdownMenuItem onClick={() => onRestore(article)}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {t('actionRestore')}
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
