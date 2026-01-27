'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Download, UserCheck, UserX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BulkActionsProps {
  /** Number of selected items */
  selectedCount: number
  /** Set of selected employee IDs */
  selectedIds: Set<string>
  /** Callback to clear selection */
  onClear: () => void
}

/**
 * Bulk actions bar for employee management.
 * Shows when employees are selected.
 */
export function BulkActions({
  selectedCount,
  selectedIds,
  onClear,
}: BulkActionsProps) {
  const t = useTranslations('adminEmployees')
  const handleActivate = () => {
    // TODO: Implement bulk activate
    console.log('Activate', Array.from(selectedIds))
  }

  const handleDeactivate = () => {
    // TODO: Implement bulk deactivate
    console.log('Deactivate', Array.from(selectedIds))
  }

  const handleExport = () => {
    // TODO: Implement bulk export
    console.log('Export', Array.from(selectedIds))
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg ml-auto">
      <span className="text-sm font-medium">{t('selectedItems', { count: selectedCount })}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={handleActivate}>
          <UserCheck className="mr-1.5 h-3.5 w-3.5" />
          {t('activate')}
        </Button>
        <Button size="sm" variant="outline" onClick={handleDeactivate}>
          <UserX className="mr-1.5 h-3.5 w-3.5" />
          {t('deactivate')}
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {t('export')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
