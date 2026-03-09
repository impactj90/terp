'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

interface ApprovalBulkActionsProps {
  selectedCount: number
  totalCount: number
  isLoading?: boolean
  onSelectAll: () => void
  onClearSelection: () => void
  onBulkApprove: () => void
  disabled?: boolean
  className?: string
}

export function ApprovalBulkActions({
  selectedCount,
  totalCount,
  isLoading = false,
  onSelectAll,
  onClearSelection,
  onBulkApprove,
  disabled = false,
  className,
}: ApprovalBulkActionsProps) {
  const t = useTranslations('adminApprovals')

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
          checked={
            allSelected ? true : isIndeterminate ? 'indeterminate' : false
          }
          onCheckedChange={handleSelectAllChange}
          disabled={disabled}
          aria-label={t('selectAll')}
        />
        <span className="text-sm text-muted-foreground">{t('selectAll')}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {t('selectedCount', { count: selectedCount })}
        </span>
        <Button
          size="sm"
          onClick={onBulkApprove}
          disabled={disabled || selectedCount === 0 || isLoading}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('bulkApprove')}
        </Button>
      </div>
    </div>
  )
}
