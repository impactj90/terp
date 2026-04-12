'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useFinalizeBillingDocument, useSystemSettings } from '@/hooks'
import { usePreviewStockBookings, useConfirmStockBookings } from '@/hooks/use-delivery-note-stock'
import { toast } from 'sonner'

interface DocumentFinalizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  documentNumber: string
  documentType: string
  eInvoiceEnabled?: boolean
  eInvoiceMissingFields?: string[]
}

export function DocumentFinalizeDialog({
  open,
  onOpenChange,
  documentId,
  documentNumber,
  documentType,
  eInvoiceEnabled,
  eInvoiceMissingFields,
}: DocumentFinalizeDialogProps) {
  const finalizeMutation = useFinalizeBillingDocument()
  const isOrderConfirmation = documentType === 'ORDER_CONFIRMATION'
  const isDeliveryNote = documentType === 'DELIVERY_NOTE'

  const [orderName, setOrderName] = React.useState('')
  const [orderDescription, setOrderDescription] = React.useState('')

  // Stock booking state (CONFIRM mode)
  const [showStockConfirmation, setShowStockConfirmation] = React.useState(false)
  const [selectedPositionIds, setSelectedPositionIds] = React.useState<Set<string>>(new Set())
  const [stockBookingDone, setStockBookingDone] = React.useState(false)

  // Fetch system settings to determine delivery note stock mode
  const { data: settings } = useSystemSettings(isDeliveryNote)
  const deliveryNoteStockMode = (settings as Record<string, unknown>)?.deliveryNoteStockMode as string ?? 'MANUAL'

  // Preview stock bookings (enabled only in CONFIRM mode after finalize)
  const { data: stockPreview, isLoading: stockPreviewLoading } = usePreviewStockBookings(
    documentId,
    showStockConfirmation && !stockBookingDone
  )

  const confirmStockBookingsMutation = useConfirmStockBookings()

  // Pre-select all eligible positions when preview data loads
  React.useEffect(() => {
    if (stockPreview?.positions) {
      const eligible = stockPreview.positions
        .filter((p: Record<string, unknown>) => p.stockTrackingEnabled === true)
        .map((p: Record<string, unknown>) => p.positionId as string)
      setSelectedPositionIds(new Set(eligible))
    }
  }, [stockPreview])

  // Reset fields when dialog opens
  React.useEffect(() => {
    if (open) {
      setOrderName('')
      setOrderDescription('')
      setShowStockConfirmation(false)
      setSelectedPositionIds(new Set())
      setStockBookingDone(false)
    }
  }, [open])

  const togglePosition = (positionId: string) => {
    setSelectedPositionIds(prev => {
      const next = new Set(prev)
      if (next.has(positionId)) {
        next.delete(positionId)
      } else {
        next.add(positionId)
      }
      return next
    })
  }

  const handleFinalize = async () => {
    try {
      const result = await finalizeMutation.mutateAsync({
        id: documentId,
        ...(isOrderConfirmation && orderName.trim()
          ? { orderName: orderName.trim(), orderDescription: orderDescription.trim() || undefined }
          : {}),
      })

      // Handle AUTO mode stock booking result
      if (isDeliveryNote && deliveryNoteStockMode === 'AUTO') {
        const stockResult = (result as Record<string, unknown>)?.stockBookingResult as
          { bookedCount: number } | undefined
        if (stockResult && stockResult.bookedCount > 0) {
          toast.success(`Beleg abgeschlossen — Lagerbuchung fuer ${stockResult.bookedCount} Artikel durchgefuehrt`)
        } else {
          toast.success('Beleg erfolgreich abgeschlossen')
        }
        onOpenChange(false)
        return
      }

      // Handle CONFIRM mode — show stock confirmation section
      if (isDeliveryNote && deliveryNoteStockMode === 'CONFIRM') {
        toast.success('Beleg erfolgreich abgeschlossen')
        setShowStockConfirmation(true)
        return
      }

      // Standard success messages
      const isEInvoiceType = documentType === 'INVOICE' || documentType === 'CREDIT_NOTE'
      if (isOrderConfirmation && orderName.trim()) {
        toast.success('Beleg abgeschlossen und Auftrag erstellt')
      } else if (eInvoiceEnabled && isEInvoiceType) {
        toast.success('Beleg abgeschlossen — E-Rechnung steht zum Download bereit')
      } else {
        toast.success('Beleg erfolgreich abgeschlossen')
      }
      onOpenChange(false)
    } catch {
      toast.error('Fehler beim Abschließen')
    }
  }

  const handleConfirmStockBookings = async () => {
    try {
      const positionIds = Array.from(selectedPositionIds)
      const result = await confirmStockBookingsMutation.mutateAsync({
        id: documentId,
        positionIds,
      })
      const bookedCount = (result as Record<string, unknown>)?.bookedCount ?? positionIds.length
      toast.success(`Lagerbuchung fuer ${bookedCount} Artikel durchgefuehrt`)
      setStockBookingDone(true)
      onOpenChange(false)
    } catch {
      toast.error('Fehler bei der Lagerbuchung')
    }
  }

  const handleSkipStockBookings = () => {
    onOpenChange(false)
  }

  // Stock confirmation view (after finalize in CONFIRM mode)
  if (showStockConfirmation) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lagerbuchung bestaetigen</DialogTitle>
            <DialogDescription>
              Lieferschein {documentNumber} wurde abgeschlossen. Waehlen Sie die Positionen fuer die Lagerbuchung.
            </DialogDescription>
          </DialogHeader>

          {stockPreviewLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">Positionen werden geladen...</span>
            </div>
          ) : stockPreview?.positions && stockPreview.positions.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Artikel-Nr.</TableHead>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead className="text-right">Bestand aktuell</TableHead>
                    <TableHead className="text-right">Bestand neu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockPreview.positions.map((pos: Record<string, unknown>) => {
                    const posId = pos.positionId as string
                    const enabled = pos.stockTrackingEnabled === true
                    const negative = pos.negativeStockWarning === true
                    return (
                      <TableRow
                        key={posId}
                        className={!enabled ? 'opacity-50' : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedPositionIds.has(posId)}
                            onCheckedChange={() => togglePosition(posId)}
                            disabled={!enabled}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {pos.articleNumber as string}
                        </TableCell>
                        <TableCell>
                          {pos.articleName as string}
                          {!enabled && (
                            <span className="ml-2 text-xs text-muted-foreground">(keine Bestandsfuehrung)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {pos.quantity as number} {pos.unit as string}
                        </TableCell>
                        <TableCell className="text-right">
                          {(pos.currentStock as number).toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-right ${negative ? 'text-destructive font-medium' : ''}`}>
                          {enabled ? (pos.projectedStock as number).toFixed(2) : '-'}
                          {negative && (
                            <AlertTriangle className="inline-block ml-1 h-3.5 w-3.5" />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              Keine Artikelpositionen mit Bestandsfuehrung gefunden.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleSkipStockBookings}>
              Ueberspringen
            </Button>
            <Button
              onClick={handleConfirmStockBookings}
              disabled={confirmStockBookingsMutation.isPending || selectedPositionIds.size === 0}
            >
              {confirmStockBookingsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird gebucht...
                </>
              ) : (
                `Lagerbuchung durchfuehren (${selectedPositionIds.size})`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Standard finalize dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Beleg abschließen</DialogTitle>
          <DialogDescription>
            Beleg {documentNumber} abschließen und festschreiben.
          </DialogDescription>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Nach dem Abschließen ist der Beleg unveränderbar. Positionen und Kopfdaten können nicht mehr bearbeitet werden.
          </AlertDescription>
        </Alert>

        {eInvoiceEnabled && (documentType === 'INVOICE' || documentType === 'CREDIT_NOTE') && eInvoiceMissingFields && eInvoiceMissingFields.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">E-Rechnung: Pflichtfelder fehlen</p>
              <p className="text-sm mt-1">
                {eInvoiceMissingFields.join(', ')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Die E-Rechnung (XML) wird nicht erstellt. Der Beleg wird trotzdem abgeschlossen und das PDF generiert.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {isOrderConfirmation && (
          <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
            <div>
              <p className="text-sm font-medium">Auftrag für Zeiterfassung erstellen</p>
              <p className="text-xs text-muted-foreground">
                Optional: Erstellen Sie einen Terp-Auftrag, auf den Mitarbeiter Zeit buchen können.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderName">Auftragsbezeichnung</Label>
              <Input
                id="orderName"
                value={orderName}
                onChange={(e) => setOrderName(e.target.value)}
                placeholder="z.B. Beratungsprojekt Mustermann"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderDescription">Beschreibung (optional)</Label>
              <Input
                id="orderDescription"
                value={orderDescription}
                onChange={(e) => setOrderDescription(e.target.value)}
                placeholder="z.B. Sollstunden: 40h, Montage + Dokumentation"
              />
            </div>
          </div>
        )}

        {isDeliveryNote && deliveryNoteStockMode === 'CONFIRM' && (
          <Alert>
            <AlertDescription>
              <p className="text-sm">
                Nach dem Abschliessen wird ein Dialog zur Bestaetigung der Lagerbuchungen angezeigt.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {isDeliveryNote && deliveryNoteStockMode === 'AUTO' && (
          <Alert>
            <AlertDescription>
              <p className="text-sm">
                Beim Abschliessen werden automatisch Lagerentnahmen fuer alle Artikelpositionen mit Bestandsfuehrung erstellt.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleFinalize}
            disabled={finalizeMutation.isPending}
          >
            {finalizeMutation.isPending ? 'Wird abgeschlossen...' : 'Abschließen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
