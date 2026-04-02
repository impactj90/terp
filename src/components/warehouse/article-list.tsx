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
import { MoreHorizontal, Eye, Edit, Trash2, RotateCcw, ImageIcon } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
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
  primaryImageThumbnailUrl?: string | null
}

interface ArticleListProps {
  articles: WhArticleRow[]
  isLoading: boolean
  onView: (article: WhArticleRow) => void
  onEdit: (article: WhArticleRow) => void
  onDelete: (article: WhArticleRow) => void
  onRestore?: (article: WhArticleRow) => void
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void
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
  selectedIds,
  onSelectionChange,
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

  const allSelected = articles.length > 0 && selectedIds != null && articles.every((a) => selectedIds.has(a.id))
  const someSelected = selectedIds != null && selectedIds.size > 0 && !allSelected

  function toggleAll(checked: boolean) {
    if (!onSelectionChange) return
    if (checked) {
      onSelectionChange(new Set(articles.map((a) => a.id)))
    } else {
      onSelectionChange(new Set())
    }
  }

  function toggleOne(id: string, checked: boolean) {
    if (!onSelectionChange || !selectedIds) return
    const next = new Set(selectedIds)
    if (checked) {
      next.add(id)
    } else {
      next.delete(id)
    }
    onSelectionChange(next)
  }

  return (
    <>
      {/* Mobile: card list */}
      <div className="divide-y sm:hidden">
        {articles.map((article) => (
          <div
            key={article.id}
            className={`flex items-center gap-3 p-3 active:bg-muted/50 cursor-pointer ${article.stockTracking && article.currentStock < 0 ? 'bg-destructive/5' : ''}`}
            onClick={() => onView(article)}
          >
            {article.primaryImageThumbnailUrl ? (
              <img
                src={article.primaryImageThumbnailUrl}
                alt={article.name}
                className="h-10 w-10 rounded object-cover shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{article.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground font-mono">{article.number}</span>
                {article.stockTracking && (
                  <span className={`text-xs font-medium ${article.currentStock < 0 ? 'text-destructive' : ''}`}>
                    {article.currentStock} {article.unit}
                  </span>
                )}
                {!article.isActive && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t('statusInactive')}</Badge>
                )}
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Aktionen</span>
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
                    <DropdownMenuItem onClick={() => onDelete(article)} className="text-destructive">
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
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              {onSelectionChange && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={(checked) => toggleAll(!!checked)}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              <TableHead className="w-[50px]">{t('colThumbnail')}</TableHead>
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
                className={`cursor-pointer ${article.stockTracking && article.currentStock < 0 ? 'bg-destructive/5' : ''}`}
                onClick={() => onView(article)}
              >
                {onSelectionChange && (
                  <TableCell className="w-[40px]" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds?.has(article.id) ?? false}
                      onCheckedChange={(checked) => toggleOne(article.id, !!checked)}
                      aria-label={`Select ${article.name}`}
                    />
                  </TableCell>
                )}
                <TableCell className="w-[50px]">
                  {article.primaryImageThumbnailUrl ? (
                    <img
                      src={article.primaryImageThumbnailUrl}
                      alt={article.name}
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">{article.number}</TableCell>
                <TableCell className="font-medium">{article.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {article.group?.name || '—'}
                </TableCell>
                <TableCell>{article.unit}</TableCell>
                <TableCell className="text-right">{formatPrice(article.sellPrice)}</TableCell>
                <TableCell className={`text-right ${article.stockTracking && article.currentStock < 0 ? 'text-destructive font-medium' : ''}`}>
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
                        <span className="sr-only">Aktionen</span>
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
      </div>
    </>
  )
}
