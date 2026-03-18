'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Pencil, Star, Trash2 } from 'lucide-react'
import {
  useBillingPriceList,
  useDeleteBillingPriceList,
  useSetDefaultBillingPriceList,
} from '@/hooks'
import { PriceListFormSheet } from './price-list-form-sheet'
import { PriceListEntriesTable } from './price-list-entries-table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'

function formatDate(date: string | Date | null): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

interface PriceListDetailProps {
  id: string
}

export function PriceListDetail({ id }: PriceListDetailProps) {
  const router = useRouter()
  const { data: pl, isLoading } = useBillingPriceList(id)
  const deleteMutation = useDeleteBillingPriceList()
  const setDefaultMutation = useSetDefaultBillingPriceList()

  const [showEditSheet, setShowEditSheet] = React.useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Laden...</div>
  }

  if (!pl) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Preisliste nicht gefunden</div>
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: pl.id })
      toast.success('Preisliste gelöscht')
      router.push('/orders/price-lists')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Löschen'
      toast.error(message)
    }
  }

  const handleSetDefault = async () => {
    try {
      await setDefaultMutation.mutateAsync({ id: pl.id })
      toast.success('Als Standardpreisliste gesetzt')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler'
      toast.error(message)
    }
  }

  const typedPl = pl as typeof pl & {
    addresses?: Array<{ id: string; number: string; company?: string }>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/orders/price-lists')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Zurück
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{pl.name}</h2>
            {pl.isDefault && (
              <Badge variant="default" className="gap-1">
                <Star className="h-3 w-3 fill-current" />
                Standard
              </Badge>
            )}
            <Badge variant={pl.isActive ? 'default' : 'secondary'}>
              {pl.isActive ? 'Aktiv' : 'Inaktiv'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowEditSheet(true)}>
          <Pencil className="h-4 w-4 mr-1" />
          Bearbeiten
        </Button>
        {!pl.isDefault && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSetDefault}
            disabled={setDefaultMutation.isPending}
          >
            <Star className="h-4 w-4 mr-1" />
            Als Standard setzen
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDeleteDialog(true)}
          className="text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Löschen
        </Button>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {pl.description && (
              <DetailRow label="Beschreibung" value={pl.description} />
            )}
            <DetailRow label="Gültig von" value={formatDate(pl.validFrom)} />
            <DetailRow label="Gültig bis" value={formatDate(pl.validTo)} />
            <DetailRow
              label="Standard"
              value={pl.isDefault ? 'Ja' : 'Nein'}
            />
            <DetailRow
              label="Status"
              value={pl.isActive ? 'Aktiv' : 'Inaktiv'}
            />
          </CardContent>
        </Card>

        {/* Assigned Customers Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zugewiesene Kunden</CardTitle>
          </CardHeader>
          <CardContent>
            {typedPl.addresses && typedPl.addresses.length > 0 ? (
              <ul className="space-y-1">
                {typedPl.addresses.map((addr) => (
                  <li key={addr.id} className="text-sm">
                    <span className="font-mono text-muted-foreground">{addr.number}</span>
                    {' '}
                    {addr.company || '-'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Keine Kunden zugewiesen</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preiseinträge</CardTitle>
        </CardHeader>
        <CardContent>
          <PriceListEntriesTable priceListId={id} />
        </CardContent>
      </Card>

      {/* Dialogs */}
      <PriceListFormSheet
        open={showEditSheet}
        onOpenChange={setShowEditSheet}
        editItem={pl as unknown as Record<string, unknown>}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Preisliste löschen"
        description={`Möchten Sie die Preisliste "${pl.name}" wirklich löschen?`}
        onConfirm={handleDelete}
        confirmLabel="Löschen"
        variant="destructive"
      />
    </div>
  )
}
