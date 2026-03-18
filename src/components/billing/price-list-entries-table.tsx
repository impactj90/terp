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
import { toast } from 'sonner'

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
      toast.success('Eintrag gelöscht')
      setDeletingEntry(null)
    } catch (err) {
      toast.error((err as Error).message || 'Fehler beim Löschen')
    }
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      {!readonly && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setEditingEntry(null); setShowEntryDialog(true) }}>
            <Plus className="h-4 w-4 mr-1" />
            Neuer Eintrag
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowBulkImport(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Massenimport
          </Button>
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Artikel / Schlüssel</TableHead>
            <TableHead>Beschreibung</TableHead>
            <TableHead className="text-right">Einzelpreis</TableHead>
            <TableHead className="text-right">Ab Menge</TableHead>
            <TableHead>Einheit</TableHead>
            <TableHead>Gültig von</TableHead>
            <TableHead>Gültig bis</TableHead>
            {!readonly && <TableHead className="w-[80px]">Aktionen</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={readonly ? 7 : 8} className="text-center text-muted-foreground">
                Laden...
              </TableCell>
            </TableRow>
          ) : !entries?.length ? (
            <TableRow>
              <TableCell colSpan={readonly ? 7 : 8} className="text-center text-muted-foreground">
                Keine Einträge vorhanden
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-mono text-sm">
                  {entry.articleId ? `Art: ${entry.articleId.slice(0, 8)}...` : entry.itemKey || '-'}
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeletingEntry({
                          id: entry.id,
                          description: entry.description || entry.itemKey || 'Eintrag',
                        })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
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
        title="Eintrag löschen"
        description={`Möchten Sie den Eintrag "${deletingEntry?.description}" wirklich löschen?`}
        onConfirm={handleDelete}
        confirmLabel="Löschen"
        variant="destructive"
      />
    </div>
  )
}
