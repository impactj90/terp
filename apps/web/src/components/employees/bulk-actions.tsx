'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Download, Loader2, Tag, UserCheck, UserX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBulkAssignTariff, useTariffs } from '@/hooks/api'

interface BulkFilters {
  search?: string
  departmentId?: string
  isActive?: boolean
}

interface BulkActionsProps {
  /** Number of selected items */
  selectedCount: number
  /** Set of selected employee IDs */
  selectedIds: Set<string>
  /** Callback to clear selection */
  onClear: () => void
  /** Current filters for bulk scope */
  filters?: BulkFilters
}

/**
 * Bulk actions bar for employee management.
 * Shows when employees are selected.
 */
export function BulkActions({
  selectedCount,
  selectedIds,
  onClear,
  filters,
}: BulkActionsProps) {
  const t = useTranslations('adminEmployees')
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [assignScope, setAssignScope] = React.useState<'selected' | 'filtered'>('selected')
  const [tariffId, setTariffId] = React.useState('__none__')
  const [error, setError] = React.useState<string | null>(null)

  const bulkAssignTariff = useBulkAssignTariff()
  const { data: tariffsData, isLoading: loadingTariffs } = useTariffs({
    active: true,
    enabled: assignOpen,
  })

  const tariffs = tariffsData?.data ?? []
  const hasFilters = Boolean(filters?.search || filters?.departmentId || filters?.isActive !== undefined)

  React.useEffect(() => {
    if (assignOpen) {
      setAssignScope('selected')
      setTariffId('__none__')
      setError(null)
    }
  }, [assignOpen])

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

  const handleAssignTariff = async () => {
    setError(null)

    try {
      const body: Record<string, unknown> = {
        tariff_id: tariffId === '__none__' ? null : tariffId,
      }

      if (assignScope === 'selected') {
        body.employee_ids = Array.from(selectedIds)
      } else {
        const filter: Record<string, unknown> = {}
        if (filters?.search) filter.q = filters.search
        if (filters?.departmentId) filter.department_id = filters.departmentId
        if (filters?.isActive !== undefined) filter.is_active = filters.isActive
        body.filter = filter
      }

      await bulkAssignTariff.mutateAsync({ body })
      setAssignOpen(false)
      onClear()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('bulkTariffError'))
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg ml-auto">
      <span className="text-sm font-medium">{t('selectedItems', { count: selectedCount })}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
          <Tag className="mr-1.5 h-3.5 w-3.5" />
          {t('assignTariff')}
        </Button>
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

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('bulkTariffTitle')}</DialogTitle>
            <DialogDescription>{t('bulkTariffDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('bulkTariffScopeLabel')}</Label>
              <RadioGroup
                value={assignScope}
                onValueChange={(value) => setAssignScope(value as 'selected' | 'filtered')}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="selected" id="scope-selected" />
                  <Label htmlFor="scope-selected">
                    {t('bulkTariffScopeSelected', { count: selectedCount })}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="filtered" id="scope-filtered" />
                  <Label htmlFor="scope-filtered">
                    {hasFilters ? t('bulkTariffScopeFiltered') : t('bulkTariffScopeAll')}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>{t('bulkTariffSelectLabel')}</Label>
              <Select
                value={tariffId}
                onValueChange={setTariffId}
                disabled={loadingTariffs || bulkAssignTariff.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('bulkTariffSelectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('none')}</SelectItem>
                  {tariffs.map((tariff) => (
                    <SelectItem key={tariff.id} value={tariff.id}>
                      {tariff.code} - {tariff.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={bulkAssignTariff.isPending}>
              {t('cancel')}
            </Button>
            <Button onClick={handleAssignTariff} disabled={bulkAssignTariff.isPending}>
              {bulkAssignTariff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('bulkTariffApply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
