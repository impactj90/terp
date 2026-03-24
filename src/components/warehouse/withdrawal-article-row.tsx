'use client'

import { TableCell, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export interface WithdrawalArticleInfo {
  id: string
  number: string
  name: string
  unit: string
  currentStock: number
  minStock?: number | null
}

interface WithdrawalArticleRowProps {
  article: WithdrawalArticleInfo
  quantity: number
  onChange: (articleId: string, quantity: number) => void
  onRemove: (articleId: string) => void
}

export function WithdrawalArticleRow({
  article,
  quantity,
  onChange,
  onRemove,
}: WithdrawalArticleRowProps) {
  const t = useTranslations('warehouseWithdrawals')
  const isOverStock = quantity > article.currentStock
  const isBelowMin = article.minStock != null && article.currentStock - quantity < article.minStock
  const isActive = quantity > 0 && !isOverStock

  return (
    <TableRow className={cn(
      'transition-colors',
      isOverStock && 'bg-destructive/5',
    )}>
      <TableCell>
        <Badge variant="outline" className="font-mono text-xs">
          {article.number}
        </Badge>
      </TableCell>
      <TableCell className="font-medium text-sm">{article.name}</TableCell>
      <TableCell className="text-right">
        <span className="font-mono text-sm tabular-nums">{article.currentStock}</span>
      </TableCell>
      <TableCell className="w-[140px]">
        <div className="space-y-1">
          <Input
            type="number"
            min={1}
            max={article.currentStock}
            step={1}
            value={quantity || ''}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0
              onChange(article.id, val)
            }}
            className={cn(
              'w-24 text-right font-mono tabular-nums',
              isOverStock && 'border-red-400 focus-visible:ring-red-400'
            )}
          />
          {isOverStock && (
            <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{t('errorInsufficientStock', { available: article.currentStock })}</span>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{article.unit}</TableCell>
      <TableCell>
        {isBelowMin && !isOverStock && (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 gap-1">
            <AlertTriangle className="h-3 w-3" />
            {t('warningLowStock')}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600"
          onClick={() => onRemove(article.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}
