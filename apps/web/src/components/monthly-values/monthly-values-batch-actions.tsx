'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Lock, Unlock, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

interface MonthlyValuesBatchActionsProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onClearSelection: () => void
  onBatchClose: () => void
  onBatchReopen: () => void
  onRecalculate: () => void
  isLoading: boolean
  className?: string
}

export function MonthlyValuesBatchActions({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onBatchClose,
  onBatchReopen,
  onRecalculate,
  isLoading,
  className,
}: MonthlyValuesBatchActionsProps) {
  const t = useTranslations('monthlyValues')

  if (totalCount === 0) {
    return null
  }

  const allSelected = selectedCount > 0 && selectedCount === totalCount
  const isIndeterminate = selectedCount > 0 && selectedCount < totalCount

  const handleSelectAllChange = (value: boolean | 'indeterminate') => {
    if (value === true || value === 'indeterminate') {
      onSelectAll()
    } else {
      onClearSelection()
    }
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Checkbox
          checked={allSelected ? true : isIndeterminate ? 'indeterminate' : false}
          onCheckedChange={handleSelectAllChange}
          disabled={isLoading}
          aria-label={t('batch.selectAll')}
        />
        <span className="text-sm text-muted-foreground">{t('batch.selectAll')}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {t('batch.selectedCount', { count: selectedCount })}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={onBatchClose}
          disabled={isLoading || selectedCount === 0}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Lock className="mr-2 h-4 w-4" />
          )}
          {t('batch.closeSelected')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onBatchReopen}
          disabled={isLoading || selectedCount === 0}
        >
          <Unlock className="mr-2 h-4 w-4" />
          {t('batch.reopenSelected')}
        </Button>
        <Button size="sm" variant="outline" onClick={onRecalculate} disabled={isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('batch.recalculate')}
        </Button>
      </div>
    </div>
  )
}
