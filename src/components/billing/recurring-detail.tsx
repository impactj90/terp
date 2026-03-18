'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Play, Pencil, Power, PowerOff, Trash2 } from 'lucide-react'
import {
  useBillingRecurringInvoice,
  useBillingRecurringInvoicePreview,
  useActivateBillingRecurringInvoice,
  useDeactivateBillingRecurringInvoice,
  useDeleteBillingRecurringInvoice,
} from '@/hooks'
import { RecurringGenerateDialog } from './recurring-generate-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: 'Monatlich',
  QUARTERLY: 'Quartal',
  SEMI_ANNUALLY: 'Halbjaehrlich',
  ANNUALLY: 'Jaehrlich',
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
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

interface RecurringDetailProps {
  id: string
}

export function RecurringDetail({ id }: RecurringDetailProps) {
  const router = useRouter()
  const { data: rec, isLoading, refetch } = useBillingRecurringInvoice(id)
  const { data: previewData } = useBillingRecurringInvoicePreview(id, !!rec)
  const activateMutation = useActivateBillingRecurringInvoice()
  const deactivateMutation = useDeactivateBillingRecurringInvoice()
  const deleteMutation = useDeleteBillingRecurringInvoice()

  const [showGenerateDialog, setShowGenerateDialog] = React.useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Laden...</div>
  }

  if (!rec) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Vorlage nicht gefunden</div>
  }

  const handleActivate = async () => {
    try {
      await activateMutation.mutateAsync({ id })
      toast.success('Vorlage aktiviert')
      refetch()
    } catch {
      toast.error('Fehler beim Aktivieren')
    }
  }

  const handleDeactivate = async () => {
    try {
      await deactivateMutation.mutateAsync({ id })
      toast.success('Vorlage deaktiviert')
      refetch()
    } catch {
      toast.error('Fehler beim Deaktivieren')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id })
      toast.success('Vorlage geloescht')
      setShowDeleteDialog(false)
      router.push('/orders/recurring')
    } catch {
      toast.error('Fehler beim Loeschen')
    }
  }

  const positions = Array.isArray(rec.positionTemplate)
    ? (rec.positionTemplate as Array<{
        type?: string
        description?: string
        quantity?: number
        unit?: string
        unitPrice?: number
        flatCosts?: number
        vatRate?: number
      }>)
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/orders/recurring')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{rec.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={rec.isActive ? 'default' : 'secondary'}>
                {rec.isActive ? 'Aktiv' : 'Inaktiv'}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {INTERVAL_LABELS[rec.interval] ?? rec.interval}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rec.isActive && (
            <Button onClick={() => setShowGenerateDialog(true)}>
              <Play className="h-4 w-4 mr-1" />
              Rechnung generieren
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push(`/orders/recurring/new?edit=${id}`)}>
            <Pencil className="h-4 w-4 mr-1" />
            Bearbeiten
          </Button>
          {rec.isActive ? (
            <Button variant="outline" onClick={handleDeactivate}>
              <PowerOff className="h-4 w-4 mr-1" />
              Deaktivieren
            </Button>
          ) : (
            <Button variant="outline" onClick={handleActivate}>
              <Power className="h-4 w-4 mr-1" />
              Aktivieren
            </Button>
          )}
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4 mr-1" />
            Loeschen
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <DetailRow label="Kunde" value={(rec.address as { company?: string })?.company ?? '-'} />
              <DetailRow label="Kontakt" value={rec.contact ? `${(rec.contact as { firstName?: string }).firstName ?? ''} ${(rec.contact as { lastName?: string }).lastName ?? ''}`.trim() : '-'} />
              <DetailRow label="Intervall" value={INTERVAL_LABELS[rec.interval] ?? rec.interval} />
              <DetailRow label="Startdatum" value={formatDate(rec.startDate)} />
              <DetailRow label="Enddatum" value={formatDate(rec.endDate)} />
            </div>
            <div>
              <DetailRow label="Naechste Faelligkeit" value={formatDate(rec.nextDueDate)} />
              <DetailRow label="Letzte Generierung" value={formatDate(rec.lastGeneratedAt)} />
              <DetailRow label="Auto-Generierung" value={rec.autoGenerate ? 'Ja' : 'Nein'} />
              <DetailRow label="Zahlungsziel" value={rec.paymentTermDays ? `${rec.paymentTermDays} Tage` : '-'} />
              <DetailRow label="Skonto" value={rec.discountPercent ? `${rec.discountPercent}% / ${rec.discountDays ?? '-'} Tage` : '-'} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions">Positionen</TabsTrigger>
          <TabsTrigger value="preview">Vorschau</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead>Einheit</TableHead>
                    <TableHead className="text-right">Einzelpreis</TableHead>
                    <TableHead className="text-right">MwSt %</TableHead>
                    <TableHead className="text-right">Gesamt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Keine Positionen
                      </TableCell>
                    </TableRow>
                  ) : (
                    positions.map((pos, i) => {
                      const qty = pos.quantity ?? 0
                      const price = pos.unitPrice ?? 0
                      const flat = pos.flatCosts ?? 0
                      const total = qty === 0 && price === 0 && flat === 0 ? null : Math.round((qty * price + flat) * 100) / 100
                      return (
                        <TableRow key={i}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{pos.type === 'ARTICLE' ? 'Artikel' : pos.type === 'TEXT' ? 'Text' : 'Freitext'}</TableCell>
                          <TableCell>{pos.description ?? '-'}</TableCell>
                          <TableCell className="text-right">{pos.quantity ?? '-'}</TableCell>
                          <TableCell>{pos.unit ?? '-'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(pos.unitPrice)}</TableCell>
                          <TableCell className="text-right">{pos.vatRate != null ? `${pos.vatRate}%` : '-'}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(total)}</TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Naechste Rechnung - Vorschau</CardTitle>
            </CardHeader>
            <CardContent>
              {previewData ? (
                <div className="space-y-4">
                  <DetailRow label="Rechnungsdatum" value={formatDate(previewData.nextInvoiceDate)} />
                  <div className="border-t pt-4 space-y-1">
                    <DetailRow label="Netto" value={formatCurrency(previewData.subtotalNet)} />
                    <DetailRow label="MwSt" value={formatCurrency(previewData.totalVat)} />
                    <div className="border-t pt-1">
                      <DetailRow label="Brutto" value={<span className="font-bold">{formatCurrency(previewData.totalGross)}</span>} />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Vorschau wird geladen...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <RecurringGenerateDialog
        templateId={id}
        templateName={rec.name}
        open={showGenerateDialog}
        onOpenChange={setShowGenerateDialog}
        onSuccess={() => refetch()}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Vorlage loeschen"
        description={`Moechten Sie die Vorlage "${rec.name}" wirklich loeschen? Dieser Vorgang kann nicht rueckgaengig gemacht werden.`}
        confirmLabel="Loeschen"
        cancelLabel="Abbrechen"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
