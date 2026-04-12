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
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Upload, Pencil } from 'lucide-react'
import {
  useBillingPriceListEntries,
  useDeleteBillingPriceListEntry,
} from '@/hooks'
import { PriceListEntryFormDialog } from './price-list-entry-form-dialog'
import { PriceListBulkImportDialog } from './price-list-bulk-import-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatDate(date: string | Date | null): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

interface PriceListEntriesTableProps {
  priceListId: string
  readonly?: boolean
}

export function PriceListEntriesTable({ priceListId, readonly }: PriceListEntriesTableProps) {
  const t = useTranslations('billingPriceListEntries')
  const tc = useTranslations('common')
  const { data: entries, isLoading } = useBillingPriceListEntries(priceListId)
  const deleteMutation = useDeleteBillingPriceListEntry()

  const [showEntryDialog, setShowEntryDialog] = React.useState(false)
  const [showBulkImport, setShowBulkImport] = React.useState(false)
  const [editingEntry, setEditingEntry] = React.useState<Record<string, unknown> | null>(null)
  const [deletingEntry, setDeletingEntry] = React.useState<{ id: string; description: string } | null>(null)

  const handleDelete = async () => {
    if (!deletingEntry) return
    try {
      await deleteMutation.mutateAsync({
        id: deletingEntry.id,
        priceListId,
      })
      toast.success(t('entryDeleted'))
      setDeletingEntry(null)
    } catch (err) {
      toast.error((err as Error).message || t('deleteError'))
    }
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      {!readonly && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setEditingEntry(null); setShowEntryDialog(true) }}>
            <Plus className="h-4 w-4 mr-1" />
            {t('newEntry')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowBulkImport(true)}>
            <Upload className="h-4 w-4 mr-1" />
            {t('bulkImport')}
          </Button>
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('articleOrKey')}</TableHead>
            <TableHead>{t('description')}</TableHead>
            <TableHead className="text-right">{t('unitPrice')}</TableHead>
            <TableHead className="text-right">{t('minQuantity')}</TableHead>
            <TableHead>{t('unit')}</TableHead>
            <TableHead>{t('validFrom')}</TableHead>
            <TableHead>{t('validTo')}</TableHead>
            {!readonly && <TableHead className="w-[80px]">{t('actions')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={readonly ? 7 : 8} className="text-center text-muted-foreground">
                {t('loading')}
              </TableCell>
            </TableRow>
          ) : !entries?.length ? (
            <TableRow>
              <TableCell colSpan={readonly ? 7 : 8} className="text-center text-muted-foreground">
                {t('noEntries')}
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => {
              const article = (entry as unknown as { article?: { number: string; name: string } | null }).article
              return (
              <TableRow key={entry.id}>
                <TableCell className="text-sm">
                  {article
                    ? <span><span className="font-mono text-xs mr-1">{article.number}</span> {article.name}</span>
                    : entry.itemKey || '-'}
                </TableCell>
                <TableCell>{entry.description || '-'}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(entry.unitPrice)}
                </TableCell>
                <TableCell className="text-right">
                  {entry.minQuantity != null ? entry.minQuantity : '-'}
                </TableCell>
                <TableCell>{entry.unit || '-'}</TableCell>
                <TableCell>{formatDate(entry.validFrom)}</TableCell>
                <TableCell>{formatDate(entry.validTo)}</TableCell>
                {!readonly && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingEntry(entry as unknown as Record<string, unknown>)
                              setShowEntryDialog(true)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{tc('edit')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setDeletingEntry({
                              id: entry.id,
                              description: entry.description || entry.itemKey || t('entry'),
                            })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{tc('delete')}</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            )})
          )}
        </TableBody>
      </Table>

      {/* Entry Form Dialog */}
      <PriceListEntryFormDialog
        open={showEntryDialog}
        onOpenChange={setShowEntryDialog}
        priceListId={priceListId}
        editItem={editingEntry}
      />

      {/* Bulk Import Dialog */}
      <PriceListBulkImportDialog
        open={showBulkImport}
        onOpenChange={setShowBulkImport}
        priceListId={priceListId}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deletingEntry}
        onOpenChange={(open) => { if (!open) setDeletingEntry(null) }}
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: deletingEntry?.description ?? '' })}
        onConfirm={handleDelete}
        confirmLabel={t('deleteConfirm')}
        variant="destructive"
      />
    </div>
  )
}
